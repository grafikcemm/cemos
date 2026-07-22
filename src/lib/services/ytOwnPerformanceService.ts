/**
 * YouTube own-video performance learning (Öğrenme Motoru v3 — araştırma F).
 * `ytOutcome` formülünü uyandırır: KENDİ kanalın videolarını public Data API
 * ile çeker (OAuth YOK — views/publishedAt/duration public), Shorts ve
 * long-form havuzlarını AYRI medyanla kıyaslar, sonucu FeedbackEvent +
 * TrainingExample olarak öğrenme döngüsüne yazar.
 *
 * Veri modeli: yeni tablo YOK — kendi kanal YtChannel(isCompetitor:false,
 * discoveredFrom:"own", enabled:false → rakip sync'i dokunmaz), videolar
 * mevcut YtVideo'ya upsert edilir.
 *
 * Env (yoksa kol tamamen no-op — Meta env kalıbının aynısı):
 *   YT_OWN_CHANNEL_GRAFIKCEM="@grafikcem"     # kanal @handle'ı
 *   YT_OWN_CHANNEL_MASKULENKOD="@..."
 *   YT_OUTCOME_HIGH=0.5   # ytOutcome >= → engagement_high
 *   YT_OUTCOME_LOW=-0.5   # ytOutcome <= → engagement_low (72s olgunluk şartıyla)
 *
 * Idempotent: videoId başına tek verdict (FeedbackEvent.reason JSON'undaki
 * videoId — IG syncInstagram kalıbının birebir aynısı). Tamamen fail-soft.
 */
import { prisma } from "@/lib/db/client";
import { ytChannelRepo } from "@/lib/db/ytChannelRepo";
import { ytVideoRepo } from "@/lib/db/ytVideoRepo";
import { feedbackEventRepo } from "@/lib/db/feedbackEventRepo";
import { trainingExampleRepo } from "@/lib/db/trainingExampleRepo";
import { embedTrainingExample } from "@/lib/growth-engine/vector-memory";
import { resolveHandle, listUploads, batchVideoStats } from "@/lib/youtube/ytClient";
import { computeViewsPerDay, computeRollingMedianVpd } from "@/lib/youtube/outlier";
import { ytOutcome } from "@/lib/learning/engagement-formulas";
import { isYouTubeConfigured } from "@/lib/youtube/ytConfig";
import { safeJsonParse } from "@/lib/growth-engine/types";
import { redactError } from "@/lib/utils/redactSecrets";

const OWN_HANDLES = ["grafikcem", "maskulenkod"] as const;
type OwnHandle = (typeof OWN_HANDLES)[number];

const UPLOADS_TO_FETCH = 30;
const MEDIAN_WINDOW_MS = 90 * 86_400_000;
// LOW verdict'i için video en az bu kadar eski olmalı — ilk günlerin VPD'si gürültülü.
const LOW_VERDICT_MATURITY_MS = 72 * 60 * 60 * 1000;

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export type OwnVideoForJudge = {
  videoId: string;
  title: string;
  url: string;
  isShort: boolean;
  viewsPerDay: number;
  publishedAtMs: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
};

export type OwnVideoVerdict = {
  video: OwnVideoForJudge;
  outcome: number;
  poolMedianVpd: number;
  verdict: "engagement_high" | "engagement_low" | null;
};

/**
 * SAF: videoları Shorts / long-form havuzlarına ayır, havuz medyanlarını AYRI
 * hesapla (araştırma şartı — tek medyan iki formatı birbirine ezer) ve her
 * videoya ytOutcome verdict'i ver. I/O yok → deterministik test edilir.
 */
export function judgeOwnVideos(
  videos: OwnVideoForJudge[],
  opts: { nowMs: number; highMin: number; lowMax: number }
): OwnVideoVerdict[] {
  const windowStart = opts.nowMs - MEDIAN_WINDOW_MS;
  const inWindow = videos.filter((v) => v.publishedAtMs >= windowStart);
  const shortsMedian = computeRollingMedianVpd(
    inWindow.filter((v) => v.isShort).map((v) => v.viewsPerDay)
  );
  const longMedian = computeRollingMedianVpd(
    inWindow.filter((v) => !v.isShort).map((v) => v.viewsPerDay)
  );

  return videos.map((video) => {
    const poolMedianVpd = video.isShort ? shortsMedian : longMedian;
    const outcome = ytOutcome(video.viewsPerDay, poolMedianVpd);
    let verdict: OwnVideoVerdict["verdict"] = null;
    if (poolMedianVpd > 0) {
      const ageMs = opts.nowMs - video.publishedAtMs;
      if (outcome >= opts.highMin) {
        verdict = "engagement_high";
      } else if (outcome <= opts.lowMax && ageMs >= LOW_VERDICT_MATURITY_MS) {
        verdict = "engagement_low";
      }
    }
    return { video, outcome: Math.round(outcome * 100) / 100, poolMedianVpd, verdict };
  });
}

export type YtOwnSyncSummary = {
  configured: boolean;
  channels: number;
  videosUpserted: number;
  highs: number;
  lows: number;
  trainingExamples: number;
  skippedExisting: number;
  errors: number;
  reason?: string;
};

async function syncOwnChannel(
  handle: OwnHandle,
  envValue: string,
  summary: YtOwnSyncSummary
): Promise<void> {
  const account = await prisma.account.findUnique({ where: { handle } });
  if (!account) return;

  // Kanal kaydı: önce DB'deki "own" satırını dene (resolve quota'sını biriktirme),
  // yoksa @handle'ı bir kez resolve edip yaz.
  let channel = await prisma.ytChannel.findFirst({
    where: { discoveredFrom: "own", handle: envValue },
  });
  if (!channel) {
    const r = await resolveHandle(envValue);
    if (!r.ok || !r.data) {
      summary.errors++;
      return;
    }
    channel = await ytChannelRepo.upsertByChannelId({
      channelId: r.data.channelId,
      handle: envValue,
      title: r.data.title,
      subscriberCount: r.data.subscriberCount,
      videoCount: r.data.videoCount,
      viewCountTotal: r.data.viewCountTotal,
      uploadsPlaylistId: r.data.uploadsPlaylistId,
      category: "own",
      isCompetitor: false, // rakip radar/outlier akışına girmez
      discoveredFrom: "own",
      enabled: false, // syncCompetitors'ın enabled taraması da atlasın
    });
  }
  summary.channels++;

  const uploads = await listUploads(channel.uploadsPlaylistId, { maxResults: UPLOADS_TO_FETCH });
  const ids = uploads.data.map((u) => u.videoId).filter(Boolean);
  if (ids.length === 0) return;
  const stats = await batchVideoStats(ids);

  const now = Date.now();
  const candidates: OwnVideoForJudge[] = [];
  for (const v of stats.data) {
    const publishedAtMs = v.publishedAt ? Date.parse(v.publishedAt) : now;
    const viewsPerDay = computeViewsPerDay(v.viewCount, publishedAtMs, now);
    try {
      await ytVideoRepo.upsertByVideoId({
        videoId: v.videoId,
        channelId: channel.channelId,
        title: v.title,
        description: v.description,
        publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
        durationSec: v.durationSec,
        isShort: v.isShort,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        commentCount: v.commentCount,
        viewsPerDay,
        outlierScore: 0, // own video — rakip fırsat akışına skor üretmez
      });
      summary.videosUpserted++;
    } catch {
      summary.errors++;
    }
    candidates.push({
      videoId: v.videoId,
      title: v.title,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
      isShort: v.isShort,
      viewsPerDay,
      publishedAtMs,
      viewCount: v.viewCount,
      likeCount: v.likeCount,
      commentCount: v.commentCount,
    });
  }

  // Idempotency: bu hesapta zaten verdict almış videoId'leri atla.
  const existing = await prisma.feedbackEvent.findMany({
    where: { accountId: account.id, platform: "youtube", feedbackType: { startsWith: "engagement" } },
    select: { reason: true },
  });
  const judged = new Set<string>();
  for (const e of existing) {
    const parsed = safeJsonParse<{ videoId?: string }>(e.reason, {});
    if (parsed.videoId) judged.add(parsed.videoId);
  }

  const verdicts = judgeOwnVideos(candidates, {
    nowMs: now,
    highMin: envFloat("YT_OUTCOME_HIGH", 0.5),
    lowMax: envFloat("YT_OUTCOME_LOW", -0.5),
  });

  for (const { video, outcome, poolMedianVpd, verdict } of verdicts) {
    if (!verdict) continue;
    if (judged.has(video.videoId)) {
      summary.skippedExisting++;
      continue;
    }
    try {
      const metrics = {
        videoId: video.videoId,
        url: video.url,
        isShort: video.isShort,
        vpd: Math.round(video.viewsPerDay * 100) / 100,
        poolMedianVpd: Math.round(poolMedianVpd * 100) / 100,
        outcome,
        views: video.viewCount,
        likes: video.likeCount,
        comments: video.commentCount,
      };
      await feedbackEventRepo.create({
        accountId: account.id,
        platform: "youtube",
        feedbackType: verdict,
        originalContent: video.title,
        reason: JSON.stringify(metrics),
      });
      if (verdict === "engagement_high") {
        summary.highs++;
        const example = await trainingExampleRepo.create({
          accountId: account.id,
          inputType: "yt_own_video", // platformDerive: yt_ → youtube
          sourceContent: video.url,
          outputContent: video.title,
          label: "good",
          reason: `Kanal medyanını aştı: outcome ${outcome} (VPD ${metrics.vpd} vs havuz medyanı ${metrics.poolMedianVpd}, ${video.isShort ? "Shorts" : "long-form"})`,
          metricsJson: metrics,
        });
        summary.trainingExamples++;
        await embedTrainingExample(example.id).catch(() => {
          /* embedding best-effort */
        });
      } else {
        summary.lows++;
      }
    } catch (err) {
      console.error(`YT own engagement: ${video.videoId} işlenirken hata:`, redactError(err));
      summary.errors++;
    }
  }
}

export const ytOwnPerformanceService = {
  /** 18:00 learn cron adımı. Env'siz hesap atlanır; her şey fail-soft. */
  async sync(): Promise<YtOwnSyncSummary> {
    const summary: YtOwnSyncSummary = {
      configured: false,
      channels: 0,
      videosUpserted: 0,
      highs: 0,
      lows: 0,
      trainingExamples: 0,
      skippedExisting: 0,
      errors: 0,
    };

    const targets = OWN_HANDLES.map((h) => ({
      handle: h,
      env: process.env[`YT_OWN_CHANNEL_${h.toUpperCase()}`]?.trim() || "",
    })).filter((t) => t.env !== "");

    if (targets.length === 0) {
      summary.reason = "no_own_channel_env";
      return summary;
    }
    if (!isYouTubeConfigured()) {
      summary.reason = "youtube_not_configured";
      return summary;
    }
    summary.configured = true;

    for (const t of targets) {
      try {
        await syncOwnChannel(t.handle, t.env, summary);
      } catch (err) {
        console.error(`YT own sync: @${t.handle} işlenirken hata:`, redactError(err));
        summary.errors++;
      }
    }

    summary.reason = summary.highs + summary.lows === 0 ? "no_verdicts" : "synced";
    return summary;
  },
};
