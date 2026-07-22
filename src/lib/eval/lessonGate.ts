/**
 * İki-kapılı ders doğrulama + MARKA VETOSU (Sprint 7 — EVALUATION-SPEC §4).
 *
 * Tek şanslı post ASLA kural olamaz:
 *  (a) repetition: supportCount ≥ MIN_SUPPORT (3)
 *  (b) significance: normalize-lift güven aralığı 0'ı dışlar (Mann-Whitney U
 *      normal yaklaşımı — küçük örneklemde muhafazakâr)
 *  (c) MARKA VETOSU: engagement artıran ama edit-distance / ret oranını da
 *      artıran ders REDDEDİLİR (clickbait'in yapısal freni).
 * SAF TS — LLM yok, DB yok; çağıran aday dersleri toplar.
 */

export const MIN_SUPPORT = 3;
export const SIGNIFICANCE_Z = 1.96; // ~%95

export type CandidateLesson = {
  lessonKey: string;
  /** Dersi taşıyan postların normalize performansları. */
  withLesson: number[];
  /** Kontrol grubu (dersi taşımayan) normalize performanslar. */
  without: number[];
  /** Marka sinyalleri — ders grubunda vs kontrolde. */
  brand: {
    medianEditDistanceWith: number;
    medianEditDistanceWithout: number;
    rejectRateWith: number; // 0-1
    rejectRateWithout: number;
  };
};

export type LessonVerdict = {
  lessonKey: string;
  promoted: boolean;
  reason:
    | "promoted"
    | "insufficient_support"
    | "not_significant"
    | "brand_veto_edit_distance"
    | "brand_veto_reject_rate";
  supportCount: number;
  pApprox: number | null;
};

/** Mann-Whitney U — normal yaklaşımlı iki-kuyruklu p (bağ düzeltmesiz, muhafazakâr). */
export function mannWhitneyP(a: number[], b: number[]): number | null {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 3 || n2 < 3) return null; // küçük örneklem → karar verme
  const all = [...a.map((v) => ({ v, g: 0 })), ...b.map((v) => ({ v, g: 1 }))].sort(
    (x, y) => x.v - y.v
  );
  // Ortalama rank (bağlar için basit ortalama).
  const ranks = new Array<number>(all.length);
  let i = 0;
  while (i < all.length) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }
  let r1 = 0;
  all.forEach((e, idx) => {
    if (e.g === 0) r1 += ranks[idx];
  });
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  if (sigma === 0) return 1;
  const z = Math.abs((u1 - mu) / sigma);
  // İki kuyruklu p — normal CDF yaklaşımı (Abramowitz-Stegun).
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const poly = t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return Math.min(1, 2 * d * poly);
}

const BRAND_EDIT_DISTANCE_TOLERANCE = 0.05; // ders grubu bu kadardan fazla KÖTÜLEŞEMEZ
const BRAND_REJECT_TOLERANCE = 0.05;

export function evaluateLesson(candidate: CandidateLesson): LessonVerdict {
  const supportCount = candidate.withLesson.length;

  // (a) repetition kapısı
  if (supportCount < MIN_SUPPORT) {
    return { lessonKey: candidate.lessonKey, promoted: false, reason: "insufficient_support", supportCount, pApprox: null };
  }

  // (c) MARKA VETOSU — significance'tan ÖNCE: metrik ne derse desin marka bozuluyorsa RED.
  const b = candidate.brand;
  if (b.medianEditDistanceWith > b.medianEditDistanceWithout + BRAND_EDIT_DISTANCE_TOLERANCE) {
    return { lessonKey: candidate.lessonKey, promoted: false, reason: "brand_veto_edit_distance", supportCount, pApprox: null };
  }
  if (b.rejectRateWith > b.rejectRateWithout + BRAND_REJECT_TOLERANCE) {
    return { lessonKey: candidate.lessonKey, promoted: false, reason: "brand_veto_reject_rate", supportCount, pApprox: null };
  }

  // (b) significance kapısı
  const p = mannWhitneyP(candidate.withLesson, candidate.without);
  const meanWith = candidate.withLesson.reduce((x, y) => x + y, 0) / supportCount;
  const meanWithout =
    candidate.without.length > 0
      ? candidate.without.reduce((x, y) => x + y, 0) / candidate.without.length
      : 0;
  const significant = p !== null && p < 0.05 && meanWith > meanWithout;
  if (!significant) {
    return { lessonKey: candidate.lessonKey, promoted: false, reason: "not_significant", supportCount, pApprox: p };
  }

  return { lessonKey: candidate.lessonKey, promoted: true, reason: "promoted", supportCount, pApprox: p };
}
