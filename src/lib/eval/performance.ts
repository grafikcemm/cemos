/**
 * Performans atıfı — normalize skor (Sprint 7 — EVALUATION-SPEC §4). SAF TS.
 * z-score vs CreatorBaseline · time-decay · cold-start tabanı (min örnek /
 * min impression altında karar YOK).
 */

export const COLD_START_MIN_SAMPLE = 5;
export const COLD_START_MIN_IMPRESSIONS = 200;
export const PERF_DECAY_HALF_LIFE_DAYS = 30;

export type NormalizedPerformance =
  | { ok: true; zScore: number; decayed: number }
  | { ok: false; reason: "cold_start_sample" | "cold_start_impressions" | "no_spread" };

export function normalizePerformance(input: {
  value: number; // postun metriği (örn. engagement)
  baselineMedian: number;
  baselineStd: number;
  baselineSampleSize: number;
  impressions: number;
  ageDays: number;
}): NormalizedPerformance {
  if (input.baselineSampleSize < COLD_START_MIN_SAMPLE) {
    return { ok: false, reason: "cold_start_sample" };
  }
  if (input.impressions < COLD_START_MIN_IMPRESSIONS) {
    return { ok: false, reason: "cold_start_impressions" };
  }
  if (input.baselineStd <= 0) {
    return { ok: false, reason: "no_spread" };
  }
  const zScore = (input.value - input.baselineMedian) / input.baselineStd;
  const decay = Math.pow(0.5, Math.max(0, input.ageDays) / PERF_DECAY_HALF_LIFE_DAYS);
  return { ok: true, zScore: Number(zScore.toFixed(4)), decayed: Number((zScore * decay).toFixed(4)) };
}
