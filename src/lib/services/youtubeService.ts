/**
 * YouTube Fırsat Motoru servis katmanı (Faz C).
 *  - seedChannels: yt-seed-channels.json → resolveHandle → upsert (idempotent)
 *  - syncCompetitors: deadline'lı, LLM'siz; outlier skorları yazar (cron stage)
 *  - briefForVideo: transcript + 5-aşama konsey (on-demand)
 *  - recordFeedback: durum → FeedbackEvent (+ "recorded" → PublishLog), platform:"youtube"
 *
 * DİKKAT: search.list (discovery, 100u) BURADA import EDİLMEZ — rutin sync ucuz kalır.
 */

import seedData from "@/data/yt-seed-channels.json";
import { prisma } from "@/lib/db/client";
import { ytChannelRepo } from "@/lib/db/ytChannelRepo";
import { ytVideoRepo } from "@/lib/db/ytVideoRepo";
import { ytBriefRepo, type UpdateYtBriefInput } from "@/lib/db/ytBriefRepo";
import { feedbackEventRepo } from "@/lib/db/feedbackEventRepo";
import { publishLogRepo } from "@/lib/db/publishLogRepo";
import { resolveHandle, listUploads, batchVideoStats } from "@/lib/youtube/ytClient";
import {
  computeViewsPerDay,
  computeRollingMedianVpd,
  computeOutlierScore,
  computeLikeRatio,
} from "@/lib/youtube/outlier";
import { fetchTranscript } from "@/lib/youtube/transcript";
import { generateBrief, type GenerateBriefResult } from "@/lib/youtube/brief-generator";
import { OUTLIER, isYouTubeConfigured } from "@/lib/youtube/ytConfig";
import type { SeedChannel } from "@/lib/youtube/ytTypes";

const SEED = seedData as SeedChannel[];
const WINDOW_MS = OUTLIER.ROLLING_WINDOW_DAYS * 86_400_000;
const UPLOADS_PER_CHANNEL = 30;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** YouTube attribution hesabı (kullanıcı kararı: mevcut @grafikcem reuse). */
async function resolveYoutubeAccountId(): Promise<string | null> {
  const acc = await prisma.account.findUnique({ where: { handle: "grafikcem" } });
  return acc?.id ?? null;
}

async function seedChannels(deadlineMs: number): Promise<{
  seeded: number;
  skipped: number;
  failed: number;
}> {
  if (!isYouTubeConfigured()) return { seeded: 0, skipped: 0, failed: 0 };
  const stop = Date.now() + deadlineMs;
  const existing = new Set((await ytChannelRepo.existingHandles()).map((h) => h.toLowerCase()));
  let seeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of SEED) {
    if (existing.has(entry.handle.toLowerCase())) {
      skipped++;
      continue;
    }
    if (Date.now() > stop) break;
    const r = await resolveHandle(entry.handle);
    if (!r.ok || !r.data) {
      failed++;
      continue;
    }
    try {
      await ytChannelRepo.upsertByChannelId({
        channelId: r.data.channelId,
        handle: entry.handle,
        title: r.data.title,
        subscriberCount: r.data.subscriberCount,
        videoCount: r.data.videoCount,
        viewCountTotal: r.data.viewCountTotal,
        uploadsPlaylistId: r.data.uploadsPlaylistId,
        category: entry.category,
        isCompetitor: true,
        discoveredFrom: "seed",
        enabled: true,
      });
      existing.add(entry.handle.toLowerCase());
      seeded++;
    } catch {
      failed++;
    }
  }
  return { seeded, skipped, failed };
}

export type SyncResult = {
  configured: boolean;
  seeded: number;
  channelsSynced: number;
  videosUpserted: number;
  quotaUnitsUsed: number;
  skippedForDeadline: number;
  errors: number;
};

export const youtubeService = {
  seedChannels,

  /** Cron stage + manuel /sync. Deadline'a kadar enabled rakipleri tarar (fail-open). */
  async syncCompetitors(opts: { deadlineMs: number }): Promise<SyncResult> {
    if (!isYouTubeConfigured()) {
      return {
        configured: false,
        seeded: 0,
        channelsSynced: 0,
        videosUpserted: 0,
        quotaUnitsUsed: 0,
        skippedForDeadline: 0,
        errors: 0,
      };
    }

    const stop = Date.now() + opts.deadlineMs;
    let quotaUnitsUsed = 0;
    let channelsSynced = 0;
    let videosUpserted = 0;
    let skippedForDeadline = 0;
    let errors = 0;
    let seeded = 0;

    // İlk kez: tablo boşsa seed (idempotent; sonraki sync'lerde atlanır).
    try {
      const count = await ytChannelRepo.count();
      const remain = stop - Date.now();
      if (count === 0 && remain > 0) {
        seeded = (await seedChannels(remain)).seeded;
      }
    } catch (e) {
      errors++;
      console.error("YouTube seed hatası:", errMsg(e));
    }

    const channels = await ytChannelRepo.listEnabledCompetitors();
    const now = Date.now();

    for (const ch of channels) {
      if (Date.now() >= stop) {
        skippedForDeadline++;
        continue;
      }
      try {
        const uploads = await listUploads(ch.uploadsPlaylistId, { maxResults: UPLOADS_PER_CHANNEL });
        quotaUnitsUsed += uploads.quotaUnits;
        const ids = uploads.data.map((u) => u.videoId).filter(Boolean);
        if (ids.length === 0) {
          await ytChannelRepo.markSynced(ch.channelId, { rollingMedianVpd: ch.rollingMedianVpd });
          channelsSynced++;
          continue;
        }

        const stats = await batchVideoStats(ids);
        quotaUnitsUsed += stats.quotaUnits;

        const withVpd = stats.data.map((v) => {
          const publishedAtMs = v.publishedAt ? Date.parse(v.publishedAt) : now;
          const viewsPerDay = computeViewsPerDay(v.viewCount, publishedAtMs, now);
          return { v, publishedAtMs, viewsPerDay };
        });

        const windowVpds = withVpd
          .filter((x) => now - x.publishedAtMs <= WINDOW_MS)
          .map((x) => x.viewsPerDay);
        const median = computeRollingMedianVpd(windowVpds);

        for (const { v, publishedAtMs, viewsPerDay } of withVpd) {
          const likeRatio = computeLikeRatio(v.likeCount, v.viewCount);
          const outlierScore = computeOutlierScore({
            viewsPerDay,
            rollingMedianVpd: median,
            publishedAtMs,
            nowMs: now,
            likeRatio,
          });
          await ytVideoRepo.upsertByVideoId({
            videoId: v.videoId,
            channelId: ch.channelId,
            title: v.title,
            description: v.description,
            publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
            durationSec: v.durationSec,
            isShort: v.isShort,
            viewCount: v.viewCount,
            likeCount: v.likeCount,
            commentCount: v.commentCount,
            viewsPerDay,
            outlierScore,
            likeRatio,
          });
          videosUpserted++;
        }

        await ytChannelRepo.markSynced(ch.channelId, { rollingMedianVpd: median });
        channelsSynced++;
      } catch (e) {
        errors++;
        await ytChannelRepo.markError(ch.channelId, errMsg(e));
      }
    }

    return {
      configured: true,
      seeded,
      channelsSynced,
      videosUpserted,
      quotaUnitsUsed,
      skippedForDeadline,
      errors,
    };
  },

  /** On-demand: transcript çek + 5-aşama konsey; video'yu briefed işaretle. */
  async briefForVideo(videoId: string): Promise<GenerateBriefResult> {
    const video = await ytVideoRepo.getByVideoId(videoId);
    if (!video) throw new Error("video_not_found");
    const channel = await prisma.ytChannel.findUnique({ where: { channelId: video.channelId } });
    const transcript = await fetchTranscript(videoId);
    const accountId = await resolveYoutubeAccountId();

    const result = await generateBrief({
      video: {
        videoId,
        title: video.title,
        description: video.description,
        channelTitle: channel?.title ?? "",
        category: channel?.category ?? "global",
      },
      transcript,
      accountId: accountId ?? undefined,
    });

    await ytVideoRepo.setStatus(videoId, "briefed");
    return result;
  },

  /**
   * Brief durum değişikliği → FeedbackEvent (platform:"youtube"); "recorded"
   * ("Çektim") ayrıca PublishLog yazar. Yazma API yok — sadece kayıt.
   */
  async recordFeedback(
    briefId: string,
    status: string,
    extra?: { editedScript?: string; feedbackNote?: string }
  ) {
    const brief = await ytBriefRepo.getById(briefId);
    if (!brief) throw new Error("brief_not_found");

    const update: UpdateYtBriefInput = { status };
    if (extra?.editedScript !== undefined) update.editedScript = extra.editedScript;
    if (extra?.feedbackNote !== undefined) update.feedbackNote = extra.feedbackNote;
    const updated = await ytBriefRepo.update(briefId, update);

    const accountId = await resolveYoutubeAccountId();
    if (accountId) {
      await feedbackEventRepo.create({
        accountId,
        feedbackType: status,
        platform: "youtube",
        originalContent: brief.fullScript || "",
        editedContent: extra?.editedScript ?? "",
        reason: extra?.feedbackNote ?? "",
      });
      if (status === "recorded") {
        await publishLogRepo.create({
          accountId,
          content: extra?.editedScript || brief.fullScript || "",
          platform: "youtube",
          success: true,
        });
      }
    }

    return updated;
  },
};
