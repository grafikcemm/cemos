import { describe, it, expect } from "vitest";
import {
  reconcileSlots,
  fingerprintPlanInput,
  canonicalPlanInput,
  isValidTransition,
  PLAN_STATUS_TRANSITIONS,
} from "./planReconcileService";
import type { PlanSlot } from "./plan-assembler";

type SlotRow = {
  id: string;
  dayOfMonth: number;
  pillar: string;
  mixBucket: string;
  seriesKey: string | null;
  topicHint: string;
  status: string;
  dossierId: string | null;
};

function row(partial: Partial<SlotRow> & { id: string; dayOfMonth: number }): SlotRow {
  return {
    pillar: "p",
    mixBucket: "evergreen",
    seriesKey: null,
    topicHint: "",
    status: "planned",
    dossierId: null,
    ...partial,
  };
}
function slot(day: number, partial: Partial<PlanSlot> = {}): PlanSlot {
  return { dayOfMonth: day, pillar: "p", mixBucket: "evergreen", seriesKey: null, topicHint: "", ...partial };
}

describe("fingerprintPlanInput — deterministik + sıra bağımsız", () => {
  it("pillar/postDays/series sırası fingerprint'i değiştirmez", () => {
    const a = fingerprintPlanInput("acc", "2026-08", {
      pillars: ["b", "a", "c"],
      postDays: [5, 1, 3],
      series: [{ seriesKey: "s2", pillar: "a", episodesPerMonth: 1 }, { seriesKey: "s1", pillar: "b", episodesPerMonth: 2 }],
    });
    const b = fingerprintPlanInput("acc", "2026-08", {
      pillars: ["a", "b", "c"],
      postDays: [1, 3, 5],
      series: [{ seriesKey: "s1", pillar: "b", episodesPerMonth: 2 }, { seriesKey: "s2", pillar: "a", episodesPerMonth: 1 }],
    });
    expect(a).toBe(b);
  });

  it("farklı girdi farklı fingerprint", () => {
    const a = fingerprintPlanInput("acc", "2026-08", { pillars: ["a", "b", "c"], postDays: [1] });
    const b = fingerprintPlanInput("acc", "2026-08", { pillars: ["a", "b", "c"], postDays: [2] });
    expect(a).not.toBe(b);
  });

  it("canonical girdi displayName/pillar client farkından etkilenmez (seriesKey+episodes)", () => {
    const c = canonicalPlanInput("acc", "2026-08", {
      pillars: ["a", "b", "c"],
      postDays: [1],
      series: [{ seriesKey: "s1", pillar: "z", episodesPerMonth: 2 }],
    });
    expect(c.series).toEqual([{ seriesKey: "s1", episodesPerMonth: 2 }]);
  });
});

describe("reconcileSlots — non-destructive", () => {
  it("korunan slotlar (drafted/done/dossier/handoff) asla silinmez/skip'lenmez", () => {
    const existing: SlotRow[] = [
      row({ id: "drafted", dayOfMonth: 3, status: "drafted" }),
      row({ id: "done", dayOfMonth: 5, status: "done" }),
      row({ id: "withDossier", dayOfMonth: 7, dossierId: "d1" }),
      row({ id: "handoff", dayOfMonth: 9 }), // planned ama handoff-referanslı
    ];
    const r = reconcileSlots([slot(11)], existing, new Set(["handoff"]));
    const protectedIds = r.protectedSlots.map((s) => s.id).sort();
    expect(protectedIds).toEqual(["done", "drafted", "handoff", "withDossier"]);
    expect(r.toSkip).toHaveLength(0);
    expect(r.toCreate.map((s) => s.dayOfMonth)).toEqual([11]);
  });

  it("aynı gündeki yönetilen planned slot güncellenir (yeni satır oluşmaz)", () => {
    const existing: SlotRow[] = [row({ id: "m1", dayOfMonth: 3, pillar: "eski", topicHint: "eski" })];
    const r = reconcileSlots([slot(3, { pillar: "yeni", topicHint: "yeni" })], existing, new Set());
    expect(r.toCreate).toHaveLength(0);
    expect(r.toUpdate).toHaveLength(1);
    expect(r.toUpdate[0].id).toBe("m1");
    expect(r.toUpdate[0].slot.pillar).toBe("yeni");
  });

  it("aynı içerikli yönetilen slot unchanged (update yok)", () => {
    const existing: SlotRow[] = [row({ id: "m1", dayOfMonth: 3, pillar: "p", mixBucket: "evergreen" })];
    const r = reconcileSlots([slot(3)], existing, new Set());
    expect(r.toUpdate).toHaveLength(0);
    expect(r.unchanged.map((s) => s.id)).toEqual(["m1"]);
  });

  it("yeni planda olmayan yönetilen planned slot skipped'e geçer (SİLİNMEZ)", () => {
    const existing: SlotRow[] = [row({ id: "obsolete", dayOfMonth: 15 })];
    const r = reconcileSlots([slot(3)], existing, new Set());
    expect(r.toSkip).toEqual(["obsolete"]);
    expect(r.toCreate.map((s) => s.dayOfMonth)).toEqual([3]);
  });

  it("aynı günde birden fazla yönetilen slot → ilki tutulur, diğeri skip + collision", () => {
    const existing: SlotRow[] = [
      row({ id: "a", dayOfMonth: 3 }),
      row({ id: "b", dayOfMonth: 3 }),
    ];
    const r = reconcileSlots([slot(3)], existing, new Set());
    expect(r.toSkip).toContain("b");
    expect(r.collisions.some((c) => c.reason === "same_day_duplicate_managed_slot")).toBe(true);
  });

  it("zaten skipped slot yeni planda yoksa dokunulmaz (skip listesine eklenmez)", () => {
    const existing: SlotRow[] = [row({ id: "sk", dayOfMonth: 20, status: "skipped" })];
    const r = reconcileSlots([slot(3)], existing, new Set());
    expect(r.toSkip).toHaveLength(0);
  });
});

describe("plan lifecycle transitions", () => {
  it("geçerli geçişler", () => {
    expect(isValidTransition("draft", "active")).toBe(true);
    expect(isValidTransition("active", "archived")).toBe(true);
    expect(isValidTransition("archived", "active")).toBe(true);
    expect(isValidTransition("archived", "draft")).toBe(true);
  });
  it("geçersiz geçişler", () => {
    expect(isValidTransition("draft", "draft" as never)).toBe(false);
    expect(PLAN_STATUS_TRANSITIONS.draft).not.toContain("draft");
  });
});
