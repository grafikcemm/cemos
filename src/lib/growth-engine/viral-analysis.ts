import { accountProfiles, type AccountHandle } from "@/lib/accounts";
import { NICHE_QUERIES } from "@/lib/sources/niche-queries";
import { generateJsonGated } from "@/lib/ai/generateGated";
import { getBudgetStatus } from "@/lib/config/costGate";
import { wrapUntrustedData, UNTRUSTED_DATA_NOTICE } from "@/lib/ai/untrustedData";

/**
 * örn1-style deep structural analysis of an EXTERNAL viral item. This is the
 * real "training" signal: we mine WHY something performed so the generator can
 * reuse the mechanics in-persona. Always returns a result (heuristic fallback),
 * never throws.
 */

export type Sentiment = "positive" | "negative" | "mixed";

export type ViralAnalysis = {
  summary: string;
  sentiment: Sentiment;
  keyArguments: string[];
  trendingPotential: number; // 1–10
  audienceInterest: number; // 1–10
  newsValue: number; // 1–10
  angleSuggestions: string[];
  hook: string;
  structure: string;
  emotion: string;
  viralityReason: string;
  usedLlm: boolean;
};

function clamp10(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : fallback;
  return Math.max(1, Math.min(10, Math.round(v)));
}

/** Deterministic fallback so mining works with no API key / spent budget. */
export function heuristicAnalysis(text: string, handle: AccountHandle): ViralAnalysis {
  const keywords = NICHE_QUERIES[handle]?.keywords ?? [];
  const lower = text.toLowerCase();
  const hits = keywords.filter((k) => lower.includes(k.toLowerCase())).length;
  const interest = Math.max(3, Math.min(9, 3 + hits));
  return {
    summary: text.slice(0, 140),
    sentiment: "mixed",
    keyArguments: [text.slice(0, 80)],
    trendingPotential: interest,
    audienceInterest: interest,
    newsValue: Math.max(2, Math.min(8, hits + 2)),
    angleSuggestions: [`@${handle} açısından yeniden yorumla`],
    hook: text.slice(0, 60),
    structure: "claim",
    emotion: "merak",
    viralityReason: "heuristic: niş anahtar kelime örtüşmesi",
    usedLlm: false,
  };
}

function buildSystemPrompt(handle: AccountHandle): string {
  const p = accountProfiles[handle];
  return [
    "Sen medya okuryazarlığı yüksek bir içerik analiz uzmanısın. Verilen dış içeriği derinlemesine, yapısal olarak analiz et.",
    `Hedef hesap: @${handle} (${p.persona} — ${p.concept}).`,
    "Şunları çıkar: özet, duygu, ana argümanlar, trend potansiyeli, hedef kitle ilgisi, haber değeri, yeni açı önerileri, hook, yapı, duygu, viralite nedeni.",
    `Çıktı SADECE şu JSON:`,
    `{"summary":"","sentiment":"positive|negative|mixed","key_arguments":[],"trending_potential":<1-10>,"audience_interest":<1-10>,"news_value":<1-10>,"angle_suggestions":[],"hook":"","structure":"","emotion":"","virality_reason":""}`,
    UNTRUSTED_DATA_NOTICE,
  ].join("\n");
}

type RawAnalysis = {
  summary?: string;
  sentiment?: string;
  key_arguments?: string[];
  trending_potential?: number;
  audience_interest?: number;
  news_value?: number;
  angle_suggestions?: string[];
  hook?: string;
  structure?: string;
  emotion?: string;
  virality_reason?: string;
};

export async function analyzeViralItem(text: string, handle: AccountHandle): Promise<ViralAnalysis> {
  if (!process.env.OPENROUTER_API_KEY) return heuristicAnalysis(text, handle);
  const budget = await getBudgetStatus();
  if (!budget.allowed) return heuristicAnalysis(text, handle);

  try {
    const run = await generateJsonGated<RawAnalysis>({
      role: "cheapWriter",
      system: buildSystemPrompt(handle),
      user: `İçerik:\n${wrapUntrustedData(text.slice(0, 900))}`,
      temperature: 0.4,
      purpose: "extract_viral_analysis",
    });
    const d = run.data;
    const sentiment: Sentiment =
      d.sentiment === "positive" || d.sentiment === "negative" ? d.sentiment : "mixed";
    return {
      summary: d.summary?.slice(0, 200) || text.slice(0, 140),
      sentiment,
      keyArguments: Array.isArray(d.key_arguments) ? d.key_arguments.slice(0, 5) : [],
      trendingPotential: clamp10(d.trending_potential, 5),
      audienceInterest: clamp10(d.audience_interest, 5),
      newsValue: clamp10(d.news_value, 4),
      angleSuggestions: Array.isArray(d.angle_suggestions) ? d.angle_suggestions.slice(0, 5) : [],
      hook: d.hook?.slice(0, 120) || text.slice(0, 60),
      structure: d.structure?.slice(0, 60) || "claim",
      emotion: d.emotion?.slice(0, 40) || "merak",
      viralityReason: d.virality_reason?.slice(0, 200) || "",
      usedLlm: true,
    };
  } catch {
    return heuristicAnalysis(text, handle);
  }
}
