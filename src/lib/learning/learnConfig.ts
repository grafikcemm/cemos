/**
 * CemOS Learn — env-reader sabitler (Faz L). ytConfig.ts deseni: env'i runtime'da
 * okur, güvenli default. Tüm modül LEARN_ENABLED arkasında; kapalıyken route'lar
 * "disabled" döner, cron sweep no-op olur.
 */

import type { ModelRole } from "@/lib/ai/model-config";
import type { LearnStage } from "./pipeline/stages";

/** UsageLog.meta.purpose prefix'i — getMonthlySpendByPurpose("learn_") ile uyumlu. */
export const LEARN_PURPOSE = "learn_pack";

/** Pipeline + prompt versiyonu. Pack cache anahtarı; bump → yeniden üretim. */
export const PIPELINE_VERSION = "v1";
export const PROMPT_VERSION = "v1";

/** Bir advance çağrısının kendine koyduğu yumuşak deadline (ms). Route maxDuration=300
 *  olsa da kısa tutmak canlı ilerleme + cache-warm tutar. */
export const ADVANCE_DEADLINE_MS = 45_000;

/** Cron sweep'in kalan bütçeden Learn'e ayırdığı süre (ms). */
export const LEARN_SWEEP_DEADLINE_MS = 40_000;

/** Bayat job lease eşiği (ms): heartbeatAt bundan eskiyse sweep devralır. */
export const STALE_LEASE_MS = 2 * 60_000;

/** Mevcut aşama retry tavanı; aşılırsa job failed (currentStage korunur). */
export const MAX_STAGE_ATTEMPTS = 3;

/** Aralıklı tekrar gün ladder'ı. srs.ts saf fonksiyonları bunu kullanır. */
export const REVIEW_LADDER_DAYS: readonly number[] = [1, 3, 7, 14, 30];

/** Transkript validate eşiği: bundan kısa transkript = "transkript yok" sert dur. */
export const MIN_TRANSCRIPT_CHARS = 200;

/** Chunk hedef boyutu (karakter) ve section başına chunk sayısı (map-reduce). */
export const CHUNK_TARGET_CHARS = 1_200;
export const CHUNKS_PER_SECTION = 6;

export function isLearnEnabled(): boolean {
  return process.env.LEARN_ENABLED === "true";
}

/** Client tarafı nav gating için (NEXT_PUBLIC_ build-time inline). */
export function isLearnEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_LEARN_ENABLED === "true";
}

export function getLearnMonthlyBudgetUsd(): number {
  const n = Number(process.env.LEARN_MONTHLY_BUDGET_USD);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

/**
 * Gemini native YouTube video desteği (transkript üreticisi). OpenRouter videoyu
 * işleyemez; Gemini videoyu doğrudan izleyip zaman-damgalı içerik üretir. Key yoksa
 * Gemini yolu no-op (youtubei/manuel fallback devam eder).
 */
export function getGeminiApiKey(): string | null {
  const k = process.env.GEMINI_API_KEY;
  return k && k.trim() !== "" ? k.trim() : null;
}

export function isGeminiConfigured(): boolean {
  return getGeminiApiKey() !== null;
}

export function getGeminiTranscriptModel(): string {
  return process.env.GEMINI_TRANSCRIPT_MODEL?.trim() || "gemini-2.5-flash";
}

/**
 * Obsidian vault klasör yolu (local fs). Set'liyse pack hazır olunca markdown
 * dosyaları doğrudan buraya yazılır (otomatik birikim). Boşsa .zip indirme fallback.
 * Vercel'de fs ephemeral → orada set edilmez.
 */
export function getObsidianVaultPath(): string | null {
  const p = process.env.OBSIDIAN_VAULT_PATH;
  return p && p.trim() !== "" ? p.trim() : null;
}

/**
 * Aşama → model rolü. Ucuz aşamalar cheapWriter; precision/sentez güçlü roller.
 * LLM'siz aşamalar (metadata/transcript/validate/chunk/...) haritada yok.
 */
export const STAGE_ROLES: Partial<Record<LearnStage, ModelRole>> = {
  content_analysis: "cheapWriter", // section başına ucuz özet
  notes: "creativeWriter",
  concepts: "qualityJudge", // precision + grounding
  assessment: "creativeWriter",
  qa: "qualityJudge",
};
