/**
 * Canlı (ücretli) LLM eval/kürasyon güvenlik kapıları (ADR-034, Faz 2E).
 *
 * ARKA PLAN: Faz 2C'de OPENROUTER_API_KEY'in kısmî prefix'i terminale sızdı —
 * anahtar compromised kabul edilir. Kullanıcı anahtarı döndürdüğünde
 * OPENROUTER_KEY_ROTATED_AT env'ini KENDİSİ set eder (biz asla uydurmayız).
 * Marker yokken hiçbir canlı OpenRouter çağrısı yapılmaz — key-status
 * endpoint'i dahil.
 *
 * Değer OKUNMAZ/basılmaz; yalnız mevcudiyet kontrol edilir.
 */

export const PHASE2E_LIVE_MAX_USD_CEILING = 0.5;

export function isOpenRouterKeyRotated(): boolean {
  return Boolean(process.env.OPENROUTER_KEY_ROTATED_AT?.trim());
}

export type LiveEvalGate = {
  allowed: boolean;
  /** Eksik/geçersiz koşulların adları (değer YOK). */
  missing: string[];
  /** Onaylı per-run tavan (USD); gate kapalıyken 0. */
  maxUsd: number;
};

/**
 * Canlı ücretli eval için DÖRT koşul birlikte gerekli:
 *  1. OPENROUTER_KEY_ROTATED_AT mevcut (rotasyon beyanı)
 *  2. AI_EVAL_SPEND_ENABLED=true
 *  3. PHASE2E_LIVE_EVAL_APPROVED=true
 *  4. 0 < PHASE2E_LIVE_MAX_USD <= 0.50
 * Default'lar kapalıdır; biri eksikse canlı bölüm BLOCKED-EXTERNAL kalır.
 */
export function getLiveEvalGate(): LiveEvalGate {
  const missing: string[] = [];
  if (!isOpenRouterKeyRotated()) missing.push("OPENROUTER_KEY_ROTATED_AT");
  if (process.env.AI_EVAL_SPEND_ENABLED !== "true") missing.push("AI_EVAL_SPEND_ENABLED");
  if (process.env.PHASE2E_LIVE_EVAL_APPROVED !== "true") missing.push("PHASE2E_LIVE_EVAL_APPROVED");
  const rawMax = Number(process.env.PHASE2E_LIVE_MAX_USD ?? "0");
  const maxUsd =
    Number.isFinite(rawMax) && rawMax > 0 && rawMax <= PHASE2E_LIVE_MAX_USD_CEILING ? rawMax : 0;
  if (maxUsd <= 0) missing.push("PHASE2E_LIVE_MAX_USD");
  return { allowed: missing.length === 0, missing, maxUsd: missing.length === 0 ? maxUsd : 0 };
}
