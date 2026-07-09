import { describe, it, expect } from "vitest";
import {
  assembleMonthlyPlan,
  repetitionWarnings,
  staleDossierFlags,
  PlanValidationError,
  MIX_TARGET,
  MIX_TOLERANCE,
  type PlanSlot,
} from "./plan-assembler";

const DAYS_12 = [1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26];
const PILLARS = ["arac_testi", "gorsel_uretim", "is_akisi"];

describe("assembleMonthlyPlan — doğrulama", () => {
  it("pillar sayısı 3-5 dışıysa reddeder", () => {
    expect(() =>
      assembleMonthlyPlan({ month: "2026-08", postDays: [1], pillars: ["a", "b"] })
    ).toThrow(PlanValidationError);
    expect(() =>
      assembleMonthlyPlan({ month: "2026-08", postDays: [1], pillars: ["a", "b", "c", "d", "e", "f"] })
    ).toThrow(PlanValidationError);
  });

  it("geçersiz ay/gün reddedilir", () => {
    expect(() =>
      assembleMonthlyPlan({ month: "agustos", postDays: [1], pillars: PILLARS })
    ).toThrow(PlanValidationError);
    expect(() =>
      assembleMonthlyPlan({ month: "2026-08", postDays: [40], pillars: PILLARS })
    ).toThrow(PlanValidationError);
  });
});

describe("assembleMonthlyPlan — mix + determinizm", () => {
  it("60/25/15 hedefi tolerans içinde dağıtılır (12 slot)", () => {
    const plan = assembleMonthlyPlan({ month: "2026-08", postDays: DAYS_12, pillars: PILLARS });
    expect(plan.slots).toHaveLength(12);
    for (const bucket of ["evergreen", "seasonal", "reactive"] as const) {
      const ratio = plan.mix[bucket] / plan.slots.length;
      expect(Math.abs(ratio - MIX_TARGET[bucket])).toBeLessThanOrEqual(MIX_TOLERANCE + 1e-9);
    }
  });

  it("aynı girdi → aynı plan (deterministik)", () => {
    const input = {
      month: "2026-08",
      postDays: DAYS_12,
      pillars: PILLARS,
      seasonalTopics: ["okula dönüş kampanya görselleri"],
    };
    expect(assembleMonthlyPlan(input)).toEqual(assembleMonthlyPlan(input));
  });

  it("her slot pillar etiketi taşır", () => {
    const plan = assembleMonthlyPlan({ month: "2026-08", postDays: DAYS_12, pillars: PILLARS });
    expect(plan.slots.every((s) => PILLARS.includes(s.pillar))).toBe(true);
  });

  it("seasonal slotlara konu ipuçları dağıtılır; reactive slot gündem notu taşır", () => {
    const plan = assembleMonthlyPlan({
      month: "2026-08",
      postDays: DAYS_12,
      pillars: PILLARS,
      seasonalTopics: ["kampanya-1", "kampanya-2"],
    });
    const seasonal = plan.slots.filter((s) => s.mixBucket === "seasonal");
    expect(seasonal[0]?.topicHint).toBe("kampanya-1");
    const reactive = plan.slots.filter((s) => s.mixBucket === "reactive");
    expect(reactive.every((s) => s.topicHint.includes("reaktif"))).toBe(true);
  });
});

describe("assembleMonthlyPlan — seri slotları", () => {
  it("seri bölümleri eşit aralıklı yerleşir, evergreen'den düşer", () => {
    const plan = assembleMonthlyPlan({
      month: "2026-08",
      postDays: DAYS_12,
      pillars: PILLARS,
      series: [{ seriesKey: "best_ai_tools", pillar: "arac_testi", episodesPerMonth: 3 }],
    });
    const seriesSlots = plan.slots.filter((s) => s.seriesKey === "best_ai_tools");
    expect(seriesSlots).toHaveLength(3);
    expect(seriesSlots.every((s) => s.mixBucket === "evergreen")).toBe(true);
  });

  it("gün sayısını aşan seri bölümleri düşürülür + uyarı", () => {
    const plan = assembleMonthlyPlan({
      month: "2026-08",
      postDays: [1, 2],
      pillars: PILLARS,
      series: [{ seriesKey: "best_ai_tools", pillar: "arac_testi", episodesPerMonth: 5 }],
    });
    expect(plan.slots.filter((s) => s.seriesKey).length).toBeLessThanOrEqual(2);
    expect(plan.warnings.some((w) => w.includes("fazlası düşürüldü"))).toBe(true);
  });
});

describe("repetitionWarnings — histogram (uyarı, blok değil)", () => {
  it("pencere içinde pillar yığılması uyarı üretir", () => {
    const slots: PlanSlot[] = [1, 2, 3, 4, 5].map((d) => ({
      dayOfMonth: d,
      pillar: "arac_testi",
      mixBucket: "evergreen",
      seriesKey: null,
      topicHint: "",
    }));
    const w = repetitionWarnings(slots);
    expect(w.length).toBeGreaterThan(0);
    expect(w[0]).toContain("arac_testi");
  });

  it("çeşitli pillar'lar uyarı üretmez", () => {
    const slots: PlanSlot[] = PILLARS.concat(PILLARS).map((p, i) => ({
      dayOfMonth: i + 1,
      pillar: p,
      mixBucket: "evergreen",
      seriesKey: null,
      topicHint: "",
    }));
    expect(repetitionWarnings(slots)).toHaveLength(0);
  });
});

describe("staleDossierFlags", () => {
  it("expiry geçmiş dossier'ler yeniden-doğrula bayrağı alır", () => {
    const now = Date.parse("2026-08-15T00:00:00Z");
    const flags = staleDossierFlags(
      [
        { id: "d1", title: "Bayat", expiry: new Date("2026-08-01") },
        { id: "d2", title: "Taze", expiry: new Date("2026-09-01") },
        { id: "d3", title: "Araçsız", expiry: null },
      ],
      now
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ dossierId: "d1" });
    expect(flags[0].message).toContain("yeniden doğrula");
  });
});
