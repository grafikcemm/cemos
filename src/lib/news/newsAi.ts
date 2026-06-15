import { generateJson } from "@/lib/ai/openrouter";
import { usageService } from "@/lib/services/usageService";
import { detectLanguage, isTooSimilar } from "@/lib/news/language";
import {
  TRANSLATE_SYSTEM,
  buildTranslateUser,
  SCORING_SYSTEM,
  buildScoringUser,
  REPO_SYSTEM,
  buildRepoUser,
  DIGEST_SYSTEM,
  buildDigestUser,
} from "@/lib/news/prompts";
import type { ModelRole } from "@/lib/ai/model-config";

// Thin adapters over the project's OpenRouter wrapper. Each adapter:
//  1. calls generateJson with an appropriate model role,
//  2. logs cost to usageService with provider:"openrouter" + a purpose meta,
//  3. returns a discriminated success/failure result so the pipeline never
//     throws on a model hiccup.

export type NewsPurpose = "news_translate" | "news_score" | "news_repo" | "digest";

async function logUsage(
  purpose: NewsPurpose,
  estimatedCostUsd: number
): Promise<void> {
  try {
    await usageService.recordOpenRouter({
      estimatedCostUsd,
      meta: { purpose },
    });
  } catch (err) {
    console.warn(`[newsAi] usage log (${purpose}) başarısız:`, err);
  }
}

// --- Translation ---------------------------------------------------------

export type TranslationResult = {
  success: boolean;
  trTitle: string | null;
  trSummary: string | null;
  modelUsed: string | null;
  validationError: string | null;
};

type RawTranslation = {
  tr_title?: string;
  tr_summary?: string;
};

/**
 * Short brand/product titles ("Raspberry Pi 5 — 16GB RAM", "ΩFS") are valid as
 * passthrough "translations": there is nothing to translate, so forcing the
 * Turkish detector (or the similarity guard) on them only produces failures.
 * Word count ignores punctuation-only tokens like a lone em-dash.
 */
export function isBrandLikeTitle(title: string): boolean {
  const trimmed = title.trim();
  if (trimmed.length === 0 || trimmed.length > 32) return false;
  const words = trimmed.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  return words.length <= 5 && /[A-Z0-9]/.test(trimmed);
}

export function validateTranslation(
  originalTitle: string,
  originalSummary: string | null,
  parsed: RawTranslation
): string | null {
  if (!parsed.tr_title || parsed.tr_title.trim().length === 0) return "Eksik Türkçe başlık";
  if (!parsed.tr_summary || parsed.tr_summary.trim().length === 0) return "Eksik Türkçe özet";

  // Brand-like titles skip BOTH title checks (language + similarity): the
  // correct output is the title carried through verbatim. The summary must
  // still be real Turkish.
  if (!isBrandLikeTitle(originalTitle)) {
    const titleLang = detectLanguage(parsed.tr_title);
    if (!titleLang.isTurkish) return `Başlık Türkçe değil (${titleLang.reason})`;
    if (isTooSimilar(originalTitle, parsed.tr_title)) {
      return "Türkçe başlık orijinal metinle neredeyse aynı (çeviri sızıntısı)";
    }
  }

  const summaryLang = detectLanguage(parsed.tr_summary);
  if (!summaryLang.isTurkish) return `Özet Türkçe değil (${summaryLang.reason})`;

  if (originalSummary && isTooSimilar(originalSummary, parsed.tr_summary)) {
    return "Türkçe özet orijinal metinle neredeyse aynı (çeviri sızıntısı)";
  }
  return null;
}

export async function translateNews(
  originalTitle: string,
  originalSummary: string | null
): Promise<TranslationResult> {
  try {
    const res = await generateJson<RawTranslation>({
      role: "cheapWriter",
      system: TRANSLATE_SYSTEM,
      user: buildTranslateUser(originalTitle, originalSummary),
      temperature: 0.2,
    });
    await logUsage("news_translate", res.estimatedCostUsd);

    const error = validateTranslation(originalTitle, originalSummary, res.data);
    if (error) {
      return { success: false, trTitle: null, trSummary: null, modelUsed: res.model, validationError: error };
    }
    return {
      success: true,
      trTitle: res.data.tr_title!.trim(),
      trSummary: res.data.tr_summary!.trim(),
      modelUsed: res.model,
      validationError: null,
    };
  } catch (err) {
    return {
      success: false,
      trTitle: null,
      trSummary: null,
      modelUsed: null,
      validationError: err instanceof Error ? err.message : String(err),
    };
  }
}

// --- Scoring -------------------------------------------------------------

export type ScoringResult = {
  success: boolean;
  relevanceScore: number | null;
  viralScore: number | null;
  confidenceScore: number | null;
  xValueScore: number | null;
  whyPeopleCare: string | null;
  tweetAngle: string | null;
  suggestedFormat: string | null;
  bestAccount: string | null;
  modelUsed: string | null;
  validationError: string | null;
};

type RawScoring = {
  relevance_score?: number | string;
  viral_score?: number | string;
  confidence_score?: number | string;
  x_value_score?: number | string;
  why_people_care?: string;
  tweet_angle?: string;
  suggested_content_format?: string;
  best_account?: string;
};

function toScore(val: number | string | undefined): number | null {
  if (val === undefined || val === null) return null;
  const num = Number(val);
  if (Number.isNaN(num) || num < 0 || num > 100) return null;
  return Math.round(num);
}

// Generic filler that makes a tweet angle read as obviously AI-written or
// unfinished. Compared after toLocaleLowerCase("tr-TR") — /i regex flags
// mishandle Turkish İ/ı casing.
const BAD_ANGLE_PHRASES = [
  "detaylar için okumaya devam",
  "okumaya devam et",
  "detaylar için takipte",
  "takipte kal",
  "oyunun kuralları",
  "devrim yarat",
  "devrim niteliğinde",
];

const ANGLE_PLACEHOLDER = /\[[^\]]+\]/; // [Madde 1] style template leftovers
const MIN_ANGLE_LENGTH = 20;

/** Quality lint for the generated tweet angle; returns an error or null. */
export function validateTweetAngle(angle: string | null | undefined): string | null {
  if (!angle || angle.trim().length < MIN_ANGLE_LENGTH) {
    return "tweet_angle eksik veya çok kısa";
  }
  if (ANGLE_PLACEHOLDER.test(angle)) {
    return "tweet_angle şablon placeholder içeriyor";
  }
  const lower = angle.toLocaleLowerCase("tr-TR");
  for (const phrase of BAD_ANGLE_PHRASES) {
    if (lower.includes(phrase)) {
      return `tweet_angle jenerik kalıp içeriyor: "${phrase}"`;
    }
  }
  return null;
}

export function validateScoring(parsed: RawScoring): string | null {
  const keys: (keyof RawScoring)[] = ["relevance_score", "viral_score", "confidence_score", "x_value_score"];
  for (const key of keys) {
    if (toScore(parsed[key] as number | string | undefined) === null) {
      return `Geçersiz puan: ${key} (${parsed[key]})`;
    }
  }
  const r = toScore(parsed.relevance_score);
  const v = toScore(parsed.viral_score);
  const c = toScore(parsed.confidence_score);
  if (r === 50 && v === 50 && c === 50) return "Şüpheli varsayılan puanlama (hepsi 50)";
  if (!parsed.why_people_care || parsed.why_people_care.trim().length === 0) {
    return "why_people_care açıklaması eksik";
  }
  return validateTweetAngle(parsed.tweet_angle);
}

export async function scoreNews(
  trTitle: string,
  trSummary: string | null
): Promise<ScoringResult> {
  const fail = (validationError: string, modelUsed: string | null): ScoringResult => ({
    success: false,
    relevanceScore: null,
    viralScore: null,
    confidenceScore: null,
    xValueScore: null,
    whyPeopleCare: null,
    tweetAngle: null,
    suggestedFormat: null,
    bestAccount: null,
    modelUsed,
    validationError,
  });

  try {
    const res = await generateJson<RawScoring>({
      role: "viralJudge",
      system: SCORING_SYSTEM,
      user: buildScoringUser(trTitle, trSummary),
      temperature: 0.3,
    });
    await logUsage("news_score", res.estimatedCostUsd);

    const error = validateScoring(res.data);
    if (error) return fail(error, res.model);

    const bestAccount =
      res.data.best_account === "maskulenkod" ? "maskulenkod" : "grafikcem";

    return {
      success: true,
      relevanceScore: toScore(res.data.relevance_score),
      viralScore: toScore(res.data.viral_score),
      confidenceScore: toScore(res.data.confidence_score),
      xValueScore: toScore(res.data.x_value_score),
      whyPeopleCare: res.data.why_people_care?.trim() ?? null,
      tweetAngle: res.data.tweet_angle?.trim() ?? null,
      suggestedFormat: res.data.suggested_content_format ?? null,
      bestAccount,
      modelUsed: res.model,
      validationError: null,
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), null);
  }
}

// --- Repo enrichment -----------------------------------------------------

export type RepoEnrichment = {
  success: boolean;
  descriptionTr: string;
  whyItMatters: string;
  bestFor: string | null;
  tweetHook: string;
  xValueScore: number;
  modelUsed: string | null;
};

type RawRepo = {
  description_tr?: string;
  why_it_matters?: string;
  best_for?: string;
  tweet_hook?: string;
  x_value_score?: number | string;
};

export async function enrichRepo(repo: {
  name: string;
  owner: string;
  description: string;
  language: string | null;
  stars: number;
  topics: string[];
}): Promise<RepoEnrichment> {
  try {
    const res = await generateJson<RawRepo>({
      role: "viralJudge",
      system: REPO_SYSTEM,
      user: buildRepoUser(repo),
      temperature: 0.4,
    });
    await logUsage("news_repo", res.estimatedCostUsd);

    return {
      success: true,
      descriptionTr: res.data.description_tr?.trim() || repo.description,
      whyItMatters: res.data.why_it_matters?.trim() || "",
      bestFor: res.data.best_for?.trim() || null,
      tweetHook: res.data.tweet_hook?.trim() || "",
      xValueScore: toScore(res.data.x_value_score) ?? 0,
      modelUsed: res.model,
    };
  } catch (err) {
    console.warn("[newsAi] enrichRepo başarısız:", err);
    return {
      success: false,
      descriptionTr: repo.description,
      whyItMatters: "",
      bestFor: null,
      tweetHook: "",
      xValueScore: 0,
      modelUsed: null,
    };
  }
}

// --- Digest --------------------------------------------------------------

export type DigestResult = {
  success: boolean;
  newsSummary: string;
  repoSummary: string;
  aiTips: string;
  modelUsed: string | null;
  costUsd: number;
};

type RawDigest = {
  news_summary?: string;
  repo_summary?: string;
  ai_tips?: string;
};

export async function generateDigest(
  news: { title: string; why: string }[],
  repos: { name: string; hook: string }[]
): Promise<DigestResult> {
  try {
    const res = await generateJson<RawDigest>({
      role: "qualityJudge",
      system: DIGEST_SYSTEM,
      user: buildDigestUser(news, repos),
      temperature: 0.5,
    });
    await logUsage("digest", res.estimatedCostUsd);

    return {
      success: true,
      newsSummary: res.data.news_summary?.trim() || "",
      repoSummary: res.data.repo_summary?.trim() || "",
      aiTips: res.data.ai_tips?.trim() || "",
      modelUsed: res.model,
      costUsd: res.estimatedCostUsd,
    };
  } catch (err) {
    console.warn("[newsAi] generateDigest başarısız:", err);
    return {
      success: false,
      newsSummary: "",
      repoSummary: "",
      aiTips: "",
      modelUsed: null,
      costUsd: 0,
    };
  }
}

// Exported only so unit tests / callers can reference the role mapping if needed.
export const NEWS_MODEL_ROLES: Record<NewsPurpose, ModelRole> = {
  news_translate: "cheapWriter",
  news_score: "viralJudge",
  news_repo: "viralJudge",
  digest: "qualityJudge",
};
