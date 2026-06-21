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

describe("packStatusForVerdict", () => {
  it("maps verdicts to pack statuses", () => {
    expect(packStatusForVerdict("pass")).toBe("ready");
    expect(packStatusForVerdict("review")).toBe("qa_pending");
    expect(packStatusForVerdict("fail")).toBe("qa_failed");
  });
});
