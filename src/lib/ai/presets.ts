import type { ModelRole } from "@/lib/ai/model-config";

/**
 * CemOS model preset katmanı (FINAL-OPENROUTER-ROUTING §2, 2026-07-08 kataloğu).
 *
 * Bu katman mevcut rol registry'sinin (`model-config.ts`) ÜZERİNE oturur,
 * yeniden yazmaz: preset verilmeyen çağrılar eski `role` yolundan aynen çalışır
 * (additive rollback). Kurallar:
 *   - primary = pinned dated slug (regex `-\d{8}$`) ve katalog snapshot'ında mevcut;
 *   - floating (`-latest` / `-fast` / `fable` / `preview` / `:free`) YALNIZ fallback;
 *   - writer ailesi ≠ judge ailesi (self-preference savunması, C3);
 *   - her preset farklı-sağlayıcı fallback zinciri taşır.
 * `validatePresets()` bu kuralları startup'ta ve CI'da (vitest) zorlar.
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
  /** Pinned dated slug. Floating primary YASAK (startup lint kırar). */
  primary: string;
  /** Fallback zinciri — floating slug'lara yalnız burada izin var. */
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
  timeoutMs: number;
  retries: number;
};

/**
 * Doğrulanmış katalog snapshot'ı — FINAL-OPENROUTER-ROUTING §1
 * (`https://openrouter.ai/api/v1/models`, 2026-07-08). Primary slug bu listede
 * yoksa build KIRILIR; sessiz fallback production primary drift'i saklamaz.
 * Canlı katalog her build başında ayrıca doğrulanmalı (V1: AiModelSnapshot).
 */
export const CATALOG_SNAPSHOT_DATE = "2026-07-08";
export const KNOWN_CATALOG: ReadonlySet<string> = new Set([
  "anthropic/claude-sonnet-5-20260630",
  "anthropic/claude-4.8-opus-20260528",
  "openai/gpt-5.5-20260423",
  "openai/gpt-5.5-pro-20260423",
  "google/gemini-3.5-flash-20260519",
  "google/gemini-3.1-flash-lite-20260507",
  "google/gemini-3-pro-image-20260528",
  "deepseek/deepseek-v4-flash-20260423",
  "deepseek/deepseek-v4-pro-20260423",
  "openai/text-embedding-3-small",
  // Floating — yalnız fallback olarak geçerli:
  "anthropic/claude-sonnet-latest",
  "openai/gpt-mini-latest",
  "google/gemini-pro-latest",
  "google/gemini-flash-latest",
]);

const PINNED_SLUG_RE = /-\d{8}$/;
const FLOATING_MARKERS = ["-latest", "-fast", "fable", "preview", ":free"];

export function isPinnedSlug(slug: string): boolean {
  return PINNED_SLUG_RE.test(slug);
}

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
    primary: "google/gemini-3.1-flash-lite-20260507",
    fallbacks: ["deepseek/deepseek-v4-flash-20260423", "google/gemini-3.5-flash-20260519"],
    purposePrefix: "extract_",
    temperature: 0,
    structured: "json_schema",
    cache: "auto",
    dataCollection: "allow",
    reasoning: "none",
    sort: "price",
    timeoutMs: 15_000,
    retries: 1,
  },
  "cemos-budget-batch": {
    name: "cemos-budget-batch",
    role: "cheapWriter",
    primary: "deepseek/deepseek-v4-flash-20260423",
    fallbacks: ["google/gemini-3.1-flash-lite-20260507"],
    purposePrefix: "prefilter_",
    temperature: 0,
    structured: "json_schema",
    cache: "auto",
    dataCollection: "allow",
    reasoning: "none",
    sort: "price",
    timeoutMs: 12_000,
    retries: 1,
  },
  "cemos-research": {
    name: "cemos-research",
    role: "qualityJudge",
    primary: "google/gemini-3.5-flash-20260519",
    fallbacks: ["deepseek/deepseek-v4-pro-20260423", "openai/gpt-5.5-20260423"],
    purposePrefix: "research_",
    temperature: 0.3,
    structured: "json_schema",
    cache: "auto",
    dataCollection: "allow",
    reasoning: "low",
    sort: "price",
    timeoutMs: 40_000,
    retries: 1,
  },
  "cemos-multimodal-audit": {
    name: "cemos-multimodal-audit",
    role: "qualityJudge",
    primary: "google/gemini-3.5-flash-20260519",
    fallbacks: ["google/gemini-pro-latest", "openai/gpt-5.5-20260423"],
    purposePrefix: "audit_",
    temperature: 0.2,
    structured: "json_schema",
    cache: "auto",
    dataCollection: "allow",
    reasoning: "low",
    sort: "price",
    timeoutMs: 45_000,
    retries: 1,
  },
  "cemos-memory": {
    name: "cemos-memory",
    role: "cheapWriter",
    primary: "deepseek/deepseek-v4-pro-20260423",
    fallbacks: ["google/gemini-3.5-flash-20260519"],
    purposePrefix: "memory_",
    temperature: 0.1,
    structured: "json_schema",
    cache: "auto",
    dataCollection: "deny",
    reasoning: "none",
    sort: "price",
    timeoutMs: 30_000,
    retries: 1,
  },
  "cemos-writer": {
    name: "cemos-writer",
    role: "creativeWriter",
    primary: "anthropic/claude-sonnet-5-20260630",
    fallbacks: ["openai/gpt-5.5-20260423", "google/gemini-pro-latest"],
    purposePrefix: "writer_",
    temperature: 0.9,
    // Routing tablosunda "none"; draft-pipeline JSON sözleşmesi için json_object.
    structured: "json_object",
    cache: "anthropic-breakpoint",
    dataCollection: "deny",
    reasoning: "medium",
    providerOrder: ["anthropic"],
    timeoutMs: 45_000,
    retries: 1,
  },
  "cemos-strategist": {
    name: "cemos-strategist",
    role: "qualityJudge",
    primary: "anthropic/claude-sonnet-5-20260630",
    fallbacks: ["openai/gpt-5.5-20260423", "google/gemini-3.5-flash-20260519"],
    purposePrefix: "strategy_",
    temperature: 0.4,
    structured: "json_schema",
    cache: "anthropic-breakpoint",
    dataCollection: "deny",
    reasoning: "high",
    providerOrder: ["anthropic"],
    timeoutMs: 60_000,
    retries: 1,
  },
  "cemos-final-judge": {
    name: "cemos-final-judge",
    role: "viralJudge",
    // C3: writer'la KARŞI aile (Anthropic writer / OpenAI judge).
    primary: "openai/gpt-5.5-20260423",
    fallbacks: ["google/gemini-3.5-flash-20260519", "anthropic/claude-sonnet-5-20260630"],
    purposePrefix: "judge_",
    temperature: 0.2,
    structured: "json_schema",
    cache: "auto",
    dataCollection: "deny",
    reasoning: "low",
    providerOrder: ["openai"],
    timeoutMs: 30_000,
    retries: 1,
  },
  "cemos-image-concept": {
    name: "cemos-image-concept",
    role: "creativeWriter",
    primary: "google/gemini-3.5-flash-20260519",
    fallbacks: ["anthropic/claude-sonnet-5-20260630"],
    purposePrefix: "image_",
    temperature: 0.7,
    structured: "json_schema",
    cache: "auto",
    dataCollection: "deny",
    reasoning: "low",
    sort: "price",
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
 *  1. Her primary pinned dated slug olmalı (floating primary YASAK).
 *  2. Her primary katalog snapshot'ında mevcut olmalı (drift saklanmaz).
 *  3. Writer ailesi ≠ judge ailesi (C3 self-preference savunması).
 *  4. Her preset en az bir farklı-sağlayıcı fallback taşımalı.
 */
export function validatePresets(): void {
  const errors: string[] = [];

  for (const preset of Object.values(PRESETS)) {
    if (!isPinnedSlug(preset.primary)) {
      errors.push(`${preset.name}: primary pinned değil (${preset.primary})`);
    }
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
