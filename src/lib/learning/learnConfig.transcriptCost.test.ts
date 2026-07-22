import { describe, it, expect } from "vitest";
import { transcriptCostRows, getTranscriptCostUsd } from "./learnConfig";

/**
 * F1 degraded-tail transcript accounting: every PAID provider actually called must
 * be ledgered — the usable one as `estimated`, any reached-but-unusable one as
 * `unknown` — so a billed-but-failed transcript is never silently $0 and never
 * erodes the learn_ ceiling invisibly. (Cost values are env-tunable; assertions key
 * on the outcome/usable/provider decision + a positive cost.)
 */
describe("transcriptCostRows", () => {
  it("records the provider that produced the usable transcript as estimated", () => {
    const rows = transcriptCostRows(["gemini"], "gemini");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "gemini", costOutcome: "estimated", usable: true });
    expect(rows[0].estimatedCostUsd).toBe(getTranscriptCostUsd("gemini"));
    expect(rows[0].estimatedCostUsd).toBeGreaterThan(0);
  });

  it("records a reached-but-unusable paid provider as unknown (was silently $0)", () => {
    // supadata was called, returned nothing usable; gemini then produced the transcript.
    const rows = transcriptCostRows(["supadata", "gemini"], "gemini");
    expect(rows.map((r) => [r.provider, r.costOutcome, r.usable])).toEqual([
      ["supadata", "unknown", false],
      ["gemini", "estimated", true],
    ]);
  });

  it("records EVERY paid attempt as unknown when none produced a usable transcript", () => {
    const rows = transcriptCostRows(["supadata", "gemini"], null);
    expect(rows.map((r) => r.costOutcome)).toEqual(["unknown", "unknown"]);
    expect(rows.every((r) => r.usable === false)).toBe(true);
    expect(rows.every((r) => r.estimatedCostUsd > 0)).toBe(true);
  });

  it("drops zero-cost/free providers — youtubei captions / manual paste are never charged", () => {
    expect(transcriptCostRows(["youtubei"], "youtubei")).toEqual([]);
    expect(transcriptCostRows([], null)).toEqual([]);
    // a free provider mixed with a paid one keeps only the paid row
    expect(transcriptCostRows(["youtubei", "gemini"], "gemini").map((r) => r.provider)).toEqual([
      "gemini",
    ]);
  });
});
