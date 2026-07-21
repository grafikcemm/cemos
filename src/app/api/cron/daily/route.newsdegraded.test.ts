import { describe, it, expect } from "vitest";
import { newsStagesDegraded } from "@/lib/news/newsStages";

// A dead news subsystem must flip the daily run to PARTIAL — the stages swallow
// their own errors, so without this the run reports a false-clean signal.
describe("newsStagesDegraded", () => {
  it("false when there is no news object (single-account run)", () => {
    expect(newsStagesDegraded(undefined)).toBe(false);
  });

  it("false when every stage ran clean", () => {
    expect(
      newsStagesDegraded({ hackernews: { added: 3 }, digest: { success: true } }),
    ).toBe(false);
  });

  it("true when a stage threw (has an error key)", () => {
    expect(newsStagesDegraded({ pipeline: { error: "boom" } })).toBe(true);
  });

  it("true when runNewsStages itself threw", () => {
    expect(newsStagesDegraded({ error: "outer boom" })).toBe(true);
  });

  it("true when the digest generation failed", () => {
    expect(
      newsStagesDegraded({ hackernews: { added: 1 }, digest: { success: false } }),
    ).toBe(true);
  });
});
