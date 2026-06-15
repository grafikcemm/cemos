import { describe, it, expect } from "vitest";
import { xEngagement, igEngagement, ytOutcome } from "@/lib/learning/engagement-formulas";
import { computeEngagementScore } from "@/lib/instagram/insight-pipeline";

describe("xEngagement", () => {
  it("weights retweets double (likes + 2*retweets + replies)", () => {
    expect(xEngagement({ likeCount: 10, retweetCount: 5, replyCount: 3 })).toBe(23);
  });

  it("is zero for an empty post", () => {
    expect(xEngagement({ likeCount: 0, retweetCount: 0, replyCount: 0 })).toBe(0);
  });
});

describe("igEngagement", () => {
  it("equals the insight-pipeline computeEngagementScore (shared, not copied)", () => {
    const r = igEngagement({ saves: 4, shares: 2, comments: 5, likes: 100, reach: 1000 });
    const expected = computeEngagementScore({
      totalSaves: 4,
      totalShares: 2,
      totalComments: 5,
      totalLikes: 100,
      totalReach: 1000,
    });
    expect(r).toBe(expected);
    expect(r).toBe(136); // (4*4 + 2*5 + 5*2 + 100) / 1000 * 1000
  });

  it("guards reach=0 (no divide-by-zero)", () => {
    const r = igEngagement({ saves: 1, shares: 1, comments: 1, likes: 1, reach: 0 });
    expect(Number.isFinite(r)).toBe(true);
  });
});

describe("ytOutcome (dormant)", () => {
  it("is positive when the video beats the channel median", () => {
    expect(ytOutcome(200, 100)).toBeGreaterThan(0);
  });

  it("is negative when the video underperforms", () => {
    expect(ytOutcome(50, 100)).toBeLessThan(0);
  });

  it("guards a zero median", () => {
    expect(Number.isFinite(ytOutcome(10, 0))).toBe(true);
  });
});
