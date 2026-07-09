import { prisma } from "@/lib/db/client";
import { fetchUserTweets, calculateCost, type SocialDataTweet } from "@/lib/socialdata";
import { isNearDuplicate } from "@/lib/utils/textSimilarity";
import { feedbackEventRepo } from "@/lib/db/feedbackEventRepo";
import { trainingExampleRepo } from "@/lib/db/trainingExampleRepo";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
import { performanceRepo } from "@/lib/db/performanceRepo";
import { usageService } from "@/lib/services/usageService";
import { embedTrainingExample } from "@/lib/growth-engine/vector-memory";
import { safeJsonParse } from "@/lib/growth-engine/types";
import { igInsightSnapshotRepo } from "@/lib/db/igInsightSnapshotRepo";
import { xEngagement, igEngagement } from "@/lib/learning/engagement-formulas";
import type { MediaInsightItem } from "@/lib/instagram/insight-pipeline";
import type { AccountHandle } from "@/lib/accounts";

// Drafts published in this window are candidates for engagement matching.
const CANDIDATE_WINDOW_DAYS = 14;
const CANDIDATE_TAKE = 30;
// A tweet must be at least this old before a LOW verdict — engagement needs time.
const LOW_VERDICT_MATURITY_MS = 48 * 60 * 60 * 1000;
// Draft ↔ own-tweet match threshold (manual publish → no tweet-id linkage exists).
const MATCH_THRESHOLD = 0.7;
// Conservative pattern nudges; viralPatternRepo clamps to [10, 95].
const PATTERN_DELTA_HIGH = 3;
const PATTERN_DELTA_LOW = -2;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Tweet yaşını PerformanceSnapshot pencere kovasına eşler (idempotent key). */
function ageToWindow(ageMs: number): string {
  const h = ageMs / 3_600_000;
  if (h < 3) return "1h";
  if (h < 12) return "6h";
  if (h < 48) return "24h";
  if (h < 24 * 5) return "3d";
  if (h < 24 * 14) return "7d";
  return "30d";
}

export type EngagementSyncSummary = {
  handle: string;
  candidates: number;
  tweetsFetched: number;
  matched: number;
  highs: number;
  lows: number;
  patternsAdjusted: number;
  snapshots: number;
  skippedExisting: number;
  errors: number;
  reason?: string;
};

export type IgEngagementSyncSummary = {
  snapshotDate: string | null;
  mediaConsidered: number;
  highs: number;
  lows: number;
  patternsAdjusted: number;
  trainingExamples: number;
  skippedExisting: number;
  errors: number;
  reason?: string;
};

function engagementScore(t: SocialDataTweet): number {
  return xEngagement({
    likeCount: t.likeCount,
    retweetCount: t.retweetCount,
    replyCount: t.replyCount,
  });
}

/**
 * xpatla-style closed learning loop: once a day, read the account's OWN recent
 * tweets, match them back to the drafts this system produced (text similarity —
 * publishing is manual/dry-run so no tweet id exists), and convert real
 * engagement into FeedbackEvents + TrainingExamples + ViralPattern re-weights.
 * Everything is fail-soft and idempotent per queue item.
 */
export const engagementLearningService = {
  async syncForAccount(handle: AccountHandle): Promise<EngagementSyncSummary> {
    const summary: EngagementSyncSummary = {
      handle,
      candidates: 0,
      tweetsFetched: 0,
      matched: 0,
      highs: 0,
      lows: 0,
      patternsAdjusted: 0,
      snapshots: 0,
      skippedExisting: 0,
      errors: 0,
    };

    const account = await prisma.account.findUnique({ where: { handle } });
    if (!account) {
      summary.reason = "account_not_found";
      return summary;
    }

    const windowStart = new Date(Date.now() - CANDIDATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const items = await prisma.queueItem.findMany({
      where: {
        accountId: account.id,
        status: { in: ["published", "manual_published", "approved"] },
        updatedAt: { gte: windowStart },
      },
      orderBy: { updatedAt: "desc" },
      take: CANDIDATE_TAKE,
      select: { id: true, content: true, editedContent: true, scores: true },
    });
    summary.candidates = items.length;

    // Zero-cost early exit: never spend a SocialData call with nothing to match.
    if (items.length === 0) {
      summary.reason = "no_candidates";
      return summary;
    }

    // Idempotency: skip items that already received an engagement verdict.
    const existingEvents = await prisma.feedbackEvent.findMany({
      where: {
        queueItemId: { in: items.map((i) => i.id) },
        feedbackType: { startsWith: "engagement" },
      },
      select: { queueItemId: true },
    });
    const alreadyJudged = new Set(existingEvents.map((e) => e.queueItemId));
    const pending = items.filter((i) => !alreadyJudged.has(i.id));
    summary.skippedExisting = items.length - pending.length;
    if (pending.length === 0) {
      summary.reason = "all_already_judged";
      return summary;
    }

    let tweets: SocialDataTweet[];
    try {
      const result = await fetchUserTweets(account.handle, 20);
      tweets = result.tweets;
      summary.tweetsFetched = tweets.length;
      const billedItems = tweets.length + (result.lookupPerformed ? 1 : 0);
      await usageService
        .recordScan({
          accountId: account.id,
          tweetCount: tweets.length,
          estimatedCostUsd: calculateCost(billedItems),
        })
        .catch((err) => console.error("Engagement scan maliyeti kaydedilemedi:", err));
    } catch (err) {
      console.error(`Engagement sync: @${handle} tweetleri alınamadı:`, err);
      summary.errors++;
      summary.reason = "timeline_fetch_failed";
      return summary;
    }

    // Per-account override (örn. ENGAGEMENT_HIGH_MIN_GRAFIKCEM=300) — yoksa
    // global env, o da yoksa kod default'u. 94K hesapla küçük hesap aynı
    // "başarı" eşiğiyle ölçülmesin diye (2026 araştırma kalibrasyonu).
    const handleKey = handle.toUpperCase();
    const highMin = envInt(`ENGAGEMENT_HIGH_MIN_${handleKey}`, envInt("ENGAGEMENT_HIGH_MIN", 15));
    const lowMax = envInt(`ENGAGEMENT_LOW_MAX_${handleKey}`, envInt("ENGAGEMENT_LOW_MAX", 2));

    // Provenance join for performance snapshots: which of these drafts were
    // actually recorded as PublishedPost (manual-publish ledger). Loaded once so
    // the match loop can attach real engagement without an extra query per item.
    const publishedByItem = await performanceRepo
      .findByDraftQueueItemIds(pending.map((i) => i.id))
      .catch(() => new Map());

    for (const item of pending) {
      try {
        const itemText = item.editedContent || item.content;
        const tweet = tweets.find((t) => isNearDuplicate(itemText, t.text, MATCH_THRESHOLD));
        if (!tweet) continue;
        summary.matched++;

        const score = engagementScore(tweet);
        const tweetAgeMs = Date.now() - new Date(tweet.createdAt).getTime();

        let verdict: "engagement_high" | "engagement_low" | null = null;
        if (score >= highMin) {
          verdict = "engagement_high";
        } else if (score <= lowMax && tweetAgeMs >= LOW_VERDICT_MATURITY_MS) {
          verdict = "engagement_low";
        }
        if (!verdict) continue; // still maturing — re-checked on a later sync

        const metrics = {
          tweetId: tweet.id,
          likes: tweet.likeCount,
          retweets: tweet.retweetCount,
          replies: tweet.replyCount,
          views: tweet.viewCount,
          engagement: score,
        };

        // Performance ledger: if this draft was published (PublishedPost exists),
        // record a maturity-windowed snapshot of its REAL engagement. Rank-based
        // lessonGate consumes normalizedScore, so the raw engagement score is a
        // valid ordinal — no self-baseline normalization needed here. Idempotent
        // per (post, window). Best-effort; never breaks the engagement verdict.
        const published = publishedByItem.get(item.id);
        if (published) {
          const win = ageToWindow(tweetAgeMs);
          const ok = await performanceRepo
            .upsertSnapshot({
              publishedPostId: published.id,
              window: win,
              metrics,
              normalizedScore: score,
            })
            .then(() => true)
            .catch(() => false);
          if (ok) summary.snapshots++;
        }

        await feedbackEventRepo.create({
          accountId: account.id,
          queueItemId: item.id,
          feedbackType: verdict,
          originalContent: tweet.text,
          reason: JSON.stringify(metrics),
        });
        if (verdict === "engagement_high") summary.highs++;
        else summary.lows++;

        // Re-weight exactly the patterns this draft was grounded on.
        const scores = safeJsonParse<Record<string, unknown>>(item.scores, {});
        const patternIds = Array.isArray(scores.groundingPatternIds)
          ? (scores.groundingPatternIds as unknown[]).filter((v): v is string => typeof v === "string")
          : [];
        const delta = verdict === "engagement_high" ? PATTERN_DELTA_HIGH : PATTERN_DELTA_LOW;
        for (const patternId of patternIds) {
          const updated = await viralPatternRepo.adjustSuccessScore(patternId, delta);
          if (updated) summary.patternsAdjusted++;
        }

        // High performers become positive training signal for future drafts.
        if (verdict === "engagement_high") {
          const example = await trainingExampleRepo.create({
            accountId: account.id,
            inputType: "engagement_metric",
            sourceContent: tweet.url,
            outputContent: itemText,
            label: "good",
            reason: `Gerçek etkileşim: ${score} (beğeni ${tweet.likeCount}, RT ${tweet.retweetCount}, yanıt ${tweet.replyCount})`,
            metricsJson: metrics,
          });
          await embedTrainingExample(example.id).catch(() => {
            /* embedding is best-effort */
          });
        }
      } catch (err) {
        console.error(`Engagement sync: ${item.id} işlenirken hata:`, err);
        summary.errors++;
      }
    }

    summary.reason = summary.matched === 0 ? "no_matches" : "synced";
    return summary;
  },

  /**
   * Instagram engagement arm (Faz F). The daily IG insight snapshot already
   * holds OUR account's top media + their real metrics, so — unlike the X loop
   * which has to match drafts back to tweets — we read performance directly.
   * For each top media: igEngagement → HIGH/LOW verdict → FeedbackEvent
   * (platform "instagram"), nudge any IG ViralPattern whose exemplar caption
   * resembles the media caption, and bank high performers as training signal.
   * Global (one IG account), fully fail-soft, idempotent per mediaId.
   */
  async syncInstagram(): Promise<IgEngagementSyncSummary> {
    const summary: IgEngagementSyncSummary = {
      snapshotDate: null,
      mediaConsidered: 0,
      highs: 0,
      lows: 0,
      patternsAdjusted: 0,
      trainingExamples: 0,
      skippedExisting: 0,
      errors: 0,
    };

    // IG content is attributed to @grafikcem (same reuse as instagramService).
    const account = await prisma.account.findUnique({ where: { handle: "grafikcem" } });
    if (!account) {
      summary.reason = "ig_account_not_found";
      return summary;
    }

    const recent = await igInsightSnapshotRepo.listRecent(1);
    const snapshot = recent[0];
    if (!snapshot) {
      summary.reason = "no_snapshot";
      return summary;
    }
    summary.snapshotDate = snapshot.date;

    const media = safeJsonParse<MediaInsightItem[]>(snapshot.topMediaJson, []);
    summary.mediaConsidered = media.length;
    if (media.length === 0) {
      summary.reason = "no_media";
      return summary;
    }

    // Idempotency: skip media already given an engagement verdict (the mediaId
    // is stored inside the FeedbackEvent.reason JSON).
    const existing = await prisma.feedbackEvent.findMany({
      where: { accountId: account.id, platform: "instagram", feedbackType: { startsWith: "engagement" } },
      select: { reason: true },
    });
    const judged = new Set<string>();
    for (const e of existing) {
      const parsed = safeJsonParse<{ mediaId?: string }>(e.reason, {});
      if (parsed.mediaId) judged.add(parsed.mediaId);
    }

    // igEngagement is reach-normalized + *1000-scaled, so these thresholds are
    // NOT the raw-count X ones (ENGAGEMENT_HIGH_MIN/LOW_MAX).
    const highMin = envInt("IG_ENGAGEMENT_HIGH", 50);
    const lowMax = envInt("IG_ENGAGEMENT_LOW", 5);

    // Candidate IG patterns to reweight, fetched once.
    const igPatterns = await prisma.viralPattern.findMany({
      where: { accountId: account.id, platform: "instagram", isActive: true },
      select: { id: true, exampleGood: true },
    });

    for (const m of media) {
      try {
        if (judged.has(m.mediaId)) {
          summary.skippedExisting++;
          continue;
        }

        const score = igEngagement({
          saves: m.saves,
          shares: m.shares,
          comments: m.comments,
          likes: m.likes,
          reach: m.reach,
        });

        let verdict: "engagement_high" | "engagement_low" | null = null;
        if (score >= highMin) verdict = "engagement_high";
        else if (score <= lowMax) verdict = "engagement_low";
        if (!verdict) continue;

        const metrics = {
          mediaId: m.mediaId,
          permalink: m.permalink,
          reach: m.reach,
          likes: m.likes,
          saves: m.saves,
          shares: m.shares,
          comments: m.comments,
          engagement: Math.round(score),
        };

        await feedbackEventRepo.create({
          accountId: account.id,
          platform: "instagram",
          feedbackType: verdict,
          originalContent: m.caption,
          reason: JSON.stringify(metrics),
        });
        if (verdict === "engagement_high") summary.highs++;
        else summary.lows++;

        // Reweight IG patterns whose exemplar caption resembles this media's.
        const delta = verdict === "engagement_high" ? PATTERN_DELTA_HIGH : PATTERN_DELTA_LOW;
        for (const p of igPatterns) {
          if (!p.exampleGood) continue;
          if (isNearDuplicate(m.caption, p.exampleGood, MATCH_THRESHOLD)) {
            const updated = await viralPatternRepo.adjustSuccessScore(p.id, delta);
            if (updated) summary.patternsAdjusted++;
          }
        }

        // High performers become positive IG training signal.
        if (verdict === "engagement_high") {
          const example = await trainingExampleRepo.create({
            accountId: account.id,
            inputType: "ig_engagement",
            sourceContent: m.permalink,
            outputContent: m.caption,
            label: "good",
            platform: "instagram",
            reason: `Gerçek IG etkileşim skoru: ${Math.round(score)} (kaydet ${m.saves}, paylaşım ${m.shares}, yorum ${m.comments}, beğeni ${m.likes}, reach ${m.reach})`,
            metricsJson: metrics,
          });
          summary.trainingExamples++;
          await embedTrainingExample(example.id).catch(() => {
            /* embedding is best-effort */
          });
        }
      } catch (err) {
        console.error(`IG engagement sync: ${m.mediaId} işlenirken hata:`, err);
        summary.errors++;
      }
    }

    summary.reason = summary.highs + summary.lows === 0 ? "no_verdicts" : "synced";
    return summary;
  },
};
