import { describe, it, expect } from "vitest";
import {
  computeViewsPerDay,
  computeRollingMedianVpd,
  computeOutlierScore,
  computeLikeRatio,
} from "./outlier";

const DAY = 86_400_000;
const NOW = 1_000 * DAY; // sabit referans (deterministik)

describe("computeViewsPerDay", () => {
  it("yaşı 1 güne tabanlar (0. gün spike önlenir)", () => {
    // 12 saat önce yayımlanan video → ageDays 0.5 ama taban 1
    const vpd = computeViewsPerDay(1000, NOW - DAY / 2, NOW);
    expect(vpd).toBe(1000);
  });

  it("viewCount 0 → 0", () => {
    expect(computeViewsPerDay(0, NOW - 10 * DAY, NOW)).toBe(0);
  });

  it("gelecek publishedAt → ageDays 1 (negatif yaş clamp)", () => {
    expect(computeViewsPerDay(500, NOW + 5 * DAY, NOW)).toBe(500);
  });

  it("10 günlük video doğru bölünür", () => {
    expect(computeViewsPerDay(1000, NOW - 10 * DAY, NOW)).toBe(100);
  });
});

describe("computeRollingMedianVpd", () => {
  it("boş dizi → 0", () => {
    expect(computeRollingMedianVpd([])).toBe(0);
  });

  it("tek eleman → kendisi", () => {
    expect(computeRollingMedianVpd([42])).toBe(42);
  });

  it("tek sayıda eleman → orta", () => {
    expect(computeRollingMedianVpd([3, 1, 2])).toBe(2);
  });

  it("çift sayıda eleman → iki ortanın ortalaması", () => {
    expect(computeRollingMedianVpd([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("computeOutlierScore", () => {
  it("medyan 0 → sonlu (EPSILON bölmesi, Infinity/NaN yok)", () => {
    const s = computeOutlierScore({
      viewsPerDay: 100,
      rollingMedianVpd: 0,
      publishedAtMs: NOW - 10 * DAY,
      nowMs: NOW,
      likeRatio: 0.03,
    });
    expect(Number.isFinite(s)).toBe(true);
  });

  it("≤30 gün → recencyDamp 1.0 (medyan kadar vpd, nötr like → ~1)", () => {
    const s = computeOutlierScore({
      viewsPerDay: 100,
      rollingMedianVpd: 100,
      publishedAtMs: NOW - 10 * DAY,
      nowMs: NOW,
      likeRatio: 0.03, // nötr → likeAdj 1
    });
    expect(s).toBe(1);
  });

  it("≥90 gün → recencyDamp tabanı 0.5", () => {
    const s = computeOutlierScore({
      viewsPerDay: 100,
      rollingMedianVpd: 100,
      publishedAtMs: NOW - 120 * DAY,
      nowMs: NOW,
      likeRatio: 0.03,
    });
    expect(s).toBe(0.5);
  });

  it("yüksek likeRatio → likeAdj +%10 ile sınırlı", () => {
    const s = computeOutlierScore({
      viewsPerDay: 100,
      rollingMedianVpd: 100,
      publishedAtMs: NOW - 10 * DAY,
      nowMs: NOW,
      likeRatio: 1, // aşırı → clamp 1.1
    });
    expect(s).toBe(1.1);
  });

  it("düşük likeRatio → likeAdj -%10 ile sınırlı", () => {
    const s = computeOutlierScore({
      viewsPerDay: 100,
      rollingMedianVpd: 100,
      publishedAtMs: NOW - 10 * DAY,
      nowMs: NOW,
      likeRatio: 0, // negatif yön → clamp 0.9
    });
    expect(s).toBe(0.9);
  });

  it("viewsPerDay 0 → skor 0", () => {
    const s = computeOutlierScore({
      viewsPerDay: 0,
      rollingMedianVpd: 100,
      publishedAtMs: NOW - 10 * DAY,
      nowMs: NOW,
      likeRatio: 0.03,
    });
    expect(s).toBe(0);
  });
});

describe("computeLikeRatio", () => {
  it("viewCount 0 → 0 (sıfır bölme yok)", () => {
    expect(computeLikeRatio(10, 0)).toBe(0);
  });

  it("normal oran", () => {
    expect(computeLikeRatio(30, 1000)).toBe(0.03);
  });
});
