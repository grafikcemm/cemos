import type { DraftScore } from "@/lib/ai/prompts";
import type { Leak } from "@/lib/growth-engine/leak-detector";
import type { LintIssue } from "@/lib/safety/heuristics";

/**
 * Sprint 1 ayrışık alt-sinyal sözleşmesi (FIRST-SPRINT item 7):
 * her günlük QueueItem.scores JSON'ı bu 8 anahtarı + leaks[] HER ZAMAN taşır.
 * UI tek "viral sayı" göstermez; bu ayrışık sinyalleri gösterir.
 */
export type SubSignals = {
  personaMatch: number;
  hookStrength: number;
  clarity: number;
  turkishNaturalness: number;
  novelty: number;
  risk: number;
  sourceFaithfulness: number;
  payoff: string;
  leaks: Leak[];
};

/** Cap-altı Türkçe doğallık `active` olamaz (FIRST-SPRINT item 8/9 kabulü). */
export const TURKISH_NATURALNESS_MIN = 55;

function toScore(value: unknown): number {
  if (typeof value !== "number" || isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Winner'dan 8 alt-sinyali güvenli biçimde çıkarır — eksik alan 0'a düşer,
 *  anahtar asla eksik kalmaz. */
export function extractSubSignals(winner: Partial<DraftScore>, leaks: Leak[]): SubSignals {
  return {
    personaMatch: toScore(winner.personaMatch),
    hookStrength: toScore(winner.hookStrength),
    clarity: toScore(winner.clarity),
    turkishNaturalness: toScore(winner.turkishNaturalness),
    novelty: toScore(winner.novelty),
    risk: toScore(winner.risk),
    sourceFaithfulness: toScore(winner.sourceFaithfulness),
    payoff: typeof winner.payoff === "string" && winner.payoff ? winner.payoff : "none",
    leaks: Array.isArray(leaks) ? leaks : [],
  };
}

export type QualityGateInput = {
  leaks: Leak[];
  /** Judge gerçekten koştu mu? Fast-path'lerde alt-skorlar 0'dır — cap uygulanmaz. */
  judged: boolean;
  turkishNaturalness: number;
  /** Deterministik lint bulguları (banned_phrase / question_cta yönlendirir). */
  lintIssues: LintIssue[];
};

export type QualityGateResult = {
  /** "needs_edit": taslak silinmez, düzenlenmeden yayınlanamaz (redirect). */
  status: "new" | "needs_edit";
  /** Türkçe, kullanıcıya gösterilebilir nedenler (lintReport'a eklenir). */
  notes: string[];
};

/**
 * Bloklayıcı kalite kapısı (FIRST-SPRINT item 8):
 * yüksek-şiddet leak VEYA cap-altı Türkçe doğallık VEYA yasak-klişe/soru-CTA
 * → taslak `active` olamaz; `needs_edit` + Türkçe neden ile kuyruğa düşer.
 * Redirect, silme değil — operatör düzenleyip yayınlayabilir.
 */
export function applyQualityGate(input: QualityGateInput): QualityGateResult {
  const notes: string[] = [];

  for (const leak of input.leaks) {
    if (leak.severity === "high") {
      notes.push(`Yüksek riskli sızıntı (${leak.kind}): ${leak.note}`);
    }
  }

  if (input.judged && input.turkishNaturalness < TURKISH_NATURALNESS_MIN) {
    notes.push(
      `Türkçe doğallık düşük (${input.turkishNaturalness}/100, alt sınır ${TURKISH_NATURALNESS_MIN}). Yayından önce elden geçir.`,
    );
  }

  for (const issue of input.lintIssues) {
    if (issue.code === "banned_phrase" || issue.code === "question_cta") {
      notes.push(issue.message);
    }
  }

  return { status: notes.length > 0 ? "needs_edit" : "new", notes };
}
