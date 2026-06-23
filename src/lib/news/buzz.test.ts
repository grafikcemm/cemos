import { describe, it, expect } from "vitest";
import { computeBuzzScore, type BuzzInput } from "@/lib/news/buzz";

const NOW = Date.parse("2026-06-23T12:00:00.000Z");

function base(overrides: Partial<BuzzInput> = {}): BuzzInput {
  return {
    sourceVerification: "single_source",
    publishedAt: new Date(NOW).toISOString(),
    fetchedAt: new Date(NOW).toISOString(),
    reliability: "medium",
    priority: 50,
    hnPoints: null,
    hnComments: null,
    redditScore: null,
    now: NOW,
    ...overrides,
  };
}

describe("computeBuzzScore", () => {
  it("clamps output to 0–100", () => {
    const score = computeBuzzScore(
      base({
        sourceVerification: "multi_source_confirmed",
        reliability: "high",
        priority: 100,
        hnPoints: 9999,
        hnComments: 9999,
        redditScore: 99999,
      }),
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns higher score for fresher news (recency monotonic)", () => {
    const fresh = computeBuzzScore(base({ publishedAt: new Date(NOW).toISOString() }));
    const old = computeBuzzScore(
      base({ publishedAt: new Date(NOW - 72 * 3_600_000).toISOString() }),
    );
    expect(fresh).toBeGreaterThan(old);
  });

  it("strictly decreases as the item ages past each half-life (~18h)", () => {
    const at0 = computeBuzzScore(base({ publishedAt: new Date(NOW).toISOString() }));
    const at18 = computeBuzzScore(
      base({ publishedAt: new Date(NOW - 18 * 3_600_000).toISOString() }),
    );
    const at36 = computeBuzzScore(
      base({ publishedAt: new Date(NOW - 36 * 3_600_000).toISOString() }),
    );
    expect(at0).toBeGreaterThan(at18);
    expect(at18).toBeGreaterThan(at36);
  });

  it("ranks corroboration: multi > editorial > official > single", () => {
    const multi = computeBuzzScore(base({ sourceVerification: "multi_source_confirmed" }));
    const editorial = computeBuzzScore(base({ sourceVerification: "editorial_confirmed" }));
    const official = computeBuzzScore(base({ sourceVerification: "official_only" }));
    const single = computeBuzzScore(base({ sourceVerification: "single_source" }));
    expect(multi).toBeGreaterThan(editorial);
    expect(editorial).toBeGreaterThan(official);
    expect(official).toBeGreaterThan(single);
  });

  it("increases monotonically with external popularity (HN points)", () => {
    const none = computeBuzzScore(base({ hnPoints: 0 }));
    const some = computeBuzzScore(base({ hnPoints: 50 }));
    const lots = computeBuzzScore(base({ hnPoints: 500 }));
    expect(some).toBeGreaterThan(none);
    expect(lots).toBeGreaterThan(some);
  });

  it("rewards higher source reliability", () => {
    const high = computeBuzzScore(base({ reliability: "high" }));
    const low = computeBuzzScore(base({ reliability: "low" }));
    expect(high).toBeGreaterThan(low);
  });

  it("falls back to fetchedAt when publishedAt is null", () => {
    const score = computeBuzzScore(base({ publishedAt: null, fetchedAt: new Date(NOW).toISOString() }));
    expect(score).toBeGreaterThan(0);
  });

  it("treats future publish dates as maximally fresh (no NaN)", () => {
    const score = computeBuzzScore(
      base({ publishedAt: new Date(NOW + 3_600_000).toISOString() }),
    );
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThan(0);
  });
});
