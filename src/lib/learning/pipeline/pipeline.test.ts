import { describe, it, expect } from "vitest";
import { chunkSegments, formatTimestamp, sectionCount } from "./chunk";
import { nextStage, stageProgress, PASSTHROUGH_STAGES, STAGE_ORDER } from "./stages";
import type { TimedSegment } from "./transcript-fetch";

function seg(start: number, end: number, text: string): TimedSegment {
  return { startSec: start, endSec: end, text };
}

describe("chunkSegments", () => {
  it("merges short segments into windows and preserves timestamps", () => {
    const segs = Array.from({ length: 20 }, (_, i) => seg(i * 10, i * 10 + 10, "x".repeat(200)));
    const chunks = chunkSegments(segs, 400, 3);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].startSec).toBe(0);
    expect(chunks[0].idx).toBe(0);
    expect(chunks[1].idx).toBe(1);
    expect(chunks[3].sectionIdx).toBe(1); // perSection=3 → idx 3 in section 1
  });

  it("returns an empty array for no segments", () => {
    expect(chunkSegments([])).toEqual([]);
  });
});

describe("formatTimestamp", () => {
  it("formats mm:ss and h:mm:ss", () => {
    expect(formatTimestamp(75)).toBe("1:15");
    expect(formatTimestamp(3661)).toBe("1:01:01");
  });
});

describe("sectionCount", () => {
  it("counts distinct sections", () => {
    const chunks = chunkSegments(
      Array.from({ length: 12 }, (_, i) => seg(i, i + 1, "y".repeat(300))),
      400,
      2
    );
    expect(sectionCount(chunks)).toBe(Math.ceil(chunks.length / 2));
  });
});

describe("stage order", () => {
  it("advances through the pipeline and stops at completed", () => {
    expect(nextStage("source_created")).toBe("metadata");
    expect(nextStage("completed")).toBeNull();
  });

  it("v2: notes/graph/tasks artık passthrough DEĞİL (gerçek aşama)", () => {
    expect(PASSTHROUGH_STAGES.has("notes")).toBe(false);
    expect(PASSTHROUGH_STAGES.has("graph")).toBe(false);
    expect(PASSTHROUGH_STAGES.has("tasks")).toBe(false);
    expect(PASSTHROUGH_STAGES.size).toBe(0);
  });

  it("v2: content_ideas aşaması eklendi, concepts notes'tan ÖNCE", () => {
    expect(STAGE_ORDER.includes("content_ideas")).toBe(true);
    expect(nextStage("tasks")).toBe("content_ideas");
    expect(nextStage("content_ideas")).toBe("qa");
    expect(STAGE_ORDER.indexOf("concepts")).toBeLessThan(STAGE_ORDER.indexOf("notes"));
    expect(nextStage("content_analysis")).toBe("concepts");
  });

  it("progress is monotonic 0..1", () => {
    expect(stageProgress("source_created")).toBe(0);
    expect(stageProgress("completed")).toBe(1);
    expect(stageProgress("qa")).toBeGreaterThan(stageProgress("chunk"));
    expect(STAGE_ORDER[STAGE_ORDER.length - 1]).toBe("completed");
  });
});
