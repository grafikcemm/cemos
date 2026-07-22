/**
 * Judge kalibrasyonu (Sprint 7 — EVALUATION-SPEC §5). SAF TS.
 *
 * İnsan-etiketli örneklemde alt-skor başına Cohen's κ ≥ KAPPA_FLOOR (0.6);
 * altında kalan alt-skor "düşük güven" etiketi alır ve kompozitten çıkarılır.
 * Etiketli veri operatör inceleme akışından birikir; haftalık cron bağlaması
 * veri var olduğunda yapılır (later.md).
 */

export const KAPPA_FLOOR = 0.6;

/** İkili (evet/hayır) etiket çiftlerinde Cohen's κ. */
export function cohensKappa(pairs: Array<{ judge: boolean; human: boolean }>): number | null {
  const n = pairs.length;
  if (n === 0) return null;
  let bothYes = 0;
  let bothNo = 0;
  let judgeYes = 0;
  let humanYes = 0;
  for (const p of pairs) {
    if (p.judge && p.human) bothYes++;
    if (!p.judge && !p.human) bothNo++;
    if (p.judge) judgeYes++;
    if (p.human) humanYes++;
  }
  const po = (bothYes + bothNo) / n;
  const pe =
    (judgeYes / n) * (humanYes / n) + ((n - judgeYes) / n) * ((n - humanYes) / n);
  if (pe === 1) return po === 1 ? 1 : 0;
  return Number((((po - pe) / (1 - pe)) as number).toFixed(4));
}

export type SubscoreConfidence = {
  subscore: string;
  kappa: number | null;
  lowConfidence: boolean; // κ tabanı altı → UI etiketi + kompozit dışı
};

export function assessSubscoreConfidence(
  subscore: string,
  pairs: Array<{ judge: boolean; human: boolean }>
): SubscoreConfidence {
  const kappa = cohensKappa(pairs);
  // Veri yok → karar verilemez; muhafazakâr: düşük güven SAYILMAZ (etiket
  // birikene kadar skor kompozitte kalır, ama kappa=null raporlanır).
  const lowConfidence = kappa !== null && kappa < KAPPA_FLOOR;
  return { subscore, kappa, lowConfidence };
}
