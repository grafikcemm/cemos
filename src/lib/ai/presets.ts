import type { ModelRole } from "@/lib/ai/model-config";

/**
 * CemOS model preset katmanı (FINAL-OPENROUTER-ROUTING §2 — slug'lar canlı
 * kataloğa uyarlandı, 2026-07-09).
 *
 * NOT — slug politikası: FINAL-OPENROUTER-ROUTING dated slug (`-\d{8}$`)
 * varsayıyordu; gerçek OpenRouter kataloğu (`/api/v1/models`) TARİHSİZ
 * canonical id kullanır (örn. `anthropic/claude-sonnet-5`). Karar (2026-07-09,
 * Ali Cem onayı): canlı katalog slug'ları canonical'dır. Startup lint artık
 * dated-regex yerine şunları zorlar:
 *   1. primary canlı-katalog snapshot'ında MEVCUT (drift saklanmaz);
 *   2. primary floating/preview/fast/fable/:free marker taşımaz;
 *   3. writer ailesi ≠ judge ailesi (C3 self-preference savunması);
 *   4. her preset farklı-sağlayıcı fallback zinciri taşır.
 * Canlı doğrulama: `npm run verify:catalog` (scripts/verify-model-catalog.ts)
 * — katalog erişilemez/slug yoksa AÇIK hata verir; sessiz mock fallback yasak.
 *
 * Bu katman mevcut rol registry'sinin (`model-config.ts`) ÜZERİNE oturur,
 * yeniden yazmaz: preset verilmeyen çağrılar eski `role` yolundan aynen çalışır
 * (additive rollback).
 */

export type PresetName =
  | "cemos-fast-extract"
  | "cemos-budget-batch"
  | "cemos-research"
  | "cemos-multimodal-audit"
  | "cemos-memory"
  | "cemos-writer"
  | "cemos-strategist"
  | "cemos-final-judge"
  | "cemos-image-concept";

export type PresetStructured = "json_schema" | "json_object" | "none";

export type PresetConfig = {
  name: PresetName;
  /** Rol registry köprüsü — maliyet tahmini ve maxTokens tavanı buradan gelir. */
  role: ModelRole;
  /** Canlı katalogda doğrulanmış canonical slug. Floating YASAK (lint kırar). */
  primary: string;
  /** Fallback zinciri — kural gereği en az bir farklı-sağlayıcı model. */
  fallbacks: string[];
  /** UsageLog.meta.purpose için varsayılan prefix (çağıran özel purpose verebilir). */
  purposePrefix: string;
  temperature: number;
  /**
   * Yapısal çıktı tercihi. NOT: routing tablosu writer için "none" der (serbest
   * yaratıcı metin) ama mevcut draft-pipeline JSON çoklu-taslak sözleşmesiyle
   * çalışır; bu yüzden writer "json_object" kullanır (davranış korunur).
   */
  structured: PresetStructured;
  /** Anthropic cache_control breakpoint (writer/strategist statik blokları). */
  cache: "anthropic-breakpoint" | "auto";
  dataCollection: "allow" | "deny";
  reasoning: "none" | "low" | "medium" | "high";
  /** provider.order — örn. ["anthropic"]. Boş = fiyat bazlı. */
  providerOrder?: string[];
  sort?: "price";
  /** OpenRouter provider.max_price, in USD per million tokens. */
  maxPrice: { prompt: number; completion: number };
  timeoutMs: number;
  retries: number;
};

/**
 * Canlı katalog snapshot'ı — `https://openrouter.ai/api/v1/models` çıktısına
 * karşı 2026-07-09'da tek tek doğrulandı (curl kanıtı Sprint 1 raporunda).
 * Primary bu listede yoksa lint THROW eder → build kırılır; sessiz fallback
 * production primary drift'ini saklayamaz. Canlı yeniden-doğrulama:
 * `npm run verify:catalog`.
 */
export const CATALOG_SNAPSHOT_DATE = "2026-07-09";
export const KNOWN_CATALOG: ReadonlySet<string> = new Set([
  "anthropic/claude-sonnet-5",
  "anthropic/claude-opus-4.8",
  "openai/gpt-5.5",
  "openai/gpt-5.4-mini",
  "google/gemini-3.5-flash",
  "google/gemini-3.1-flash-lite",
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-pro",
]);

/**
 * Floating/preview marker'ları: bunları taşıyan slug primary OLAMAZ.
 * (Katalogda gerçek örnekleri var: claude-opus-4.8-fast, claude-fable-5,
 * gemini-3.1-flash-lite-preview, :free varyantları.)
 */
const FLOATING_MARKERS = ["-latest", "-fast", "fable", "preview", ":free"];

export function isFloatingSlug(slug: string): boolean {
  const lower = slug.toLowerCase();
  return FLOATING_MARKERS.some((m) => lower.includes(m));
}

/** Sağlayıcı ailesi = slug prefix'i ("anthropic/claude-…" → "anthropic"). */
export function familyOf(slug: string): string {
  return slug.split("/")[0] ?? slug;
}

export const PRESETS: Record<PresetName, PresetConfig> = {
  "cemos-fast-extract": {
    name: "cemos-fast-extract",
    role: "cheapWriter",
    primary: "google/gemini-3.1-flash-lite",
    fallbacks: ["deepseek/deepseek-v4-flash", "google/gemini-3.5-flash"],
    purposePrefix: "extract_",
    temperature: 0,
    structured: "json_schema",
    cache: "auto",
    dataCollection: "allow",
    reasoning: "none",
    sort: "price",
    maxPrice: { prompt: 0.3, completion: 1.75 },
    timeoutMs: 15_000,
    retries: 1,
  },
  "cemos-budget-batch": {
    name: "cemos-budget-batch",
    role: "cheapWriter",
    primary: "deepseek/deepseek-v4-flash",
    fallbacks: ["google/gemini-3.1-flash-lite"],
    purposePrefix: "prefilter_",
    temperature: 0,
    structured: "json_schema",
    cache: "auto",
    dataCollection: "allow",
    reasoning: "none",
    sort: "price",
    maxPrice: { prompt: 0.12, completion: 0.25 },
    timeoutMs: 12_000,
    retries: 1,
  },
  "cemos-research": {
    name: "cemos-research",
    role: "qualityJudge",
    primary: "google/gemini-3.5-flash",
    fallbacks: ["deepseek/deepseek-v4-pro", "google/gemini-3.1-flash-lite"],
    purposePrefix: "research_",
    temperature: 0.3,
    structured: "json_schema",
    cache: "auto",
    dataCollection: "allow",
    reasoning: "low",
    sort: "price",
    maxPrice: { prompt: 1.75, completion: 10 },
    timeoutMs: 40_000,
    retries: 1,
  },
  "cemos-multimodal-audit": {
    name: "cemos-multimodal-audit",
    role: "qualityJudge",
    primary: "google/gemini-3.5-flash",
    fallbacks: ["deepseek/deepseek-v4-pro", "google/gemini-3.1-flash-lite"],
    purposePrefix: "audit_",
    temperature: 0.2,
    structured: "json_schema",
    cache: "auto",
    dataCollection: "allow",
    reasoning: "low",
    sort: "price",
    maxPrice: { prompt: 1.75, completion: 10 },
    timeoutMs: 45_000,
    retries: 1,
  },
  "cemos-memory": {
    name: "cemos-memory",
    role: "cheapWriter",
    primary: "deepseek/deepseek-v4-pro",
    fallbacks: ["google/gemini-3.5-flash"],
    purposePrefix: "memory_",
    temperature: 0.1,
    structured: "json_schema",
    cache: "auto",
    dataCollection: "deny",
    reasoning: "none",
    sort: "price",
    maxPrice: { prompt: 0.5, completion: 1 },
    timeoutMs: 30_000,
    retries: 1,
  },
  "cemos-writer": {
    name: "cemos-writer",
    role: "creativeWriter",
    primary: "anthropic/claude-sonnet-5",
    fallbacks: ["deepseek/deepseek-v4-pro", "google/gemini-3.5-flash"],
    purposePrefix: "writer_",
    temperature: 0.9,
    // Routing tablosunda "none"; draft-pipeline JSON sözleşmesi için json_object.
    structured: "json_object",
    cache: "anthropic-breakpoint",
    dataCollection: "deny",
    reasoning: "medium",
    providerOrder: ["anthropic"],
    maxPrice: { prompt: 2.25, completion: 11 },
    timeoutMs: 45_000,
    retries: 1,
  },
  "cemos-strategist": {
    name: "cemos-strategist",
    role: "qualityJudge",
    primary: "anthropic/claude-sonnet-5",
    fallbacks: ["openai/gpt-5.4-mini", "google/gemini-3.5-flash"],
    purposePrefix: "strategy_",
    temperature: 0.4,
    structured: "json_schema",
    cache: "anthropic-breakpoint",
    dataCollection: "deny",
    reasoning: "high",
    providerOrder: ["anthropic"],
    maxPrice: { prompt: 2.25, completion: 11 },
    timeoutMs: 60_000,
    retries: 1,
  },
  "cemos-final-judge": {
    name: "cemos-final-judge",
    role: "viralJudge",
    // C3: writer'la KARŞI aile (Anthropic writer / OpenAI judge).
    // GPT-5.4 mini keeps the writer/judge family split at a fraction of GPT-5.5 cost.
    primary: "openai/gpt-5.4-mini",
    fallbacks: ["deepseek/deepseek-v4-pro", "google/gemini-3.1-flash-lite"],
    purposePrefix: "judge_",
    temperature: 0.2,
    structured: "json_schema",
    cache: "auto",
    dataCollection: "deny",
    reasoning: "low",
    providerOrder: ["openai"],
    maxPrice: { prompt: 0.9, completion: 5 },
    timeoutMs: 30_000,
    retries: 1,
  },
  "cemos-image-concept": {
    name: "cemos-image-concept",
    role: "creativeWriter",
    primary: "google/gemini-3.5-flash",
    fallbacks: ["deepseek/deepseek-v4-pro"],
    purposePrefix: "image_",
    temperature: 0.7,
    structured: "json_schema",
    cache: "auto",
    dataCollection: "deny",
    reasoning: "low",
    sort: "price",
    maxPrice: { prompt: 1.75, completion: 10 },
    timeoutMs: 30_000,
    retries: 1,
  },
};

export function resolvePreset(name: PresetName): PresetConfig {
  const preset = PRESETS[name];
  if (!preset) {
    throw new Error(`Bilinmeyen model preset'i: ${name}`);
  }
  return preset;
}

/**
 * Startup / CI lint'i. İhlalde throw → build kırılır:
 *  1. Her primary doğrulanmış katalog snapshot'ında mevcut (drift saklanmaz).
 *  2. Hiçbir primary floating/preview marker taşımaz.
 *  3. Writer ailesi ≠ judge ailesi (C3 self-preference savunması).
 *  4. Her preset en az bir farklı-sağlayıcı fallback taşır.
 * Canlı katalog kontrolü: `npm run verify:catalog`.
 */
export function validatePresets(): void {
  const errors: string[] = [];

  for (const preset of Object.values(PRESETS)) {
    if (isFloatingSlug(preset.primary)) {
      errors.push(`${preset.name}: floating slug primary olamaz (${preset.primary})`);
    }
    if (!KNOWN_CATALOG.has(preset.primary)) {
      errors.push(
        `${preset.name}: primary katalog snapshot'ında (${CATALOG_SNAPSHOT_DATE}) yok (${preset.primary})`,
      );
    }
    const primaryFamily = familyOf(preset.primary);
    if (!preset.fallbacks.some((f) => familyOf(f) !== primaryFamily)) {
      errors.push(`${preset.name}: farklı-sağlayıcı fallback yok`);
    }
  }

  for (const preset of Object.values(PRESETS)) {
    if (preset.maxPrice.prompt <= 0 || preset.maxPrice.completion <= 0) {
      errors.push(`${preset.name}: provider max_price pozitif olmali`);
    }
  }

  const writerFamily = familyOf(PRESETS["cemos-writer"].primary);
  const judgeFamily = familyOf(PRESETS["cemos-final-judge"].primary);
  if (writerFamily === judgeFamily) {
    errors.push(
      `writer ailesi (${writerFamily}) judge ailesiyle (${judgeFamily}) aynı olamaz (C3)`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`Model preset lint hatası:\n- ${errors.join("\n- ")}`);
  }
}
