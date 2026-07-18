import { describe, it, expect } from "vitest";
import { assembleMonthlyPlan, PlanValidationError } from "./plan-assembler";
import type { RepetitionSignal } from "./repetition";

const PILLARS = ["arac_testi", "gorsel_uretim", "is_akisi"];

describe("assembleMonthlyPlan — ayın gerçek gün sayısı", () => {
  it("Şubat 30/31 reddedilir (2026 artık yıl değil → 28 gün)", () => {
    expect(() =>
      assembleMonthlyPlan({ month: "2026-02", postDays: [10, 29, 30], pillars: PILLARS })
    ).toThrow(PlanValidationError);
  });

  it("Şubat 28 kabul, 29 reddedilir (2026)", () => {
    expect(() =>
      assembleMonthlyPlan({ month: "2026-02", postDays: [28], pillars: PILLARS })
    ).not.toThrow();
    expect(() =>
      assembleMonthlyPlan({ month: "2026-02", postDays: [29], pillars: PILLARS })
    ).toThrow(PlanValidationError);
  });

  it("Nisan 31 reddedilir (30 günlük ay)", () => {
    expect(() =>
      assembleMonthlyPlan({ month: "2026-04", postDays: [31], pillars: PILLARS })
    ).toThrow(PlanValidationError);
  });

  it("daysInMonth çıktıda döner", () => {
    const plan = assembleMonthlyPlan({ month: "2026-08", postDays: [1, 5, 9], pillars: PILLARS });
    expect(plan.daysInMonth).toBe(31);
  });
});

describe("assembleMonthlyPlan — korunan günler", () => {
  it("korunan günlere yeni base slot bindirilmez + uyarı", () => {
    const plan = assembleMonthlyPlan({
      month: "2026-08",
      postDays: [1, 3, 5, 7, 9],
      pillars: PILLARS,
      protectedSlots: [{ dayOfMonth: 3, pillar: "arac_testi", topic: "korunan" }],
    });
    expect(plan.slots.some((s) => s.dayOfMonth === 3)).toBe(false);
    expect(plan.slots).toHaveLength(4);
    expect(plan.protectedDays).toEqual([3]);
    expect(plan.warnings.some((w) => w.includes("korunuyor"))).toBe(true);
  });

  it("korunan slotlar histograma dahil (araç tekrarı yakalanır)", () => {
    const plan = assembleMonthlyPlan({
      month: "2026-08",
      postDays: [1, 5],
      pillars: PILLARS,
      protectedSlots: [
        { dayOfMonth: 10, pillar: "arac_testi", topic: "midjourney", toolUrl: "https://midjourney.com" },
      ],
      recentHistory: [
        {
          pillar: "arac_testi",
          seriesKey: null,
          topic: "midjourney rehber",
          toolUrl: "https://www.midjourney.com/",
          origin: "history",
        } as RepetitionSignal,
      ],
    });
    expect(plan.histogram.byTool["midjourney.com"]).toBe(2);
    expect(plan.warnings.some((w) => w.includes("midjourney.com"))).toBe(true);
  });
});

describe("assembleMonthlyPlan — banned / pastTopics", () => {
  it("yasaklı konu tam eşleşmesi hard blocker üretir", () => {
    const plan = assembleMonthlyPlan({
      month: "2026-08",
      postDays: [1, 5, 9, 13],
      pillars: PILLARS,
      seasonalTopics: ["Yapay Zeka Sıralaması"],
      bannedRepetition: ["yapay zeka siralamasi"],
    });
    expect(plan.hardBlockers.length).toBeGreaterThan(0);
    expect(plan.hardBlockers[0]).toContain("Yasaklı konu");
  });

  it("yasaklıya YAKIN konu uyarı (hard blocker değil)", () => {
    const plan = assembleMonthlyPlan({
      month: "2026-08",
      postDays: [1, 5, 9, 13],
      pillars: PILLARS,
      seasonalTopics: ["en iyi yapay zeka araçları listesi 2026"],
      bannedRepetition: ["en iyi yapay zeka araclari 2026"],
    });
    expect(plan.hardBlockers).toHaveLength(0);
    expect(plan.warnings.some((w) => w.includes("Yasaklı konuya yakın"))).toBe(true);
  });

  it("geçmiş konuya yakınlık uyarı üretir", () => {
    const plan = assembleMonthlyPlan({
      month: "2026-08",
      postDays: [1, 5, 9, 13],
      pillars: PILLARS,
      seasonalTopics: ["renk paleti uyumu rehberi"],
      pastTopics: ["renk paleti uyumu rehber"],
    });
    expect(plan.warnings.some((w) => w.includes("Geçmişte işlenmiş"))).toBe(true);
  });
});

describe("assembleMonthlyPlan — seri görünen ad", () => {
  it("topicHint ham slug değil, görünen ad taşır", () => {
    const plan = assembleMonthlyPlan({
      month: "2026-08",
      postDays: [1, 5, 9, 13, 17, 21],
      pillars: PILLARS,
      series: [
        { seriesKey: "best_ai_tools", pillar: "arac_testi", episodesPerMonth: 2, displayName: "En İyi AI Araçları" },
      ],
    });
    const seriesSlot = plan.slots.find((s) => s.seriesKey === "best_ai_tools");
    expect(seriesSlot?.topicHint).toContain("En İyi AI Araçları");
    expect(seriesSlot?.topicHint).not.toContain("best_ai_tools");
  });
});

describe("assembleMonthlyPlan — determinizm (yeni alanlarla)", () => {
  it("aynı zengin girdi → aynı plan", () => {
    const input = {
      month: "2026-08",
      postDays: [1, 4, 7, 10, 13, 16, 19],
      pillars: PILLARS,
      series: [{ seriesKey: "s1", pillar: "arac_testi", episodesPerMonth: 2, displayName: "Seri 1" }],
      seasonalTopics: ["kampanya"],
      pastTopics: ["eski konu"],
      bannedRepetition: ["yasak"],
      protectedSlots: [{ dayOfMonth: 22, pillar: "gorsel_uretim", topic: "korunan" }],
    };
    expect(assembleMonthlyPlan(input)).toEqual(assembleMonthlyPlan(input));
  });
});
