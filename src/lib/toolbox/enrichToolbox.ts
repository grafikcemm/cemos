/**
 * Pure enrichment helpers for the toolbox. No I/O — the CLI script
 * (scripts/enrich-toolbox.ts) wires these to Prisma + the LLM; tests exercise
 * them in isolation.
 */

export const ENRICH_PLATFORMS = ["X", "IG", "YT", "genel"] as const;
export const ENRICH_RELIABILITIES = ["high", "medium", "low"] as const;
const MAX_FIELD_LEN = 80;

export type EnrichInput = {
  title: string;
  url: string;
  category: string;
  description: string;
  whyUseful: string | null;
};

export type EnrichResult = {
  platform: string;
  useCase: string;
  contentFormat: string;
  sourceReliability: string;
  xValueScore: number;
};

/** Builds the system+user prompt for one resource. */
export function buildEnrichPrompt(r: EnrichInput): { system: string; user: string } {
  const system = [
    "Sen bir içerik-strateji asistanısın. Verilen aracı/kaynağı analiz et ve SADECE JSON döndür.",
    "Alanlar:",
    `- platform: ${ENRICH_PLATFORMS.join(" | ")} (bu kaynak en çok hangi platform içeriği üretir)`,
    "- useCase: kısa Türkçe etiket (örn: Mockup, İlham, Rakip Takip, Stok Görsel, Otomasyon)",
    "- contentFormat: ürettiği içerik formatı (örn: görsel, video, thread, carousel, kod)",
    `- sourceReliability: ${ENRICH_RELIABILITIES.join(" | ")}`,
    "- xValueScore: 0-100 tam sayı (bu kaynak ne kadar X/Twitter içeriği üretebilir)",
  ].join("\n");

  const user = [
    `Başlık: ${r.title}`,
    `Kategori: ${r.category}`,
    `URL: ${r.url}`,
    r.description ? `Açıklama: ${r.description}` : "",
    r.whyUseful ? `Neden faydalı: ${r.whyUseful}` : "",
    "",
    'JSON formatı: {"platform":"","useCase":"","contentFormat":"","sourceReliability":"","xValueScore":0}',
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

/**
 * Validates + normalizes a raw LLM JSON object into an EnrichResult.
 * Defensive: whitelists platform/reliability, clamps the score to 0..100,
 * trims free-text. Returns null when useCase is missing — useCase is the
 * signal that a row is "enriched", so a half-answer is skipped rather than
 * half-written.
 */
export function applyEnrichment(raw: unknown): EnrichResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const useCase = cleanText(o.useCase);
  if (!useCase) return null;

  const platformRaw = String(o.platform ?? "");
  const platform = (ENRICH_PLATFORMS as readonly string[]).includes(platformRaw) ? platformRaw : "genel";

  const reliabilityRaw = String(o.sourceReliability ?? "");
  const sourceReliability = (ENRICH_RELIABILITIES as readonly string[]).includes(reliabilityRaw)
    ? reliabilityRaw
    : "medium";

  const scoreNum = Number(o.xValueScore);
  const xValueScore = Number.isFinite(scoreNum) ? Math.max(0, Math.min(100, Math.round(scoreNum))) : 0;

  return {
    platform,
    useCase,
    contentFormat: cleanText(o.contentFormat),
    sourceReliability,
    xValueScore,
  };
}

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_FIELD_LEN) : "";
}
