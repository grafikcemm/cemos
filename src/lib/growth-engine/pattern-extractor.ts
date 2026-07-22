/**
 * Sprint 3 — Pattern Extractor
 *
 * Extracts viral patterns from tweets, news articles, source posts, or manual text.
 * Uses AI (OpenRouter) when available, falls back to heuristic extraction.
 *
 * Does NOT create API routes, UI, or modify existing pipeline.
 */

import { z } from "zod";
import {
  PatternExtractionInputSchema,
  PatternExtractionResultSchema,
  type PatternExtractionInput,
  type PatternExtractionInputRaw,
  type PatternExtractionResult,
  type CreateViralPatternInput,
} from "@/lib/growth-engine/types";
import {
  isKnownAccountHandle as validateAccountHandle,
  getScoringIdentity,
  getDefaultGenerationMode,
  type ScoringIdentity,
} from "@/lib/growth-engine/account-adapter";
import type { AccountHandle } from "@/lib/accounts";

// ---------------------------------------------------------------------------
// Account-specific pattern catalogs
// ---------------------------------------------------------------------------

const ACCOUNT_PATTERNS: Record<AccountHandle, string[]> = {
  grafikcem: [
    "Araç Testi Dürüst Yorum",
    "Prompt/Süreç Trick'i",
    "Bookmark Çeken Thread Dökümü",
    "Hype Değil Kullanım Değeri",
    "Repo/Kaynak + Kişisel Yorum",
    // 2026 derin araştırma (deep-research-2026) pattern kütüphanesi:
    "Hype Değil Test Sonucu",
    "Sayıyla Kıyas",
    "Kaynak Yığını",
    "Data First Thread",
    "Saha Günlüğü Thread",
  ],
  maskulenkod: [
    "Sistem Eksikliği Teşhisi",
    "Güç Dinamiği Gözlemi",
    "Yanlış Anlaşılan Gerçek (Thread)",
    "Motivasyon Karşıtı Hot Take",
    "Kurulabilir Disiplin Sistemi",
    // 2026 derin araştırma (deep-research-2026) pattern kütüphanesi:
    "Acı Teşhis Sonra Yol Haritası",
    "Sistem Haritası Thread",
    "Statü Maliyeti",
    "Yanlış İnanç Yıkımı",
    "Gözlemden İlkeye",
  ],

};

// ---------------------------------------------------------------------------
// Default emotional triggers per account
// ---------------------------------------------------------------------------

const DEFAULT_TRIGGERS: Record<AccountHandle, string> = {
  grafikcem: "bunu bilmem gerekiyordu",
  maskulenkod: "rahatsız edici gerçek",

};

// ---------------------------------------------------------------------------
// Keyword-based account detection
// ---------------------------------------------------------------------------

const ACCOUNT_KEYWORDS: Record<AccountHandle, string[]> = {
  grafikcem: [
    "ai", "yapay zeka", "tasarım", "design", "branding", "freelance",
    "araç", "tool", "prompt", "grafik", "logo", "model", "chatgpt",
    "openai", "midjourney", "figma", "adobe", "canva",
    "thread", "repo", "github", "açık kaynak", "görsel", "workflow", "otomasyon",
  ],
  maskulenkod: [
    "erkek", "adam", "maskülen", "disiplin", "ilişki", "kadın",
    "para", "zihniyet", "stoik", "stoicism", "özgüven", "güç",
    "irade", "karakter", "başarı", "zayıflık",
    "sistem", "kimlik", "sosyal", "statü", "hipergami", "seçilme", "alışkanlık", "rutin",
  ],

};

// ---------------------------------------------------------------------------
// Text analysis helpers
// ---------------------------------------------------------------------------

function extractFirstSentence(text: string, maxLen = 120): string {
  const match = text.match(/^[^.!?]+[.!?]/);
  if (match && match[0].length <= maxLen) return match[0].trim();
  return text.slice(0, maxLen).trim();
}

function extractMainClaim(text: string): string {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  // The "main claim" is typically the second sentence or the longest one
  if (sentences.length >= 2) return sentences[1].trim();
  if (sentences.length === 1) return sentences[0].trim();
  return text.slice(0, 200).trim();
}

function detectAccounts(text: string): AccountHandle[] {
  const lower = text.toLowerCase();
  const scores: { handle: AccountHandle; score: number }[] = [];

  for (const [handle, keywords] of Object.entries(ACCOUNT_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > 0) {
      scores.push({ handle: handle as AccountHandle, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.map((s) => s.handle);
}

function pickSuggestedPatterns(handle: AccountHandle, text: string): string[] {
  const patterns = ACCOUNT_PATTERNS[handle];
  if (!patterns || patterns.length === 0) return ["Genel Pattern"];

  // Simple heuristic: return first 2 patterns for the account
  // In a real scenario AI would analyze the text more deeply
  const lower = text.toLowerCase();

  // Try to match pattern themes to text content
  const matched: string[] = [];

  if (handle === "grafikcem") {
    if (lower.includes("araç") || lower.includes("tool") || lower.includes("güncelleme"))
      matched.push("Workflow Değişimi");
    if (lower.includes("tasarım") || lower.includes("design") || lower.includes("grafik"))
      matched.push("Tasarımcı İçin Anlamı");
    if (lower.includes("hype") || lower.includes("değil"))
      matched.push("Hype Değil Kullanım Değeri");
    if (matched.length === 0) matched.push("Sessiz Değişim");
  } else if (handle === "maskulenkod") {
    if (lower.includes("inan") || lower.includes("hâlâ") || lower.includes("hala"))
      matched.push("Hâlâ Buna İnanıyorsan");
    if (lower.includes("ilişki") || lower.includes("kadın"))
      matched.push("Yumuşatılmamış İlişki Gerçeği");
    if (lower.includes("disiplin") || lower.includes("irade"))
      matched.push("Disiplin Eksikliği");
    if (matched.length === 0) matched.push("Ayna Tutan Gerçek");
  }

  // Ensure at least 1 pattern
  if (matched.length === 0) matched.push(patterns[0]);

  // Cap at 3
  return matched.slice(0, 3);
}

// ---------------------------------------------------------------------------
// AI prompt builder
// ---------------------------------------------------------------------------

function buildExtractionPrompt(input: PatternExtractionInput): { system: string; user: string } {
  const accountCtx = input.accountHandle && validateAccountHandle(input.accountHandle)
    ? buildAccountContext(input.accountHandle as AccountHandle)
    : "Hedef hesap belirtilmedi. Genel analiz yap.";

  const system = [
    "Sen bir viral pattern analiz motorusun.",
    "Verilen metinden viral pattern bileşenlerini çıkarıyorsun.",
    "Yanıtını SADECE aşağıdaki JSON formatında ver. Başka metin ekleme.",
    "",
    "JSON format:",
    "{",
    '  "hook": "metnin dikkat çeken açılış cümlesi veya önerilen hook",',
    '  "mainClaim": "metnin ana iddiası veya mesajı",',
    '  "emotionalTrigger": "metnin tetiklediği duygu",',
    '  "structure": "metnin yapısal kalıbı (hook -> claim -> context -> closing gibi)",',
    '  "tone": "metnin tonu (sert, editöryal, provokatif, vs.)",',
    '  "audience": "hedef kitle tanımı",',
    '  "viralityReason": "bu metnin neden viral olma potansiyeli taşıdığı",',
    '  "suggestedAccounts": ["hesap1", "hesap2"],',
    '  "suggestedPatterns": ["pattern adı 1", "pattern adı 2"],',
    '  "confidence": 0-100 arası sayı',
    "}",
    "",
    accountCtx,
    "",
    "Geçerli hesaplar: grafikcem ve maskulenkod",
    "suggestedAccounts sadece bu 3 hesaptan birini içerebilir.",
  ].join("\n");

  const user = [
    `Metin (${input.sourceType ?? "manual"}, Dil: ${input.language ?? "TR"}):`,
    "",
    input.text,
  ].join("\n");

  return { system, user };
}

function buildAccountContext(handle: AccountHandle): string {
  const profile = getScoringIdentity(handle);
  const mode = getDefaultGenerationMode(handle);
  return [
    `Hedef Hesap: @${handle}`,
    `Persona: ${profile.persona}`,
    `Ton: ${profile.tone}`,
    `Viral Mekanik: ${profile.viralMechanic}`,
    `Varsayılan Mod: ${mode.id} — ${mode.label}`,
    `Konu Alanı: ${profile.concept}`,
    "",
    "Hesaba özel olası pattern isimleri:",
    ...ACCOUNT_PATTERNS[handle].map((p) => `- ${p}`),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// normalizePatternExtraction — safely convert unknown AI response to typed result
// ---------------------------------------------------------------------------

export function normalizePatternExtraction(raw: unknown): PatternExtractionResult {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return buildEmptyResult();
  }

  const obj = raw as Record<string, unknown>;

  // Filter suggestedAccounts to only valid handles
  const rawAccounts = Array.isArray(obj.suggestedAccounts) ? obj.suggestedAccounts : [];
  const validAccounts = rawAccounts
    .filter((a): a is string => typeof a === "string")
    .filter((a) => validateAccountHandle(a));

  // Filter suggestedPatterns to non-empty strings
  const rawPatterns = Array.isArray(obj.suggestedPatterns) ? obj.suggestedPatterns : [];
  const validPatterns = rawPatterns.filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0
  );

  // Clamp confidence
  let confidence = typeof obj.confidence === "number" ? obj.confidence : 50;
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  const result: PatternExtractionResult = {
    hook: typeof obj.hook === "string" ? obj.hook : "",
    mainClaim: typeof obj.mainClaim === "string" ? obj.mainClaim : "",
    emotionalTrigger: typeof obj.emotionalTrigger === "string" ? obj.emotionalTrigger : "",
    structure: typeof obj.structure === "string" ? obj.structure : "hook -> claim -> context -> closing",
    tone: typeof obj.tone === "string" ? obj.tone : "",
    audience: typeof obj.audience === "string" ? obj.audience : "",
    viralityReason: typeof obj.viralityReason === "string" ? obj.viralityReason : "",
    suggestedAccounts: validAccounts,
    suggestedPatterns: validPatterns.length > 0 ? validPatterns : ["Genel Pattern"],
    confidence,
    rawJson: raw,
  };

  return result;
}

function buildEmptyResult(): PatternExtractionResult {
  return {
    hook: "",
    mainClaim: "",
    emotionalTrigger: "",
    structure: "hook -> claim -> context -> closing",
    tone: "",
    audience: "",
    viralityReason: "",
    suggestedAccounts: [],
    suggestedPatterns: ["Genel Pattern"],
    confidence: 0,
  };
}

// ---------------------------------------------------------------------------
// Fallback heuristic extraction (no AI)
// ---------------------------------------------------------------------------

export function extractPatternSyncFallback(
  input: PatternExtractionInputRaw
): PatternExtractionResult {
  const parsed = PatternExtractionInputSchema.parse(input);
  const text = parsed.text;

  // Determine target account
  const handle: AccountHandle | null =
    parsed.accountHandle && validateAccountHandle(parsed.accountHandle)
      ? (parsed.accountHandle as AccountHandle)
      : null;

  // Detect relevant accounts from text
  const detectedAccounts = handle ? [handle] : detectAccounts(text);
  const primaryHandle = detectedAccounts[0] ?? "grafikcem";
  const profile: ScoringIdentity = getScoringIdentity(primaryHandle);

  // Build heuristic result
  const hook = extractFirstSentence(text);
  const mainClaim = extractMainClaim(text);
  const emotionalTrigger = DEFAULT_TRIGGERS[primaryHandle] ?? "ilgi çekici bilgi";
  const suggestedPatterns = pickSuggestedPatterns(primaryHandle, text);

  // Confidence for fallback: 40-60 range based on text quality
  const textLength = text.length;
  let confidence: number;
  if (textLength > 300) confidence = 55;
  else if (textLength > 100) confidence = 50;
  else confidence = 42;

  // Adjust confidence if account was explicitly provided
  if (handle) confidence += 5;

  // Clamp to 40-60 for fallback
  confidence = Math.max(40, Math.min(60, confidence));

  return {
    hook,
    mainClaim,
    emotionalTrigger,
    structure: "hook -> claim -> context -> closing",
    tone: profile.tone,
    audience: profile.concept,
    viralityReason: "Metin hedef hesabın konusu ve tonu için pattern çıkarımına uygun.",
    suggestedAccounts: detectedAccounts.length > 0 ? detectedAccounts : [primaryHandle],
    suggestedPatterns,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// AI-powered extraction
// ---------------------------------------------------------------------------

async function extractPatternWithAI(
  input: PatternExtractionInput
): Promise<PatternExtractionResult | null> {
  try {
    // Dynamic import to avoid coupling at module level
    // This ensures the module works even if AI infra has issues
    const { generateJsonGated } = await import("@/lib/ai/generateGated");

    const { system, user } = buildExtractionPrompt(input);

    const result = await generateJsonGated<Record<string, unknown>>({
      role: "cheapWriter",
      system,
      user,
      temperature: 0.4,
      purpose: "extract_pattern",
    });

    const normalized = normalizePatternExtraction(result.data);

    // AI result gets higher confidence baseline
    if (normalized.confidence < 60) {
      normalized.confidence = 65;
    }

    return normalized;
  } catch {
    // AI call failed — caller should use fallback
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main extraction function — tries AI first, falls back to heuristics
// ---------------------------------------------------------------------------

export async function extractPattern(
  input: PatternExtractionInputRaw
): Promise<PatternExtractionResult> {
  // Validate input with Zod
  const parsed = PatternExtractionInputSchema.parse(input);

  // Validate accountHandle if provided
  if (parsed.accountHandle && !validateAccountHandle(parsed.accountHandle)) {
    throw new Error(`Invalid accountHandle: ${parsed.accountHandle}`);
  }

  // Try AI extraction first
  const aiResult = await extractPatternWithAI(parsed);
  if (aiResult) {
    return aiResult;
  }

  // Fallback to heuristic extraction
  return extractPatternSyncFallback(parsed);
}

// ---------------------------------------------------------------------------
// patternExtractionToViralPatternInput — converts extraction result to repo input
// ---------------------------------------------------------------------------

export function patternExtractionToViralPatternInput(
  result: PatternExtractionResult,
  accountId: string
): CreateViralPatternInput {
  if (!accountId || accountId.trim().length === 0) {
    throw new Error("accountId is required");
  }

  const patternName =
    result.suggestedPatterns.length > 0
      ? result.suggestedPatterns[0]
      : "Extracted Pattern";

  return {
    accountId,
    patternName,
    category: result.structure,
    hookType: result.hook.length > 0 ? "extracted" : "unknown",
    structureJson: {
      hook: result.hook,
      mainClaim: result.mainClaim,
      emotionalTrigger: result.emotionalTrigger,
      structure: result.structure,
      tone: result.tone,
      audience: result.audience,
      viralityReason: result.viralityReason,
    },
    emotion: result.emotionalTrigger,
    viralityTrigger: result.viralityReason,
    exampleGood: result.hook,
    exampleBad: undefined,
    usageCount: 0,
    successScore: result.confidence,
    isActive: true,
  };
}

// ---------------------------------------------------------------------------
// saveExtractedPattern — optional helper for extracting + saving in one step
// ---------------------------------------------------------------------------

export async function saveExtractedPattern(input: {
  text: string;
  accountHandle?: string;
  accountId?: string;
  sourceType?: "tweet" | "news" | "source_post" | "manual";
  language?: "TR" | "EN";
}): Promise<{
  result: PatternExtractionResult;
  saved: boolean;
  patternId?: string;
}> {
  const extractionInput: PatternExtractionInput = {
    text: input.text,
    accountHandle: input.accountHandle,
    sourceType: input.sourceType ?? "manual",
    language: input.language ?? "TR",
  };

  const result = await extractPattern(extractionInput);

  if (!input.accountId) {
    return { result, saved: false };
  }

  try {
    const { viralPatternRepo } = await import("@/lib/db/viralPatternRepo");
    const viralInput = patternExtractionToViralPatternInput(result, input.accountId);
    const created = await viralPatternRepo.create(viralInput);
    return { result, saved: true, patternId: created.id };
  } catch {
    // DB save failed — return result without saving
    return { result, saved: false };
  }
}
