import { describe, it, expect } from "vitest";
import {
  monthMatrix,
  monthLabel,
  daysInMonth,
  shiftMonth,
  postDaysFromFrequency,
  isoDate,
} from "./calendarGrid";

describe("monthMatrix", () => {
  it("her zaman 42 hücre (6 tam hafta) üretir", () => {
    expect(monthMatrix(2026, 7).length).toBe(42);
    expect(monthMatrix(2026, 2).length).toBe(42);
  });

  it("ayın gün sayısı kadar inMonth hücre içerir", () => {
    const cells = monthMatrix(2026, 7);
    expect(cells.filter((c) => c.inMonth).length).toBe(31);
    expect(monthMatrix(2026, 2).filter((c) => c.inMonth).length).toBe(28);
    expect(monthMatrix(2024, 2).filter((c) => c.inMonth).length).toBe(29);
  });

  it("ilk inMonth hücre gün 1 ve doğru iso taşır", () => {
    const cells = monthMatrix(2026, 7);
    const first = cells.find((c) => c.inMonth);
    expect(first?.day).toBe(1);
    expect(first?.iso).toBe("2026-07-01");
  });

  it("baş hücreler önceki, son hücreler sonraki aya işaret eder", () => {
    const cells = monthMatrix(2026, 7);
    const lead = cells.filter((c) => c.monthOffset === -1);
    const trail = cells.filter((c) => c.monthOffset === 1);
    expect(lead.every((c) => !c.inMonth)).toBe(true);
    expect(trail.every((c) => !c.inMonth)).toBe(true);
  });
});

describe("shiftMonth", () => {
  it("yıl sınırında geriye sarar", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month1: 12 });
  });
  it("yıl sınırında ileriye sarar", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month1: 1 });
  });
  it("aynı yıl içinde kayar", () => {
    expect(shiftMonth(2026, 7, 2)).toEqual({ year: 2026, month1: 9 });
  });
});

describe("postDaysFromFrequency", () => {
  it("gün 2'den başlayıp N günde bir üretir", () => {
    expect(postDaysFromFrequency(3, 2026, 7)).toEqual([2, 5, 8, 11, 14, 17, 20, 23, 26, 29]);
  });
  it("ay sonunu aşmaz", () => {
    expect(postDaysFromFrequency(3, 2026, 2).every((d) => d <= 28)).toBe(true);
  });
});

describe("etiket + gün sayısı", () => {
  it("Türkçe ay etiketi", () => {
    expect(monthLabel(2026, 7)).toBe("Temmuz 2026");
    expect(monthLabel(2026, 1)).toBe("Ocak 2026");
  });
  it("artık yıl Şubat", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
  });
  it("isoDate sıfır-dolgulu", () => {
    expect(isoDate(2026, 7, 5)).toBe("2026-07-05");
  });
});
