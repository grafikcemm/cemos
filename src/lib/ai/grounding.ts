import type { AccountProfile } from "@/lib/accounts";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
import { sourcePostRepo } from "@/lib/db/sourcePostRepo";
import { buildMemoryContext, buildMemoryPromptBlock } from "@/lib/growth-engine/vector-memory";

/**
 * örn2 brand-voice discipline listesi artık tek kaynaktan gelir
 * (`@/lib/safety/banned-phrases`) — hem bu grounding bloğu hem deterministik
 * lint aynı listeyi kullanır (FIRST-SPRINT item 9). Re-export geriye dönük
 * import'ları korur.
 */
export { BANNED_PHRASES } from "@/lib/safety/banned-phrases";
import { BANNED_PHRASES } from "@/lib/safety/banned-phrases";

export type GroundingContext = {
  block: string;
  /** IDs of the ViralPatterns the draft was grounded on — stored in the
   * QueueItem `scores` JSON so the engagement learning loop can later
   * re-weight exactly these patterns by real post performance. */
  patternIds: string[];
  /** IDs of the live viral SourcePosts injected as "what's working now"
   * research context (xpatla-parity). Stored alongside patternIds. */
  sourcePostIds: string[];
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
  const sourcePostIds: string[] = [];

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

  // 1.5) Araştırma katmanı (xpatla-parity): nişte ŞU AN patlayan gerçek örnekler.
  //      Rakibin çekirdek farkı buydu — yazımdan önce güncel viral içeriği tara.
  //      Ekstra LLM yok (viralScore zaten hesaplı); en yüksek skorlu 5 taze post.
  try {
    const hot = await sourcePostRepo.listNewByAccount(accountId, 5);
    const strong = hot.filter((p) => (p.viralScore ?? 0) >= 40);
    if (strong.length > 0) {
      sourcePostIds.push(...strong.map((p) => p.id));
      parts.push(
        "=== GÜNCEL VİRAL ÖRNEKLER (nişte şu an patlayan içerik — neyin tuttuğunu gör, KOPYALAMA) ===\n" +
          strong
            .map((p) => {
              const txt = (p.text ?? "").replace(/\s+/g, " ").slice(0, 160);
              return `* [skor ${p.viralScore}] @${p.source?.handle ?? "?"}: "${txt}"`;
            })
            .join("\n")
      );
    }
  } catch {
    /* fail-soft */
  }

  // 1.7) SES PROFİLİ bloğu buradan (user mesajı) SYSTEM prompt'a taşındı —
  //      FIRST-SPRINT item 16: buildDraftSystemPrompt(profile, voice) tek
  //      enjeksiyon noktası (tekrar/şişme yok + Anthropic cache breakpoint'i).
  //      Voice verisini draftService yükler (loadDraftVoice) ve pipeline'a geçirir.

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

  return { block: parts.join("\n\n"), patternIds, sourcePostIds };
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
