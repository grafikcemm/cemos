/**
 * Leak detector — the article's "Leak Detection" reframed as a CONTENT-QUALITY
 * gate (not revenue). It flags the concrete reasons a tweet will under-perform:
 * weak hook, no payoff/next-move, off-pillar drift, a naked link, or generic
 * "content waste" with no concrete anchor. Pure function over data the pipeline
 * already produces — surfaced in the queue drawer so the operator (or the loop)
 * can fix the leak before publishing.
 */

import type { NextMove } from "@/lib/ai/next-move";

const CONCEPT_STOPWORDS = new Set([
  "için", "gibi", "olarak", "ile", "veya", "yani", "ama", "çok", "daha", "kadar",
  "sonra", "önce", "bir", "bu", "şu", "hem", "ya", "ki", "the", "and",
]);

/** Distill an account `concept` string into lowercase keyword tokens for off-pillar checks. */
export function conceptKeywordsFrom(concept: string): string[] {
  const tokens = (concept ?? "")
    .toLowerCase()
    .split(/[^a-zçğıöşü0-9]+/i)
    .filter((t) => t.length > 3 && !CONCEPT_STOPWORDS.has(t));
  return Array.from(new Set(tokens));
}

export type LeakKind = "weak_hook" | "no_payoff" | "off_pillar" | "naked_link" | "generic";
export type LeakSeverity = "low" | "med" | "high";

export type Leak = {
  kind: LeakKind;
  severity: LeakSeverity;
  /** Turkish, operator-facing one-liner. */
  note: string;
};

export type DetectLeaksInput = {
  content: string;
  mode: string;
  payoff?: NextMove;
  /** Judged hook score (0-100). Undefined => not judged => weak_hook skipped. */
  hookStrength?: number;
  /** Account's own pillar mode ids (accountProfiles[handle].modes[].id). */
  knownPillars: string[];
  /** Tokens distilled from the account concept; empty => off-pillar keyword check skipped. */
  conceptKeywords?: string[];
  /** grafikcem-style accounts require a concrete anchor (tool/number); default false. */
  requireConcreteAnchor?: boolean;
};

const WEAK_HOOK_THRESHOLD = 55;
const WEAK_HOOK_HIGH_THRESHOLD = 40;

/** Modes where a missing payoff is a high-severity leak (long form / value drops). */
const HIGH_PAYOFF_MODES = new Set([
  "thread",
  "tool_spotlight",
  "repo_kaynak",
  "sistem_analizi",
  "disiplin_notu",
]);

const URL_REGEX = /(https?:\/\/|www\.)\S+/i;
const NAKED_LINK_CONTEXT_MIN = 60;

function hasConcreteAnchor(content: string): boolean {
  // A digit (number/price/ratio) is the cheapest concrete anchor.
  if (/\d/.test(content)) return true;
  // A capitalized token that is NOT the first word — proxy for a named tool/product.
  const tokens = content.split(/\s+/);
  for (let i = 1; i < tokens.length; i++) {
    const cleaned = tokens[i].replace(/[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/g, "");
    if (cleaned.length >= 2 && /^[A-ZÇĞİÖŞÜ]/.test(cleaned)) return true;
  }
  return false;
}

function countKeywordHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => kw && lower.includes(kw.toLowerCase())).length;
}

/**
 * Detect content-quality leaks for a single draft. Returns [] when clean.
 * Deterministic and side-effect free — safe to call in tests and the live path.
 */
export function detectLeaks(input: DetectLeaksInput): Leak[] {
  const leaks: Leak[] = [];
  const content = input.content ?? "";
  const mode = input.mode ?? "";

  // 1. weak_hook — only when we actually have a judged hook score.
  if (typeof input.hookStrength === "number" && Number.isFinite(input.hookStrength)) {
    if (input.hookStrength < WEAK_HOOK_HIGH_THRESHOLD) {
      leaks.push({ kind: "weak_hook", severity: "high", note: "Hook çok zayıf; ilk cümle durdurmuyor." });
    } else if (input.hookStrength < WEAK_HOOK_THRESHOLD) {
      leaks.push({ kind: "weak_hook", severity: "med", note: "Hook zayıf; açılışı sertleştir." });
    }
  }

  // 2. no_payoff — the draft drives no concrete next move.
  if (input.payoff === "none") {
    const severity: LeakSeverity = HIGH_PAYOFF_MODES.has(mode) ? "high" : "med";
    leaks.push({
      kind: "no_payoff",
      severity,
      note: "Net bir sonraki hareket (payoff) yok; düz kapanış.",
    });
  }

  // 3. off_pillar — drifts off the account's known pillars / concept.
  if (input.knownPillars.length > 0 && !input.knownPillars.includes(mode)) {
    leaks.push({ kind: "off_pillar", severity: "high", note: `Konu dışı: '${mode}' hesabın direklerinde değil.` });
  } else if (input.conceptKeywords && input.conceptKeywords.length > 0) {
    if (countKeywordHits(content, input.conceptKeywords) === 0) {
      leaks.push({ kind: "off_pillar", severity: "low", note: "İçerik hesabın ana konseptinden uzak duruyor." });
    }
  }

  // 4. naked_link — a URL with almost no surrounding context.
  const urlMatch = content.match(URL_REGEX);
  if (urlMatch) {
    const contextLen = content.length - urlMatch[0].length;
    if (contextLen < NAKED_LINK_CONTEXT_MIN) {
      leaks.push({ kind: "naked_link", severity: "high", note: "Bağlamsız çıplak link; değer/yorum ekle." });
    }
  }

  // 5. generic — "content waste": no concrete anchor where one is expected.
  if (input.requireConcreteAnchor && content.trim().length > 40 && !hasConcreteAnchor(content)) {
    leaks.push({ kind: "generic", severity: "low", note: "Somut çapa yok (araç adı / sayı / oran)." });
  }

  return leaks;
}
