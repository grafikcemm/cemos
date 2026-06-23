import { describe, it, expect } from "vitest";
import { median, computeBaseline, computeOutlier, OUTLIER_MIN_SAMPLE } from "@/lib/content/outlier";

describe("median", () => {
  it("returns 0 for empty", () => {
    expect(median([])).toBe(0);
  });
  it("odd length → middle", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("even length → average of middle two", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("does not mutate input", () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe("computeBaseline", () => {
  it("reports median + sampleSize", () => {
    expect(computeBaseline([10, 20, 30])).toEqual({ medianValue: 20, sampleSize: 3 });
  });
});

describe("computeOutlier", () => {
  it("computes multiplier when sample sufficient", () => {
    const r = computeOutlier(300, 100, 10);
    expect(r.insufficient).toBe(false);
    expect(r.multiplier).toBeCloseTo(3);
  });

  it("flags insufficient when sample below threshold", () => {
    const r = computeOutlier(300, 100, OUTLIER_MIN_SAMPLE - 1);
    expect(r.insufficient).toBe(true);
    expect(r.multiplier).toBe(0);
    expect(r.explanation.reason).toContain("yetersiz");
  });

  it("flags insufficient when baseline median is zero (no fake high score)", () => {
    const r = computeOutlier(300, 0, 50);
    expect(r.insufficient).toBe(true);
    expect(r.multiplier).toBe(0);
  });

  it("clamps negative metric to zero", () => {
    const r = computeOutlier(-50, 100, 10);
    expect(r.multiplier).toBe(0);
  });

  it("never returns non-finite multiplier", () => {
    const r = computeOutlier(300, 0.0, 10);
    expect(Number.isFinite(r.multiplier)).toBe(true);
  });
});
