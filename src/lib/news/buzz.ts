/**
 * CemOS Haber — "çok konuşulan" buzz skoru (0–100, deterministik, saf).
 *
 * viralScore/xValueScore bir haberin TWEET potansiyelini ölçer. buzzScore ise
 * DÜNYA gündemini ölçer: kaç bağımsız kaynak teyit etti (çapraz-kaynak), ne kadar
 * taze, kaynak ne kadar güçlü ve dış mecralarda (Hacker News / Reddit) ne kadar
 * konuşuluyor. Tüm bileşenler monoton + 0–100'e clamp'lenir → birim test edilir.
 */

import type { SourceVerification } from "@/lib/news/sourceVerification";

export interface BuzzInput {
  /** Çapraz-kaynak teyit sınıfı (classifySourceVerification çıktısı). */
  sourceVerification: SourceVerification | string | null;
  /** Yayın tarihi (yoksa fetchedAt'e düşülür). */
  publishedAt: Date | string | null;
  fetchedAt: Date | string | null;
  /** Kaynak güvenilirliği. */
  reliability: "high" | "medium" | "low" | string | null;
  /** Kaynak önceliği 0–100 (NewsSource.priority). */
  priority?: number | null;
  hnPoints?: number | null;
  hnComments?: number | null;
  redditScore?: number | null;
  /** Test için sabit "şimdi" (epoch ms). */
  now?: number;
}

// Ağırlıklar (toplam 1.0). Tazelik + korelasyon + dış popülerlik baskın; kaynak
// kalitesi ince ayar. Dış sinyal yoksa max ~70 (taze + çok-kaynak + güçlü kaynak)
// — bu doğru: kimsenin konuşmadığı haber "çok konuşulan" değildir.
const W_RECENCY = 0.3;
const W_CORROBORATION = 0.25;
const W_SOURCE_QUALITY = 0.15;
const W_EXTERNAL = 0.3;

// Tazelik yarı-ömrü: 18 saat sonra tazelik puanı yarılanır.
const RECENCY_HALFLIFE_HOURS = 18;

// Dış popülerlik log-normalizasyon referansları (bu değerde ~1.0'a doyar).
const HN_POINTS_REF = 500;
const HN_COMMENTS_REF = 300;
const REDDIT_REF = 5000;

const CORROBORATION_WEIGHT: Record<string, number> = {
  multi_source_confirmed: 1.0,
  editorial_confirmed: 0.7,
  official_only: 0.55,
  single_source: 0.3,
};

const RELIABILITY_WEIGHT: Record<string, number> = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function toMs(d: Date | string | null): number | null {
  if (!d) return null;
  const ms = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Üstel azalma: yaş 0 → 1.0, yaş = yarı-ömür → 0.5. Gelecek tarih de 1.0. */
function recencyScore(input: BuzzInput): number {
  const now = input.now ?? Date.now();
  const ts = toMs(input.publishedAt) ?? toMs(input.fetchedAt);
  if (ts == null) return 0.3; // tarih yoksa nötr-düşük
  const ageHours = Math.max(0, (now - ts) / 3_600_000);
  return Math.pow(0.5, ageHours / RECENCY_HALFLIFE_HOURS);
}

/** log10(1+x) / log10(1+ref), [0,1]'e clamp. */
function logNorm(value: number | null | undefined, ref: number): number {
  const v = Math.max(0, Number(value) || 0);
  if (v === 0) return 0;
  return clamp01(Math.log10(1 + v) / Math.log10(1 + ref));
}

/** Dış popülerlik: HN puanı + yorum + Reddit skoru harmanı, [0,1]. */
function externalScore(input: BuzzInput): number {
  const hn = logNorm(input.hnPoints, HN_POINTS_REF);
  const hnC = logNorm(input.hnComments, HN_COMMENTS_REF);
  const reddit = logNorm(input.redditScore, REDDIT_REF);
  // HN puanı ana sinyal; yorum + reddit ek ağırlık. Katsayılar 1.25'e topluyor →
  // gerçek ağırlıklı ortalama için normalize et, sonra en güçlü tek mecra ile
  // harmanın maksimumunu al (iki mecra tek mecrayı geçsin).
  const blend = (0.6 * hn + 0.25 * hnC + 0.4 * reddit) / 1.25;
  return clamp01(Math.max(hn, reddit, blend));
}

function corroborationScore(v: BuzzInput["sourceVerification"]): number {
  if (!v) return CORROBORATION_WEIGHT.single_source;
  return CORROBORATION_WEIGHT[v] ?? CORROBORATION_WEIGHT.single_source;
}

function sourceQualityScore(input: BuzzInput): number {
  const rel = RELIABILITY_WEIGHT[input.reliability ?? ""] ?? 0.6;
  const pri = clamp01((input.priority ?? 50) / 100);
  return clamp01((rel + pri) / 2);
}

/** Nihai buzz skoru, 0–100 tamsayı. Her sinyalde monoton artan. */
export function computeBuzzScore(input: BuzzInput): number {
  const score =
    W_RECENCY * recencyScore(input) +
    W_CORROBORATION * corroborationScore(input.sourceVerification) +
    W_SOURCE_QUALITY * sourceQualityScore(input) +
    W_EXTERNAL * externalScore(input);
  return Math.round(clamp01(score) * 100);
}
