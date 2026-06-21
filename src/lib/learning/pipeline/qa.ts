/**
 * CemOS Learn — DETERMİNİSTİK QA kapısı. Üretilen iddiaların/item'ların grounding
 * çapalarını doğrular (chunkIdx menzilde mi, source_supported gerçekten kaynaklı mı).
 * LLM judge'tan daha güvenilir + ücretsiz. Pack yalnız verdict==="pass" ise hazır.
 */

import type { GroundingType, QaReport } from "@/lib/learning/types";

export type ClaimLike = { text: string; chunkIdx: number; groundingType: GroundingType };
export type ItemLike = { front: string; chunkIdx: number; groundingType: GroundingType };

export type QaInput = {
  claims: ClaimLike[];
  items: ItemLike[];
  chunkCount: number;
};

const PASS_THRESHOLD = 0.6;
const REVIEW_THRESHOLD = 0.3;

function validIdx(idx: number, chunkCount: number): boolean {
  return Number.isInteger(idx) && idx >= 0 && idx < chunkCount;
}

/**
 * Coverage = geçerli kaynak-destekli iddia oranı. Geçersiz chunkIdx taşıyan
 * source_supported öğeler flag'lenir (halüsinasyon çapası). Verdict eşiklere göre.
 */
export function computeQaReport(input: QaInput): QaReport {
  const flagged: { claim: string; reason: string }[] = [];
  const totalClaims = input.claims.length;

  let supportedValid = 0;
  for (const c of input.claims) {
    if (c.groundingType === "source_supported") {
      if (validIdx(c.chunkIdx, input.chunkCount)) supportedValid += 1;
      else flagged.push({ claim: c.text, reason: `geçersiz chunkIdx ${c.chunkIdx} (source_supported)` });
    }
  }

  // Item çapası da doğrulanır (geçersiz olanlar flag).
  for (const it of input.items) {
    if (it.groundingType === "source_supported" && !validIdx(it.chunkIdx, input.chunkCount)) {
      flagged.push({ claim: it.front, reason: `item geçersiz chunkIdx ${it.chunkIdx}` });
    }
  }

  // İddia yoksa item temelli bir taban coverage (en az item'lar grounded mı).
  let coverage: number;
  if (totalClaims > 0) {
    coverage = supportedValid / totalClaims;
  } else if (input.items.length > 0) {
    const itemsValid = input.items.filter(
      (it) => validIdx(it.chunkIdx, input.chunkCount)
    ).length;
    coverage = itemsValid / input.items.length;
  } else {
    coverage = 0;
  }

  let verdict: QaReport["verdict"];
  if (coverage >= PASS_THRESHOLD) verdict = "pass";
  else if (coverage >= REVIEW_THRESHOLD) verdict = "review";
  else verdict = "fail";

  return { coverage: Math.round(coverage * 100) / 100, verdict, flagged };
}

/** QA verdict → pack status. */
export function packStatusForVerdict(verdict: QaReport["verdict"]): string {
  if (verdict === "pass") return "ready";
  if (verdict === "review") return "qa_pending";
  return "qa_failed";
}
