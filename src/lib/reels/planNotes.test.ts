import { describe, it, expect } from "vitest";
import {
  parsePlanNotes,
  serializePlanNotes,
  previousRevision,
  PLAN_NOTES_VERSION,
  type PlanNotesEnvelope,
} from "./planNotes";

function envelope(overrides: Partial<PlanNotesEnvelope> = {}): PlanNotesEnvelope {
  return {
    schemaVersion: PLAN_NOTES_VERSION,
    revision: 3,
    fingerprint: "abc123",
    input: { pillars: ["a", "b", "c"], postDays: [1, 5], seriesKeys: [], seasonalTopicsCount: 0 },
    warnings: ["Mix sapması: reactive"],
    hardBlockers: [],
    histogram: { topPillars: [["a", 2]], topTools: [], topicClusterCount: 0 },
    appliedAt: "2026-08-01T00:00:00.000Z",
    source: "operator_apply",
    method: "assembler.v2",
    ...overrides,
  };
}

describe("parsePlanNotes — fail-closed", () => {
  it("boş/bozuk → temiz boş", () => {
    expect(parsePlanNotes(null)).toEqual({ envelope: null, warnings: [], legacy: false });
    expect(parsePlanNotes("{bozuk")).toEqual({ envelope: null, warnings: [], legacy: false });
  });

  it("legacy string[] okunur (warnings + legacy=true)", () => {
    const r = parsePlanNotes(JSON.stringify(["uyarı 1", "uyarı 2", 5]));
    expect(r.legacy).toBe(true);
    expect(r.envelope).toBeNull();
    expect(r.warnings).toEqual(["uyarı 1", "uyarı 2"]);
  });

  it("versioned zarf strict parse eder", () => {
    const raw = serializePlanNotes(envelope());
    const r = parsePlanNotes(raw);
    expect(r.envelope?.revision).toBe(3);
    expect(r.warnings).toEqual(["Mix sapması: reactive"]);
    expect(r.legacy).toBe(false);
  });

  it("bilinmeyen alan içeren zarf reddedilir (strict)", () => {
    const raw = JSON.stringify({ ...envelope(), extra: "x" });
    expect(parsePlanNotes(raw).envelope).toBeNull();
  });

  it("roundtrip stabil", () => {
    const e = envelope();
    expect(parsePlanNotes(serializePlanNotes(e)).envelope).toEqual(e);
  });
});

describe("previousRevision", () => {
  it("zarf revision döner; legacy/boş → 0", () => {
    expect(previousRevision(serializePlanNotes(envelope({ revision: 7 })))).toBe(7);
    expect(previousRevision(JSON.stringify(["legacy"]))).toBe(0);
    expect(previousRevision(null)).toBe(0);
  });
});
