// Outlier engine (Eden ilkesi) — creator-relative, format-aware, açıklanabilir.
// Tamamı saf fonksiyon (DB yok) → birim testlenebilir. multiplier = metric / medyan.
// Yetersiz örneklemde "insufficient" işaretler; asla sahte yüksek skor üretmez.

/** Bir baseline'ı güvenilir saymak için minimum örneklem. Altındaysa skor şüpheli. */
export const OUTLIER_MIN_SAMPLE = 3;

export type OutlierResult = {
  multiplier: number;
  insufficient: boolean;
  baselineMedian: number;
  sampleSize: number;
  explanation: {
    formula: string;
    reason: string;
  };
};

/** Saf medyan (kopyalar, mutasyon yok). Boş dizi → 0. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Outlier çarpanı: içeriğin metriği, aynı creator+format medyanına göre kaç kat.
 * - baselineMedian <= 0 veya örneklem eşiğin altında → insufficient=true, multiplier=0.
 * - Aksi halde multiplier = metricValue / baselineMedian (≥0).
 */
export function computeOutlier(
  metricValue: number,
  baselineMedian: number,
  sampleSize: number,
  minSample: number = OUTLIER_MIN_SAMPLE,
): OutlierResult {
  const insufficient = sampleSize < minSample || baselineMedian <= 0;
  const multiplier = insufficient ? 0 : Math.max(0, metricValue) / baselineMedian;
  return {
    multiplier: Number.isFinite(multiplier) ? multiplier : 0,
    insufficient,
    baselineMedian,
    sampleSize,
    explanation: {
      formula: "multiplier = metricValue / creatorFormatMedian",
      reason: insufficient
        ? sampleSize < minSample
          ? `yetersiz örneklem (${sampleSize} < ${minSample})`
          : "baseline medyanı 0 — güvenilir karşılaştırma yok"
        : `${metricValue.toFixed(0)} / ${baselineMedian.toFixed(0)} = ${multiplier.toFixed(2)}x`,
    },
  };
}

export type BaselineResult = { medianValue: number; sampleSize: number };

/** Creator+format penceresindeki metrik değerlerinden baseline (medyan + örneklem). */
export function computeBaseline(values: readonly number[]): BaselineResult {
  return { medianValue: median(values), sampleSize: values.length };
}
