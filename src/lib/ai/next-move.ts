/**
 * NextMove (payoff) — the article's "path" idea applied as a CONTENT-quality
 * signal, NOT a revenue CTA. Every viral tweet should imply one concrete next
 * action it drives in the reader (kaydet, yanıt, takip, …). A draft that implies
 * none is usually flat — that is what the leak detector flags as `no_payoff`.
 *
 * Canonical source of truth for both generation paths:
 *  - LIVE path: src/lib/ai/prompts.ts (DraftScore / RankedCandidate / DraftWithAngle)
 *  - growth-engine path: src/lib/growth-engine/types.ts (DraftVariantSchema)
 */

export const NEXT_MOVES = [
  "save",
  "reply",
  "follow",
  "quote",
  "profile_visit",
  "none",
] as const;

export type NextMove = (typeof NEXT_MOVES)[number];

/** Turkish UI labels for the queue drawer "SONRAKİ HAREKET" row. */
export const NEXT_MOVE_LABELS_TR: Record<NextMove, string> = {
  save: "Kaydet",
  reply: "Yanıt / tartışma",
  follow: "Takip",
  quote: "Alıntı",
  profile_visit: "Profil ziyareti",
  none: "Yok",
};

/** Short prompt-facing descriptions so the writer picks a real next-move. */
export const NEXT_MOVE_PROMPT_HINTS: Record<NextMove, string> = {
  save: "kaydedilmeyi hak eden döküm/referans",
  reply: "yorum/tartışma tetikleyen net iddia",
  follow: "'bu hesabı takip etmeliyim' dedirten otorite",
  quote: "alıntılanmaya değer keskin tespit",
  profile_visit: "profile/bağlantıya merak uyandıran ipucu",
  none: "net bir sonraki hareket yok (kaçınılmalı)",
};

/** Safely narrow any unknown value to a valid NextMove, defaulting to "none". */
export function normalizeNextMove(value: unknown): NextMove {
  return typeof value === "string" && (NEXT_MOVES as readonly string[]).includes(value)
    ? (value as NextMove)
    : "none";
}
