/**
 * YouTube Fırsat Motoru — env-reader sabitler (Faz C).
 * Mevcut getMiningLimit/getCostLimits deseni: env'i runtime'da okur, güvenli default.
 */

import type { YtCategory } from "./ytTypes";

export const YT_CATEGORIES: readonly YtCategory[] = [
  "ai_haber",
  "kodlama",
  "ai_tips",
  "tasarim",
  "yasam",
  "global",
];

/** UsageLog.meta.purpose prefix'i — getMonthlySpendByPurpose("yt_") ile uyumlu. */
export const YT_BRIEF_PURPOSE = "yt_brief";

/** ytSync stage'inin learn cron'daki sabit zaman bütçesi. */
export const YT_SYNC_DEADLINE_MS = 40_000;

/** Outlier skor katsayıları — outlier.ts saf fonksiyonları bunları kullanır. */
export const OUTLIER = {
  EPSILON: 1, // sıfır medyan bölmesini sonlu tutar
  RECENCY_FULL_DAYS: 30, // ≤30 gün → tam ağırlık
  RECENCY_DECAY_DAYS: 60, // 30→90 gün arası lineer düşüş
  RECENCY_FLOOR: 0.5, // ≥90 gün taban
  MIN_VIDEOS_FOR_MEDIAN: 5, // altında "düşük güven" (servis rozeti)
  MEDIAN_LIKE_RATIO: 0.03,
  LIKE_K: 10,
  LIKE_ADJ_MIN: 0.9, // ±%10 sert sınır
  LIKE_ADJ_MAX: 1.1,
  ROLLING_WINDOW_DAYS: 90,
} as const;

export function getYoutubeApiKey(): string | null {
  const key = process.env.YOUTUBE_API_KEY;
  return key && key.trim() !== "" ? key.trim() : null;
}

/** API key yoksa tüm motor fail-open boş durumda kalır. */
export function isYouTubeConfigured(): boolean {
  return getYoutubeApiKey() !== null;
}

export function getYtBriefDailyLimit(): number {
  const n = Number(process.env.YT_BRIEF_DAILY_LIMIT);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 3;
}

export function getYtBriefMonthlyBudgetUsd(): number {
  const n = Number(process.env.YT_BRIEF_MONTHLY_BUDGET_USD);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

export function isYtCategory(value: string): value is YtCategory {
  return (YT_CATEGORIES as readonly string[]).includes(value);
}
