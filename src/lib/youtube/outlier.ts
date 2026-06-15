/**
 * Outlier skorlama — SAF (I/O yok, Date.now caller'dan gelir → deterministik test).
 * Faz C: bir videonun kanal medyanına göre ne kadar "patladığını" ölçer.
 */

import { OUTLIER } from "./ytConfig";

const DAY_MS = 86_400_000;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Yaş gün cinsinden, en az 1 (0. gün spike'ını önler; gelecek tarih → 1). */
function ageDaysOf(publishedAtMs: number, nowMs: number): number {
  return Math.max(1, (nowMs - publishedAtMs) / DAY_MS);
}

export function computeViewsPerDay(viewCount: number, publishedAtMs: number, nowMs: number): number {
  return viewCount / ageDaysOf(publishedAtMs, nowMs);
}

/** 90 günlük pencere caller tarafından filtrelenir; burada sadece medyan alınır. */
export function computeRollingMedianVpd(vpds: number[]): number {
  if (vpds.length === 0) return 0;
  const sorted = [...vpds].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * outlierScore = base · recencyDamp · likeAdj
 *   base        = vpd / max(medyan, EPSILON)         (sıfır medyan → sonlu)
 *   recencyDamp = ≤30g tam (1.0), 30→90g lineer düşüş, ≥90g taban (0.5)
 *   likeAdj     = like sinyali, sert ±%10 sınır
 */
export function computeOutlierScore(input: {
  viewsPerDay: number;
  rollingMedianVpd: number;
  publishedAtMs: number;
  nowMs: number;
  likeRatio: number;
}): number {
  const ageDays = ageDaysOf(input.publishedAtMs, input.nowMs);
  const base = input.viewsPerDay / Math.max(input.rollingMedianVpd, OUTLIER.EPSILON);
  const recencyDamp = clamp(
    1 - (ageDays - OUTLIER.RECENCY_FULL_DAYS) / OUTLIER.RECENCY_DECAY_DAYS,
    OUTLIER.RECENCY_FLOOR,
    1
  );
  const likeAdj = clamp(
    1 + (input.likeRatio - OUTLIER.MEDIAN_LIKE_RATIO) * OUTLIER.LIKE_K,
    OUTLIER.LIKE_ADJ_MIN,
    OUTLIER.LIKE_ADJ_MAX
  );
  const score = base * recencyDamp * likeAdj;
  return Math.round(score * 100) / 100;
}

export function computeLikeRatio(likeCount: number, viewCount: number): number {
  if (viewCount <= 0) return 0;
  return likeCount / viewCount;
}
