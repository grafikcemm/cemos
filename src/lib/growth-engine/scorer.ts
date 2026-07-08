/**
 * Sprint 4 — Scoring Engine
 *
 * Scores source posts and drafts for relevance, virality, risk, and publishability.
 * Uses AI (OpenRouter) when available, falls back to heuristic scoring.
 *
 * Does NOT create API routes, UI, or modify existing pipeline.
 */

import {
  SourcePostScoringInputSchema,
  DraftScoringInputSchema,
  type SourcePostScoringInput,
  type SourcePostScoringInputRaw,
  type SourcePostScore,
  type DraftScoringInput,
  type DraftScore,
  type SourceAction,
  type PublishRecommendation,
} from "@/lib/growth-engine/types";
// Tek hesap kimliği: scoring canlı `@/lib/accounts` profiline adapter
// üzerinden bağlanır — growth-engine'in eski account-profiles kopyası
// Sprint 2'de silindi.
import {
  isKnownAccountHandle as validateAccountHandle,
  getScoringIdentity,
  getAllScoringIdentities,
  getForbiddenTermsFromLive as getForbiddenTerms,
  foldTurkish,
  type ScoringIdentity,
} from "@/lib/growth-engine/account-adapter";
import type { AccountHandle } from "@/lib/accounts";
import { extractPatternSyncFallback } from "@/lib/growth-engine/pattern-extractor";
import { BANNED_PHRASES, endsWithQuestionCta } from "@/lib/safety/banned-phrases";

// Marka-sesi yasak klişeleri (tek kaynak: safety/banned-phrases) — AI-slop
// kalıpları deterministik skorlayıcıda da ceza alır (item 9 ruhu: klişe içerik
// yayınlanabilir görünemez). Fold'lu eşleşme (İ/ı, ş/s).
const FOLDED_BANNED_PHRASES: string[] = BANNED_PHRASES.map((p) => foldTurkish(p));

function countBannedPhraseHits(text: string): number {
  return countKeywordHits(foldTurkish(text), FOLDED_BANNED_PHRASES);
}

// ---------------------------------------------------------------------------
// Keyword catalogs for heuristic scoring
// ---------------------------------------------------------------------------

const ACCOUNT_KEYWORDS: Record<AccountHandle, string[]> = {
  grafikcem: [
    "ai", "yapay zeka", "tasarım", "design", "branding", "freelance",
    "araç", "tool", "prompt", "grafik", "logo", "model", "chatgpt",
    "openai", "midjourney", "figma", "adobe", "canva", "güncelleme",
    "workflow", "iş akışı", "yaratıcı",
  ],
  maskulenkod: [
    "erkek", "adam", "maskülen", "disiplin", "ilişki", "kadın",
    "para", "zihniyet", "stoik", "stoicism", "özgüven", "güç",
    "irade", "karakter", "başarı", "zayıflık", "otorite", "ayna",
  ],
};

const RISK_KEYWORDS = [
  "hakaret", "küfür", "ölüm", "tehdit", "nefret", "ırkçı", "ırkçılık",
  "terör", "şiddet", "taciz", "linç", "saldırı", "iftira", "rezil",
  "alçak", "orospu", "piç", "yavşak", "amk", "aq",
];

const CONTROVERSY_KEYWORDS = [
  "tartışma", "skandal", "rezalet", "kriz", "çöküş", "kavga", "çelişki",
  "iddia", "itiraf", "şok", "olay", "patlama", "sert", "karşı", "itiraz",
  "polemiğ", "bomba", "deprem", "felaket",
];

const CLICHE_KEYWORDS = [
  "motivasyon", "başarı sözleri", "hayat güzel", "her şey gönlünce olsun",
  "asla pes etme", "kendinize inanın", "hayallerin peşinden koş",
  "pozitif enerji", "günaydın dünya",
];

// ---------------------------------------------------------------------------
// clampScore — safely clamp any value to 0-100
// ---------------------------------------------------------------------------

export function clampScore(value: unknown, fallback = 50): number {
  if (typeof value !== "number" || isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

// ---------------------------------------------------------------------------
// Heuristic helpers
// ---------------------------------------------------------------------------

function countKeywordHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw)).length;
}

function calculateRelevanceScore(text: string, handle: AccountHandle): number {
  const keywords = ACCOUNT_KEYWORDS[handle];
  const hits = countKeywordHits(text, keywords);
  if (hits >= 5) return 90;
  if (hits >= 3) return 75;
  if (hits >= 2) return 60;
  if (hits >= 1) return 45;
  return 25;
}

function calculateFreshnessScore(publishedAt?: string): number {
  if (!publishedAt) return 60;

  const published = new Date(publishedAt);
  if (isNaN(published.getTime())) return 60;

  const now = Date.now();
  const hoursAgo = (now - published.getTime()) / (1000 * 60 * 60);

  if (hoursAgo <= 6) return 95;
  if (hoursAgo <= 24) return 80;
  if (hoursAgo <= 72) return 55;
  if (hoursAgo <= 168) return 35;
  return 20;
}

function calculateControversyScore(text: string, handle: AccountHandle): number {
  const hits = countKeywordHits(text, CONTROVERSY_KEYWORDS);
  const hasQuestion = text.includes("?");
  const hasExclamation = text.includes("!");

  let base = hits * 15;
  if (hasQuestion) base += 10;
  if (hasExclamation) base += 5;

  // maskulenkod benefits more from controversy
  if (handle === "maskulenkod") {
    base = Math.min(base + 10, 100);
  }

  return clampScore(base, 30);
}

function calculateRiskScore(text: string, handle: AccountHandle): number {
  const riskHits = countKeywordHits(text, RISK_KEYWORDS);
  const forbidden = getForbiddenTerms(handle);
  // Yasak terimler fold'lu tutulur; metin de fold'lanarak eşlenir (İ/ı, ş/s).
  const forbiddenHits = countKeywordHits(foldTurkish(text), forbidden);

  const risk = riskHits * 20 + forbiddenHits * 10;
  return clampScore(risk, 10);
}

function calculateAudienceFitScore(text: string, handle: AccountHandle): number {
  const relevance = calculateRelevanceScore(text, handle);
  const profile = getScoringIdentity(handle);

  // Check if text length is reasonable for the account
  const tooLong = text.length > profile.maxChars * 3;
  const penalty = tooLong ? 15 : 0;

  return clampScore(relevance + 5 - penalty, 50);
}

function calculateQuotePotentialScore(text: string): number {
  // Content good for quoting: has a claim, not too short, not too long
  const len = text.length;
  let score = 50;
  if (len > 50 && len < 500) score += 15;
  if (text.includes("?")) score += 10;
  if (countKeywordHits(text, CONTROVERSY_KEYWORDS) > 0) score += 10;
  return clampScore(score, 40);
}

function calculateReplyPotentialScore(text: string): number {
  const hasQuestion = text.includes("?");
  const hasMention = text.includes("@");
  let score = 35;
  if (hasQuestion) score += 20;
  if (hasMention) score += 10;
  if (text.length < 200) score += 10;
  return clampScore(score, 35);
}

function calculateStandaloneTweetScore(text: string, handle: AccountHandle): number {
  const relevance = calculateRelevanceScore(text, handle);
  let score = relevance;

  // Short-medium length is better for standalone tweets
  if (text.length > 100 && text.length < 400) score += 10;

  // Has a clear claim or strong hook
  const firstSentence = text.split(/[.!?]/)[0] ?? "";
  if (firstSentence.length > 20 && firstSentence.length < 120) score += 10;

  return clampScore(score, 45);
}

// ---------------------------------------------------------------------------
// calculateOpportunityScore — composite from sub-scores
// ---------------------------------------------------------------------------

export function calculateOpportunityScore(parts: {
  relevanceScore: number;
  freshnessScore: number;
  controversyScore: number;
  audienceFitScore: number;
  quotePotentialScore: number;
  replyPotentialScore: number;
  standaloneTweetScore: number;
  riskScore: number;
}): number {
  const {
    relevanceScore,
    freshnessScore,
    audienceFitScore,
    quotePotentialScore,
    standaloneTweetScore,
    riskScore,
  } = parts;

  // Weighted average of positive signals
  const positiveBase =
    relevanceScore * 0.25 +
    freshnessScore * 0.15 +
    audienceFitScore * 0.2 +
    Math.max(quotePotentialScore, standaloneTweetScore) * 0.25 +
    parts.controversyScore * 0.15;

  // Risk penalty: heavy penalty for high risk
  const riskPenalty = riskScore > 50 ? (riskScore - 50) * 0.8 : riskScore * 0.2;

  return clampScore(positiveBase - riskPenalty, 50);
}

// ---------------------------------------------------------------------------
// Determine suggested action from scores
// ---------------------------------------------------------------------------

function determineSuggestedAction(scores: {
  opportunityScore: number;
  quotePotentialScore: number;
  replyPotentialScore: number;
  standaloneTweetScore: number;
  riskScore: number;
}): SourceAction {
  if (scores.riskScore > 75) return "ignore";
  if (scores.opportunityScore < 40) return "ignore";

  // Pick the highest potential action
  const actions: { action: SourceAction; score: number }[] = [
    { action: "tweet", score: scores.standaloneTweetScore },
    { action: "quote", score: scores.quotePotentialScore },
    { action: "reply", score: scores.replyPotentialScore },
  ];

  actions.sort((a, b) => b.score - a.score);
  return actions[0].action;
}

// ---------------------------------------------------------------------------
// Detect relevant accounts for a given text
// ---------------------------------------------------------------------------

function detectAccountsForScoring(text: string): AccountHandle[] {
  const lower = text.toLowerCase();
  const scored: { handle: AccountHandle; score: number }[] = [];

  for (const [handle, keywords] of Object.entries(ACCOUNT_KEYWORDS)) {
    const hits = keywords.filter((kw) => lower.includes(kw)).length;
    if (hits > 0) {
      scored.push({ handle: handle as AccountHandle, score: hits });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.handle);
}

// ---------------------------------------------------------------------------
// normalizeSourcePostScore — safely convert unknown AI response
// ---------------------------------------------------------------------------

export function normalizeSourcePostScore(raw: unknown): SourcePostScore {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return buildEmptySourcePostScore();
  }

  const obj = raw as Record<string, unknown>;

  const relevanceScore = clampScore(obj.relevanceScore);
  const freshnessScore = clampScore(obj.freshnessScore, 60);
  const controversyScore = clampScore(obj.controversyScore, 30);
  const audienceFitScore = clampScore(obj.audienceFitScore);
  const quotePotentialScore = clampScore(obj.quotePotentialScore, 40);
  const replyPotentialScore = clampScore(obj.replyPotentialScore, 35);
  const standaloneTweetScore = clampScore(obj.standaloneTweetScore, 45);
  const riskScore = clampScore(obj.riskScore, 10);

  const opportunityScore =
    typeof obj.opportunityScore === "number"
      ? clampScore(obj.opportunityScore)
      : calculateOpportunityScore({
          relevanceScore,
          freshnessScore,
          controversyScore,
          audienceFitScore,
          quotePotentialScore,
          replyPotentialScore,
          standaloneTweetScore,
          riskScore,
        });

  // Validate suggestedAction
  let suggestedAction: SourceAction = "ignore";
  const rawAction = obj.suggestedAction;
  if (
    rawAction === "tweet" ||
    rawAction === "quote" ||
    rawAction === "reply" ||
    rawAction === "ignore"
  ) {
    suggestedAction = rawAction;
  } else {
    suggestedAction = determineSuggestedAction({
      opportunityScore,
      quotePotentialScore,
      replyPotentialScore,
      standaloneTweetScore,
      riskScore,
    });
  }

  // Filter suggestedAccounts
  const rawAccounts = Array.isArray(obj.suggestedAccounts) ? obj.suggestedAccounts : [];
  const validAccounts = rawAccounts
    .filter((a): a is string => typeof a === "string")
    .filter((a) => validateAccountHandle(a));

  return {
    relevanceScore,
    freshnessScore,
    controversyScore,
    audienceFitScore,
    quotePotentialScore,
    replyPotentialScore,
    standaloneTweetScore,
    opportunityScore,
    riskScore,
    suggestedAction,
    reason: typeof obj.reason === "string" ? obj.reason : "",
    suggestedAccounts: validAccounts,
    confidence: clampScore(obj.confidence),
  };
}

function buildEmptySourcePostScore(): SourcePostScore {
  return {
    relevanceScore: 50,
    freshnessScore: 60,
    controversyScore: 30,
    audienceFitScore: 50,
    quotePotentialScore: 40,
    replyPotentialScore: 35,
    standaloneTweetScore: 45,
    opportunityScore: 40,
    riskScore: 10,
    suggestedAction: "ignore",
    reason: "",
    suggestedAccounts: [],
    confidence: 0,
  };
}

// ---------------------------------------------------------------------------
// scoreSourcePostFallback — heuristic source post scoring
// ---------------------------------------------------------------------------

export function scoreSourcePostFallback(
  input: SourcePostScoringInputRaw
): SourcePostScore {
  const parsed = SourcePostScoringInputSchema.parse(input);
  const text = parsed.content;

  // Determine target account
  const handle: AccountHandle | null =
    parsed.targetAccount && validateAccountHandle(parsed.targetAccount)
      ? (parsed.targetAccount as AccountHandle)
      : null;

  const detectedAccounts = handle ? [handle] : detectAccountsForScoring(text);
  const primaryHandle = detectedAccounts[0] ?? "grafikcem";

  // Calculate sub-scores
  const relevanceScore = calculateRelevanceScore(text, primaryHandle);
  const freshnessScore = calculateFreshnessScore(parsed.publishedAt);
  const controversyScore = calculateControversyScore(text, primaryHandle);
  const audienceFitScore = calculateAudienceFitScore(text, primaryHandle);
  const quotePotentialScore = calculateQuotePotentialScore(text);
  const replyPotentialScore = calculateReplyPotentialScore(text);
  const standaloneTweetScore = calculateStandaloneTweetScore(text, primaryHandle);
  const riskScore = calculateRiskScore(text, primaryHandle);

  // Metrics boost: engagement signals raise opportunity
  let metricsBoost = 0;
  if (parsed.metrics) {
    const { likes = 0, reposts = 0, replies = 0, quotes = 0 } = parsed.metrics;
    const engagement = likes + reposts * 2 + replies * 3 + quotes * 2;
    if (engagement > 100) metricsBoost = 15;
    else if (engagement > 30) metricsBoost = 10;
    else if (engagement > 5) metricsBoost = 5;
  }

  const rawOpportunity = calculateOpportunityScore({
    relevanceScore,
    freshnessScore,
    controversyScore,
    audienceFitScore,
    quotePotentialScore,
    replyPotentialScore,
    standaloneTweetScore,
    riskScore,
  });

  const opportunityScore = clampScore(rawOpportunity + metricsBoost);

  const suggestedAction = determineSuggestedAction({
    opportunityScore,
    quotePotentialScore,
    replyPotentialScore,
    standaloneTweetScore,
    riskScore,
  });

  // Try pattern extraction for reason
  let reason = "";
  try {
    const patternResult = extractPatternSyncFallback({
      text,
      accountHandle: primaryHandle,
      sourceType: "manual",
      language: "TR",
    });
    reason = `Pattern: ${patternResult.suggestedPatterns[0] ?? "Genel"} | Trigger: ${patternResult.emotionalTrigger}`;
  } catch {
    reason = `Relevance: ${relevanceScore}, Freshness: ${freshnessScore}, Risk: ${riskScore}`;
  }

  // Confidence for fallback
  let confidence = 45;
  if (handle) confidence += 5;
  confidence = clampScore(confidence, 45);

  return {
    relevanceScore,
    freshnessScore,
    controversyScore,
    audienceFitScore,
    quotePotentialScore,
    replyPotentialScore,
    standaloneTweetScore,
    opportunityScore,
    riskScore,
    suggestedAction,
    reason,
    suggestedAccounts: detectedAccounts.length > 0 ? detectedAccounts : [primaryHandle],
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Draft scoring helpers
// ---------------------------------------------------------------------------

function calculatePersonaMatchScore(text: string, profile: ScoringIdentity): number {
  const toneWords = profile.tone.split(/[,\s]+/).filter((w) => w.length > 2);

  let score = 60;

  // Check forbidden terms — penalty (fold'lu eşleşme: canlı kurallar ASCII).
  const forbiddenHits = countKeywordHits(foldTurkish(text), profile.forbiddenTerms);
  score -= forbiddenHits * 15;

  // Check for cross-account contamination
  const allProfiles = getAllScoringIdentities();
  for (const otherProfile of allProfiles) {
    if (otherProfile.handle === profile.handle) continue;
    const otherKeywords = ACCOUNT_KEYWORDS[otherProfile.handle];
    const crossHits = countKeywordHits(text, otherKeywords);
    if (crossHits > 2) score -= 20;
  }

  // Length check
  if (text.length > profile.maxChars) {
    score -= 10;
  }

  // Boost for matching keywords
  const ownKeywords = ACCOUNT_KEYWORDS[profile.handle];
  const ownHits = countKeywordHits(text, ownKeywords);
  score += Math.min(ownHits * 5, 20);

  return clampScore(score, 50);
}

function calculateHookStrengthScore(text: string): number {
  const firstSentence = text.split(/[.!?]/)[0]?.trim() ?? "";
  const words = firstSentence.split(/\s+/).length;
  let score = 50;

  // 8-12 word hook is ideal
  if (words >= 8 && words <= 15) score += 20;
  else if (words >= 5 && words <= 20) score += 10;
  else score -= 10;

  // Strong punctuation
  if (firstSentence.endsWith("?") || firstSentence.endsWith("!")) score += 10;

  // Short and punchy is better
  if (firstSentence.length > 20 && firstSentence.length < 100) score += 10;

  // Controversy/provocation boost
  if (countKeywordHits(firstSentence, CONTROVERSY_KEYWORDS) > 0) score += 10;

  return clampScore(score, 50);
}

function calculateClarityScore(text: string, profile: ScoringIdentity): number {
  let score = 70;

  // Too long → unclear
  if (text.length > profile.maxChars * 1.5) score -= 20;
  if (text.length > profile.maxChars) score -= 10;

  // Too many hashtags → noisy
  const hashtagCount = (text.match(/#/g) || []).length;
  if (hashtagCount > 3) score -= 15;
  if (profile.noHashtags && hashtagCount > 0) score -= 10;

  // Cliché penalty
  const clicheHits = countKeywordHits(text, CLICHE_KEYWORDS);
  score -= clicheHits * 10;

  // Yasak marka-sesi klişesi (AI-slop) cezası — banned-phrases tek kaynağından.
  score -= countBannedPhraseHits(text) * 10;

  // Very short but has content → clear
  if (text.length < 200 && text.split(/[.!?]/).length <= 4) score += 10;

  return clampScore(score, 50);
}

function calculateViralityScore(text: string, profile: ScoringIdentity): number {
  let score = 45;

  // Questions invite engagement
  if (text.includes("?")) score += 15;

  // Controversy drives virality
  const controversyHits = countKeywordHits(text, CONTROVERSY_KEYWORDS);
  score += controversyHits * 8;

  // Exclamation marks signal passion
  const exclamationCount = (text.match(/!/g) || []).length;
  if (exclamationCount === 1) score += 5;
  if (exclamationCount > 3) score -= 5; // Too many is spammy

  // Account-specific viral mechanics check
  const viralMechanic = profile.viralMechanic.toLowerCase();
  if (viralMechanic.includes("rahatsız") && text.includes("?")) score += 10;
  if (viralMechanic.includes("bilmem gerekiyordu") && text.length > 100) score += 5;
  if (viralMechanic.includes("söylemiyordu")) score += 5;

  return clampScore(score, 40);
}

function calculateNoveltyScore(text: string): number {
  let score = 55;

  // Cliché penalty
  const clicheHits = countKeywordHits(text, CLICHE_KEYWORDS);
  score -= clicheHits * 15;

  // Yasak marka-sesi klişesi (AI-slop) = sıfır özgünlük sinyali.
  score -= countBannedPhraseHits(text) * 20;

  // Unique words count as proxy for novelty
  const words = text.toLowerCase().split(/\s+/);
  const uniqueRatio = new Set(words).size / words.length;
  if (uniqueRatio > 0.8) score += 10;
  if (uniqueRatio < 0.5) score -= 10;

  return clampScore(score, 50);
}

function calculateDraftRiskScore(text: string, handle: AccountHandle): number {
  const riskHits = countKeywordHits(text, RISK_KEYWORDS);
  const forbidden = getForbiddenTerms(handle);
  // Yasak terimler fold'lu tutulur; metin de fold'lanarak eşlenir.
  const forbiddenHits = countKeywordHits(foldTurkish(text), forbidden);

  const risk = riskHits * 25 + forbiddenHits * 12;
  return clampScore(risk, 8);
}

// ---------------------------------------------------------------------------
// calculatePublishScore — composite from draft sub-scores
// ---------------------------------------------------------------------------

export function calculatePublishScore(parts: {
  personaMatchScore: number;
  hookStrengthScore: number;
  clarityScore: number;
  viralityScore: number;
  noveltyScore: number;
  riskScore: number;
  /**
   * FIRST-SPRINT item 9: Türkçe doğallık publishScore'u CAPLAYAN alt-skordur —
   * doğal olmayan Türkçe hiçbir kompozit skorla yayınlanabilir görünemez.
   * Verilmezse (heuristik yol) cap uygulanmaz.
   */
  turkishNaturalness?: number;
}): number {
  const {
    personaMatchScore,
    hookStrengthScore,
    clarityScore,
    viralityScore,
    noveltyScore,
    riskScore,
    turkishNaturalness,
  } = parts;

  const positiveBase =
    personaMatchScore * 0.25 +
    hookStrengthScore * 0.2 +
    clarityScore * 0.2 +
    viralityScore * 0.2 +
    noveltyScore * 0.15;

  const riskPenalty = riskScore > 45 ? (riskScore - 45) * 1.0 : riskScore * 0.15;
  const composite = clampScore(positiveBase - riskPenalty, 50);

  if (typeof turkishNaturalness === "number" && !isNaN(turkishNaturalness)) {
    return Math.min(composite, clampScore(turkishNaturalness));
  }
  return composite;
}

// ---------------------------------------------------------------------------
// Determine publish recommendation
// ---------------------------------------------------------------------------

function determinePublishRecommendation(
  publishScore: number,
  riskScore: number
): PublishRecommendation {
  if (publishScore < 50 || riskScore > 70) return "reject";
  if (publishScore >= 75 && riskScore < 45) return "publish";
  return "rewrite";
}

function generateRewriteSuggestion(
  scores: {
    personaMatchScore: number;
    hookStrengthScore: number;
    clarityScore: number;
    viralityScore: number;
    riskScore: number;
  },
  handle: AccountHandle
): string {
  const suggestions: string[] = [];

  if (scores.hookStrengthScore < 60) {
    suggestions.push("Hook daha net ve iddialı açılmalı.");
  }
  if (scores.personaMatchScore < 60) {
    suggestions.push(`Bu metin @${handle} tonuna uymuyor, persona kontrol edilmeli.`);
  }
  if (scores.clarityScore < 60) {
    suggestions.push("Metin daha kısa ve net olmalı.");
  }
  if (scores.viralityScore < 50) {
    suggestions.push("Okuyucuyu yorum yazmaya iten bir soru veya iddia eklenebilir.");
  }
  if (scores.riskScore > 50) {
    suggestions.push("Riskli ifadeler yumuşatılmalı veya kaynakla desteklenmeli.");
  }

  if (suggestions.length === 0) {
    suggestions.push("Genel kalite iyi, küçük ton ayarlaması yapılabilir.");
  }

  return suggestions.join(" ");
}

// ---------------------------------------------------------------------------
// normalizeDraftScore — safely convert unknown AI response
// ---------------------------------------------------------------------------

export function normalizeDraftScore(raw: unknown): DraftScore {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return buildEmptyDraftScore();
  }

  const obj = raw as Record<string, unknown>;

  const personaMatchScore = clampScore(obj.personaMatchScore, 50);
  const hookStrengthScore = clampScore(obj.hookStrengthScore, 50);
  const clarityScore = clampScore(obj.clarityScore, 50);
  const viralityScore = clampScore(obj.viralityScore, 40);
  const noveltyScore = clampScore(obj.noveltyScore, 50);
  const riskScore = clampScore(obj.riskScore, 8);

  const publishScore =
    typeof obj.publishScore === "number"
      ? clampScore(obj.publishScore)
      : calculatePublishScore({
          personaMatchScore,
          hookStrengthScore,
          clarityScore,
          viralityScore,
          noveltyScore,
          riskScore,
        });

  // Validate publishRecommendation
  let publishRecommendation: PublishRecommendation;
  const rawRec = obj.publishRecommendation;
  if (rawRec === "publish" || rawRec === "rewrite" || rawRec === "reject") {
    publishRecommendation = rawRec;
  } else {
    publishRecommendation = determinePublishRecommendation(publishScore, riskScore);
  }

  return {
    personaMatchScore,
    hookStrengthScore,
    clarityScore,
    viralityScore,
    noveltyScore,
    riskScore,
    publishScore,
    publishRecommendation,
    rewriteSuggestion: typeof obj.rewriteSuggestion === "string" ? obj.rewriteSuggestion : "",
    reason: typeof obj.reason === "string" ? obj.reason : "",
    confidence: clampScore(obj.confidence),
  };
}

function buildEmptyDraftScore(): DraftScore {
  return {
    personaMatchScore: 50,
    hookStrengthScore: 50,
    clarityScore: 50,
    viralityScore: 40,
    noveltyScore: 50,
    riskScore: 8,
    publishScore: 50,
    publishRecommendation: "rewrite",
    rewriteSuggestion: "",
    reason: "",
    confidence: 0,
  };
}

// ---------------------------------------------------------------------------
// scoreDraftFallback — heuristic draft scoring
// ---------------------------------------------------------------------------

export function scoreDraftFallback(input: DraftScoringInput): DraftScore {
  const parsed = DraftScoringInputSchema.parse(input);
  const text = parsed.content;

  if (!validateAccountHandle(parsed.accountHandle)) {
    throw new Error(`Invalid accountHandle: ${parsed.accountHandle}`);
  }

  const handle = parsed.accountHandle as AccountHandle;
  const profile = getScoringIdentity(handle);

  const personaMatchScore = calculatePersonaMatchScore(text, profile);
  const hookStrengthScore = calculateHookStrengthScore(text);
  const clarityScore = calculateClarityScore(text, profile);
  const viralityScore = calculateViralityScore(text, profile);
  const noveltyScore = calculateNoveltyScore(text);
  const riskScore = calculateDraftRiskScore(text, handle);

  const compositePublish = calculatePublishScore({
    personaMatchScore,
    hookStrengthScore,
    clarityScore,
    viralityScore,
    noveltyScore,
    riskScore,
  });

  // Hesap yasak-kuralı ihlali → hard cap (item 8 ruhu, deterministik):
  // forbidden terim VEYA klişe soru-CTA taşıyan içerik ("soru-CTA yasak" her
  // iki hesabın canlı kuralı) hiçbir kompozitle yayınlanabilir görünemez.
  const forbiddenHits = countKeywordHits(foldTurkish(text), getForbiddenTerms(handle));
  const hasQuestionCta = endsWithQuestionCta(text);
  const publishScore =
    forbiddenHits > 0 || hasQuestionCta ? Math.min(compositePublish, 40) : compositePublish;

  const publishRecommendation = determinePublishRecommendation(publishScore, riskScore);

  const rewriteSuggestion = generateRewriteSuggestion(
    { personaMatchScore, hookStrengthScore, clarityScore, viralityScore, riskScore },
    handle
  );

  const reason = `Persona: ${personaMatchScore}, Hook: ${hookStrengthScore}, Clarity: ${clarityScore}, Virality: ${viralityScore}, Risk: ${riskScore}`;

  let confidence = 48;
  if (parsed.patternName) confidence += 3;
  if (parsed.sourceContent) confidence += 2;
  confidence = clampScore(confidence, 45);

  return {
    personaMatchScore,
    hookStrengthScore,
    clarityScore,
    viralityScore,
    noveltyScore,
    riskScore,
    publishScore,
    publishRecommendation,
    rewriteSuggestion,
    reason,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// AI prompt builders
// ---------------------------------------------------------------------------

function buildSourcePostScoringPrompt(input: SourcePostScoringInput): {
  system: string;
  user: string;
} {
  const accountCtx =
    input.targetAccount && validateAccountHandle(input.targetAccount)
      ? buildAccountScoringContext(input.targetAccount as AccountHandle)
      : "Hedef hesap belirtilmedi. 3 hesap için genel değerlendirme yap.";

  const system = [
    "Sen bir içerik fırsat analiz motorusun.",
    "Verilen kaynak postu puanlıyorsun.",
    "Yanıtını SADECE JSON formatında ver. Başka metin ekleme.",
    "",
    "JSON format:",
    "{",
    '  "relevanceScore": 0-100,',
    '  "freshnessScore": 0-100,',
    '  "controversyScore": 0-100,',
    '  "audienceFitScore": 0-100,',
    '  "quotePotentialScore": 0-100,',
    '  "replyPotentialScore": 0-100,',
    '  "standaloneTweetScore": 0-100,',
    '  "opportunityScore": 0-100,',
    '  "riskScore": 0-100,',
    '  "suggestedAction": "tweet" | "quote" | "reply" | "ignore",',
    '  "reason": "kısa açıklama",',
    '  "suggestedAccounts": ["hesap1"],',
    '  "confidence": 0-100',
    "}",
    "",
    "Kurallar:",
    "- riskScore > 75 ise suggestedAction = ignore",
    "- opportunityScore < 40 ise suggestedAction = ignore",
    '- Geçerli hesaplar: grafikcem ve maskulenkod',
    "",
    accountCtx,
  ].join("\n");

  const user = [
    `Kaynak post (${input.sourceType ?? "tweet"}):`,
    "",
    input.content,
    input.publishedAt ? `\nYayın tarihi: ${input.publishedAt}` : "",
    input.sourceHandle ? `\nKaynak: @${input.sourceHandle}` : "",
  ].join("\n");

  return { system, user };
}

function buildDraftScoringPrompt(input: DraftScoringInput): {
  system: string;
  user: string;
} {
  const handle = input.accountHandle as AccountHandle;
  const accountCtx = buildAccountScoringContext(handle);

  const system = [
    "Sen bir taslak kalite değerlendirme motorusun.",
    "Verilen tweet taslağını puanlıyorsun.",
    "Yanıtını SADECE JSON formatında ver. Başka metin ekleme.",
    "",
    "JSON format:",
    "{",
    '  "personaMatchScore": 0-100,',
    '  "hookStrengthScore": 0-100,',
    '  "clarityScore": 0-100,',
    '  "viralityScore": 0-100,',
    '  "noveltyScore": 0-100,',
    '  "riskScore": 0-100,',
    '  "publishScore": 0-100,',
    '  "publishRecommendation": "publish" | "rewrite" | "reject",',
    '  "rewriteSuggestion": "kısa öneri",',
    '  "reason": "kısa açıklama",',
    '  "confidence": 0-100',
    "}",
    "",
    "Kurallar:",
    "- publishScore >= 75 ve riskScore < 45 ise publish",
    "- publishScore 50-74 veya riskScore 45-70 ise rewrite",
    "- publishScore < 50 veya riskScore > 70 ise reject",
    "",
    accountCtx,
  ].join("\n");

  const user = [
    `Taslak (@${handle}):`,
    "",
    input.content,
    input.sourceContent ? `\nKaynak içerik: ${input.sourceContent}` : "",
    input.patternName ? `\nPattern: ${input.patternName}` : "",
    input.modeId ? `\nMod: ${input.modeId}` : "",
  ].join("\n");

  return { system, user };
}

function buildAccountScoringContext(handle: AccountHandle): string {
  const profile = getScoringIdentity(handle);
  return [
    `Hedef Hesap: @${handle}`,
    `Persona: ${profile.persona}`,
    `Ton: ${profile.tone}`,
    `Format: ${profile.format}`,
    `Viral Mekanik: ${profile.viralMechanic}`,
    `Maks karakter: ${profile.maxChars}`,
    `Yasaklar: ${profile.forbidden.join(", ")}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// AI-powered scoring — source post
// ---------------------------------------------------------------------------

async function scoreSourcePostWithAI(
  input: SourcePostScoringInput
): Promise<SourcePostScore | null> {
  try {
    const { generateJsonGated } = await import("@/lib/ai/generateGated");
    const { system, user } = buildSourcePostScoringPrompt(input);

    const result = await generateJsonGated<Record<string, unknown>>({
      role: "cheapWriter",
      system,
      user,
      temperature: 0.3,
      purpose: "extract_source_score",
    });

    const normalized = normalizeSourcePostScore(result.data);

    // AI confidence baseline
    if (normalized.confidence < 55) {
      normalized.confidence = 65;
    }

    return normalized;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AI-powered scoring — draft
// ---------------------------------------------------------------------------

async function scoreDraftWithAI(
  input: DraftScoringInput
): Promise<DraftScore | null> {
  try {
    const { generateJsonGated } = await import("@/lib/ai/generateGated");
    const { system, user } = buildDraftScoringPrompt(input);

    const result = await generateJsonGated<Record<string, unknown>>({
      role: "cheapWriter",
      system,
      user,
      temperature: 0.2,
      purpose: "judge_draft_score",
    });

    const normalized = normalizeDraftScore(result.data);

    // AI confidence baseline
    if (normalized.confidence < 55) {
      normalized.confidence = 65;
    }

    return normalized;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main scoring functions — AI first, fallback second
// ---------------------------------------------------------------------------

export async function scoreSourcePost(
  input: SourcePostScoringInputRaw
): Promise<SourcePostScore> {
  const parsed = SourcePostScoringInputSchema.parse(input);

  if (parsed.targetAccount && !validateAccountHandle(parsed.targetAccount)) {
    throw new Error(`Invalid targetAccount: ${parsed.targetAccount}`);
  }

  const aiResult = await scoreSourcePostWithAI(parsed);
  if (aiResult) return aiResult;

  return scoreSourcePostFallback(parsed);
}

export async function scoreDraft(
  input: DraftScoringInput
): Promise<DraftScore> {
  const parsed = DraftScoringInputSchema.parse(input);

  if (!validateAccountHandle(parsed.accountHandle)) {
    throw new Error(`Invalid accountHandle: ${parsed.accountHandle}`);
  }

  const aiResult = await scoreDraftWithAI(parsed);
  if (aiResult) return aiResult;

  return scoreDraftFallback(parsed);
}
