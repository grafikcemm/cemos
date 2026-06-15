import type { AccountHandle } from "@/lib/accounts";

/**
 * Per-account niche queries — the örn1 "Analysis Parameters.keyword" made
 * persona-specific. Kept separate from account-profiles so voice/persona files
 * stay focused on tone, and discovery targeting can evolve independently.
 */
export interface NicheQueries {
  /** Subreddit names (without r/). */
  reddit: string[];
  /** YouTube search queries. */
  youtube: string[];
  /** Relevance keywords used by the pre-filter and scorer. */
  keywords: string[];
}

export const NICHE_QUERIES: Record<AccountHandle, NicheQueries> = {
  grafikcem: {
    reddit: ["artificial", "midjourney", "StableDiffusion", "graphic_design", "ChatGPT", "OpenAI"],
    youtube: ["AI design tools", "yapay zeka tasarım", "AI prompt trick", "generative AI workflow", "AI görsel üretim"],
    keywords: [
      "ai", "yapay zeka", "tasarım", "design", "araç", "tool", "model", "openai", "üretken", "workflow",
      "prompt", "thread", "repo", "github", "açık kaynak", "görsel", "otomasyon", "midjourney", "figma",
    ],
  },
  maskulenkod: {
    reddit: ["masculinity", "getdisciplined", "selfimprovement", "Stoicism", "marriedredpill"],
    youtube: ["maskülen disiplin sistem", "erkek kimlik sosyal güç", "modern erkeklik", "hipergami nedir"],
    keywords: [
      "erkek",
      "kadın",
      "ilişki",
      "evlilik",
      "hipergami",
      "seçilme",
      "statü",
      "değer",
      "maskülen",
      "disiplin",
      "sorumluluk",
      "sadakat",
      "sistem",
      "kimlik",
      "sosyal güç",
      "alışkanlık",
      "rutin",
      "irade",
    ],
  },

};
