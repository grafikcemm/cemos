/**
 * Instagram Yorumlar — env-reader sabitler (Faz D). ytConfig.ts deseni:
 * env'i runtime'da okur, güvenli default. Yapılandırılmamışken motor fail-open.
 */

export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || "v21.0";
export const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/** UsageLog.meta.purpose prefix'leri — getMonthlySpendByPurpose("ig_") ile uyumlu. */
export const IG_COMMENT_PURPOSE = "ig_comment_classify";
export const IG_REPLY_PURPOSE = "ig_reply_draft";
export const IG_DM_READ_PURPOSE = "ig_dm_read"; // çeviri + rolling summary
export const IG_DM_DRAFT_PURPOSE = "ig_dm_draft"; // DM yanıt taslağı + risk
export const IG_INSIGHT_PURPOSE = "ig_insight_snapshot"; // (şimdilik LLM'siz — purpose ileri kullanım)

/** Cron stage zaman bütçeleri — Math.min(deadline, kalan süre). */
export const IG_SYNC_DAILY_DEADLINE_MS = 50_000; // 35→50: yorum + DM 15s + insight 5s
export const IG_SYNC_LEARN_DEADLINE_MS = 30_000;

/** sync iç-stage zaman dilimleri (Faz E).
 * DM: Meta limit=1 zorunluluğu (timeout 2534084) → konuşmalar tek tek sayfalanır
 * (≈4.5s/konuşma) + mesaj çekme; bu yüzden DM dilimi geniş tutulur. */
export const IG_DM_SYNC_DEADLINE_MS = 90_000;
export const IG_INSIGHT_SYNC_DEADLINE_MS = 5_000;

/** DM pipeline sabitleri. */
export const IG_DM_TRANSLATE_BATCH_SIZE = 10; // 10 mesaj tek cheapWriter çağrısı
export const IG_DM_SUMMARY_THRESHOLD = 10; // >10 mesaj → rollingSummary
export const IG_DM_CONTEXT_MESSAGES = 6; // taslak bağlamı: son 6 mesaj
export const IG_CONVERSATION_FETCH_LIMIT = 12; // tek sync'te en fazla konuşma (limit=1 sayfalama, ≈4.5s/adet)
export const IG_MESSAGES_PER_CONVERSATION = 20; // konuşma başına son mesaj
export const IG_DM_RISK_WARN_THRESHOLD = 40; // safety < 40 → "dikkatli gönder"

/** Token sağlık eşikleri (gün). */
export const TOKEN_WARN_DAYS = 10;
export const TOKEN_CRITICAL_DAYS = 3;

/** IntegrationCredential satır anahtarı. */
export const META_TOKEN_KEY = "meta_access_token";

/** Tek sync'te çekilecek son gönderi sayısı. */
export const IG_MEDIA_FETCH_LIMIT = 25;

/** Classify batch boyutu — 10 yorum tek cheapWriter çağrısı. */
export const IG_CLASSIFY_BATCH_SIZE = 10;

/** Toplu taslak üretiminde "öncelikli" eşiği. */
export const IG_BULK_DRAFT_MIN_PRIORITY = 60;

export function getIgUserId(): string | null {
  const v = process.env.META_IG_USER_ID?.trim();
  return v ? v : null;
}

export function getMetaAppId(): string | null {
  const v = process.env.META_APP_ID?.trim();
  return v ? v : null;
}

export function getMetaAppSecret(): string | null {
  const v = process.env.META_APP_SECRET?.trim();
  return v ? v : null;
}

export function getMetaPageId(): string | null {
  const v = process.env.META_PAGE_ID?.trim();
  return v ? v : null;
}

/** Manuel /sync deadline (env override). */
export function getIgManualDeadlineMs(): number {
  const n = Number(process.env.IG_SYNC_MANUAL_DEADLINE_MS);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}

/** Aylık IG LLM tavanı (classify + reply + DM, tek bütçe). Faz E: 1.5→2.0. */
export function getIgMonthlyBudgetUsd(): number {
  const n = Number(process.env.IG_MONTHLY_BUDGET_USD);
  return Number.isFinite(n) && n >= 0 ? n : 2.0;
}

/**
 * SAF: Europe/Istanbul takviminde YYYY-MM-DD. IgInsightSnapshot.date için
 * günde-1 idempotent anahtar (UTC değil — kullanıcının günü İstanbul saatinde).
 */
export function istanbulDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
}
