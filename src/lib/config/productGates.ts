import { isOpenRouterKeyRotated } from "@/lib/config/liveGates";

/**
 * Canlı Instagram İÇERİK ÜRETİMİ güvenlik kapısı (ADR-036, Faz 3B).
 *
 * Faz 2E eval kapılarından (liveGates) AYRI: eval onayı ürün üretimi onayı
 * DEĞİLDİR — env'ler ve anlamlar karıştırılmaz. Rotasyon marker'ı ortak
 * (OPENROUTER_KEY_ROTATED_AT — kullanıcı set eder, biz asla uydurmayız);
 * geri kalan üç koşul üretim-özel. Kapı kapalıyken:
 *  - OpenRouter'a HİÇBİR çağrı (key-status dahil) yapılmaz,
 *  - verifyWebsite çalıştırılmaz,
 *  - ReelDossier/UsageLog/TrainingExample YAZILMAZ,
 *  - route'lar typed blocked yanıt döner (yalnız ENV İSİMLERİ, değer asla).
 *
 * Default'lar kapalıdır (.env.example'da da kapalı).
 */

export const INSTAGRAM_GENERATION_MAX_USD_CEILING = 0.5;

export type InstagramGenerationGate = {
  allowed: boolean;
  /** Eksik/geçersiz koşulların ENV adları (değer YOK). */
  missing: string[];
  /** Onaylı per-pass tavan (USD); gate kapalıyken 0. */
  maxUsd: number;
};

/**
 * Canlı ürün üretimi için DÖRT koşul birlikte gerekli:
 *  1. OPENROUTER_KEY_ROTATED_AT mevcut (rotasyon beyanı)
 *  2. INSTAGRAM_GENERATION_ENABLED=true
 *  3. INSTAGRAM_GENERATION_LIVE_APPROVED=true
 *  4. 0 < INSTAGRAM_GENERATION_MAX_USD <= 0.50
 * Genel cost gate (costGate.assertGenerationAllowed) ve katalog doğrulaması
 * bu kapının ÜZERİNE ayrıca uygulanır.
 */
export function getInstagramGenerationGate(): InstagramGenerationGate {
  const missing: string[] = [];
  if (!isOpenRouterKeyRotated()) missing.push("OPENROUTER_KEY_ROTATED_AT");
  if (process.env.INSTAGRAM_GENERATION_ENABLED !== "true") {
    missing.push("INSTAGRAM_GENERATION_ENABLED");
  }
  if (process.env.INSTAGRAM_GENERATION_LIVE_APPROVED !== "true") {
    missing.push("INSTAGRAM_GENERATION_LIVE_APPROVED");
  }
  const rawMax = Number(process.env.INSTAGRAM_GENERATION_MAX_USD ?? "0");
  const maxUsd =
    Number.isFinite(rawMax) && rawMax > 0 && rawMax <= INSTAGRAM_GENERATION_MAX_USD_CEILING
      ? rawMax
      : 0;
  if (maxUsd <= 0) missing.push("INSTAGRAM_GENERATION_MAX_USD");
  return { allowed: missing.length === 0, missing, maxUsd: missing.length === 0 ? maxUsd : 0 };
}
