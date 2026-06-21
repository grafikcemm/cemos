import { describe, it, expect } from "vitest";
import { computePillarConsistency } from "./pillar-consistency";

const PILLARS = ["tool_spotlight", "visual_drop", "hot_take", "thread", "repo_kaynak"];

describe("computePillarConsistency", () => {
  it("returns a neutral result for empty input", () => {
    const r = computePillarConsistency({ items: [], knownPillars: PILLARS });
    expect(r.total).toBe(0);
    expect(r.focusPct).toBe(0);
    expect(r.distribution).toEqual([]);
  });

  it("scores a single-pillar account as 100% odaklı", () => {
    const items = Array.from({ length: 6 }, () => ({ mode: "thread" }));
    const r = computePillarConsistency({ items, knownPillars: PILLARS });
    expect(r.focusPct).toBe(100);
    expect(r.herfindahl).toBe(1);
    expect(r.verdict).toBe("odakli");
  });

  it("scores an even 4-way split as dağılmış", () => {
    const items = [
      { mode: "tool_spotlight" },
      { mode: "visual_drop" },
      { mode: "hot_take" },
      { mode: "thread" },
    ];
    const r = computePillarConsistency({ items, knownPillars: PILLARS });
    expect(r.focusPct).toBe(25);
    expect(r.verdict).toBe("dagilmis");
  });

  it("surfaces off-pillar modes not in the known set", () => {
    const items = [
      { mode: "thread" },
      { mode: "thread" },
      { mode: "futbol" },
      { mode: "siyaset" },
    ];
    const r = computePillarConsistency({ items, knownPillars: PILLARS });
    expect(r.offPillarSample).toContain("futbol");
    expect(r.offPillarSample).toContain("siyaset");
    expect(r.offPillarSample).not.toContain("thread");
  });
});
