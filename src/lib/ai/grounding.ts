import type { AccountProfile } from "@/lib/accounts";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
import { buildMemoryContext, buildMemoryPromptBlock } from "@/lib/growth-engine/vector-memory";

/**
 * örn2 brand-voice discipline: phrases that read as generic AI/marketing tropes.
 * These are appended to every grounding block as a hard "never write" list.
 */
export const BANNED_PHRASES: string[] = [
  "Stop doing",
  "X is dead",
  "öldü",
  "DM me",
  "game changer",
  "oyunun kurallarını değiştir",
  "çığır açan",
  "devrim niteliğinde",
  "bunu kaçırma",
  "inanılmaz",
  "şok edici",
  "herkes konuşuyor",
];

export type GroundingContext = {
  block: string;
  /** IDs of the ViralPatterns the draft was grounded on — stored in the
   * QueueItem `scores` JSON so the engagement learning loop can later
   * re-weight exactly these patterns by real post performance. */
  patternIds: string[];
};

/**
 * Builds the grounding block prepended to the writer's source input. This is
 * how Phase 3 grounds every draft in (mined viral patterns + semantic memory +
 * brand-voice discipline) without changing the tuned draft-pipeline signatures.
 * Fully fail-soft: any sub-step that errors is simply omitted.
 */
export async function buildGroundingContext(
  profile: AccountProfile,
  accountId: string,
  sourceText: string,
  sourceType?: string
): Promise<GroundingContext> {
  const parts: string[] = [];
  const patternIds: string[] = [];

  // 1) Mined viral patterns (the externally-learned "training").
  try {
    const patterns = await viralPatternRepo.listByAccount(accountId, true);
    // X draft grounding'i yalnız X (veya platform'suz legacy) pattern'leri kullanır —
    // IG/YouTube pattern'leri (research ingest) X taslaklarına sızmasın.
    const xPatterns = patterns.filter((p) => !p.platform || p.platform === "x");
    const top = xPatterns.slice(0, 3);
    if (top.length > 0) {
      patternIds.push(...top.map((p) => p.id));
      parts.push(
        "=== VİRAL PATTERN KILAVUZU (dış viral içerikten öğrenildi — mekaniğini taklit et, metni değil) ===\n" +
          top
            .map((p) => {
              const ex = (p.exampleGood || p.patternName || "").replace(/\s+/g, " ").slice(0, 120);
              return `* Hook örneği: "${ex}" | Yapı: ${p.hookType ?? "-"} | Duygu: ${p.emotion || "-"}`;
            })
            .join("\n")
      );
    }
  } catch {
    /* fail-soft */
  }

  // 2) Semantic memory (RAG over the populated corpus).
  try {
    const ctx = await buildMemoryContext({ accountHandle: profile.handle, sourceContent: sourceText });
    const block = buildMemoryPromptBlock(ctx);
    if (block.trim()) parts.push(block.trim());
  } catch {
    /* fail-soft */
  }

  // 3) örn2 brand-voice discipline.
  parts.push(
    "=== MARKA SESİ DİSİPLİNİ ===\n" +
      `Persona kilidi: ${profile.persona}. Aşağıdaki klişe/satışçı kalıpları ASLA kullanma: ${BANNED_PHRASES.join(", ")}.`
  );

  // 4) Platform-native adaptation (örn2): never quote/link-dump non-X sources.
  if (sourceType && sourceType !== "x") {
    parts.push(
      `Kaynak platformu: ${sourceType}. İçeriği link/alıntı yapma; @${profile.handle} sesiyle özgün, native bir tek X tweet'ine yeniden yaz.`
    );
  }

  return { block: parts.join("\n\n"), patternIds };
}

/** Back-compat string wrapper around {@link buildGroundingContext}. */
export async function buildGroundingBlock(
  profile: AccountProfile,
  accountId: string,
  sourceText: string,
  sourceType?: string
): Promise<string> {
  return (await buildGroundingContext(profile, accountId, sourceText, sourceType)).block;
}
