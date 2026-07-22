import { describe, it, expect } from "vitest";
import { computeQaReport, packStatusForVerdict } from "./qa";
import type { GroundingType } from "@/lib/learning/types";

const ss: GroundingType = "source_supported";
const inf: GroundingType = "inference";

describe("computeQaReport", () => {
  it("passes when most claims are validly source-supported", () => {
    const r = computeQaReport({
      claims: [
        { text: "a", chunkIdx: 0, groundingType: ss },
        { text: "b", chunkIdx: 1, groundingType: ss },
        { text: "c", chunkIdx: 2, groundingType: ss },
      ],
      items: [],
      chunkCount: 5,
    });
    expect(r.coverage).toBe(1);
    expect(r.verdict).toBe("pass");
    expect(r.flagged).toHaveLength(0);
  });

  it("flags source_supported claims with out-of-range chunkIdx (hallucinated anchor)", () => {
    const r = computeQaReport({
      claims: [
        { text: "real", chunkIdx: 0, groundingType: ss },
        { text: "fake", chunkIdx: 99, groundingType: ss },
      ],
      items: [],
      chunkCount: 3,
    });
    expect(r.flagged.length).toBe(1);
    expect(r.coverage).toBe(0.5);
    expect(r.verdict).toBe("review");
  });

  it("fails when grounding coverage is below the review threshold", () => {
    const r = computeQaReport({
      claims: [
        { text: "a", chunkIdx: 99, groundingType: ss },
        { text: "b", chunkIdx: 0, groundingType: inf },
        { text: "c", chunkIdx: 1, groundingType: inf },
      ],
      items: [],
      chunkCount: 3,
    });
    expect(r.verdict).toBe("fail");
  });

  it("falls back to item grounding when there are no claims", () => {
    const r = computeQaReport({
      claims: [],
      items: [
        { front: "q1", chunkIdx: 0, groundingType: ss },
        { front: "q2", chunkIdx: 1, groundingType: ss },
      ],
      chunkCount: 4,
    });
    expect(r.coverage).toBe(1);
    expect(r.verdict).toBe("pass");
  });
});

describe("computeQaReport basis-awareness (4C)", () => {
  const sum: GroundingType = "summary_supported";

  it("summary basis: summary_supported valid → pass", () => {
    const r = computeQaReport({
      claims: [
        { text: "a", chunkIdx: 0, groundingType: sum },
        { text: "b", chunkIdx: 1, groundingType: sum },
      ],
      items: [],
      chunkCount: 4,
      basis: "summary",
    });
    expect(r.coverage).toBe(1);
    expect(r.verdict).toBe("pass");
  });

  it("summary basis: source_supported iddia YALAN → flag + coverage'a sayılmaz", () => {
    const r = computeQaReport({
      claims: [
        { text: "iyi", chunkIdx: 0, groundingType: sum },
        { text: "videoda-dogrulandi-yalani", chunkIdx: 1, groundingType: ss },
      ],
      items: [],
      chunkCount: 4,
      basis: "summary",
    });
    // 1 meşru (summary_supported) / 2 iddia → 0.5; source_supported flag'lenir.
    expect(r.coverage).toBe(0.5);
    expect(r.flagged.some((f) => f.reason.includes("yanlış temelli"))).toBe(true);
  });

  it("transcript basis: summary_supported yanlış-temel → flag", () => {
    const r = computeQaReport({
      claims: [{ text: "a", chunkIdx: 0, groundingType: sum }],
      items: [],
      chunkCount: 4,
      basis: "transcript",
    });
    expect(r.flagged.some((f) => f.reason.includes("yanlış temelli"))).toBe(true);
  });
});

describe("packStatusForVerdict", () => {
  it("maps verdicts to pack statuses", () => {
    expect(packStatusForVerdict("pass")).toBe("ready");
    expect(packStatusForVerdict("review")).toBe("qa_pending");
    expect(packStatusForVerdict("fail")).toBe("qa_failed");
  });
});
