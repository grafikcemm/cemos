// Pure, LLM-free engagement scoring formulas (Faz F — cross-platform learning).
// One definition per platform, shared by the engagement learner and any
// cross-platform reporting so the dashboard and the learning loop never diverge.
import { computeEngagementScore } from "@/lib/instagram/insight-pipeline";

/**
 * X engagement score: likes + 2*retweets + replies.
 * Extracted verbatim from engagementLearningService so the X loop and reporting
 * share one definition. Raw-count scale (NOT comparable to igEngagement).
 */
export function xEngagement(input: {
  likeCount: number;
  retweetCount: number;
  replyCount: number;
}): number {
  return input.likeCount + 2 * input.retweetCount + input.replyCount;
}

/**
 * Instagram engagement score: reuses the insight-pipeline formula
 * (saves*4 + shares*5 + comments*2 + likes) / max(reach,1) * 1000. Reach-
 * normalized and *1000-scaled, so its thresholds are NOT the raw-count X ones.
 */
export function igEngagement(input: {
  saves: number;
  shares: number;
  comments: number;
  likes: number;
  reach: number;
}): number {
  return computeEngagementScore({
    totalSaves: input.saves,
    totalShares: input.shares,
    totalComments: input.comments,
    totalLikes: input.likes,
    totalReach: input.reach,
  });
}

/**
 * YouTube own-video outcome: relative views-per-day delta of a published video
 * vs the channel median. Positive => beat the channel baseline.
 *
 * DORMANT in Faz F: CemOS has no own-video performance feed yet (YtVideo /
 * YtChannel hold competitor data), so nothing wires this. Kept pure + tested so
 * it can be connected the day that data source exists.
 */
export function ytOutcome(videoVpd: number, channelMedianVpd: number): number {
  return (videoVpd - channelMedianVpd) / Math.max(channelMedianVpd, 1);
}
