/**
 * Memory retrieval enjeksiyonu (Sprint 3 — FINAL-MEMORY-SPEC §5).
 *
 * Sıralama (§5.4): voice-constitution (Tier 1, her zaman) → aktif MemoryFact
 * kuralları → CaptionDna/HashtagDna özeti → (mevcut recall blokları grounding
 * içinde devam eder). Tamamı fail-soft: hata = blok atlanır, üretim durmaz.
 */

import { prisma } from "@/lib/db/client";
import { generateJsonGated } from "@/lib/ai/generateGated";
import { getVoiceConstitution } from "@/lib/memory/constitutions";
import { getActiveFacts } from "@/lib/memory/memoryFactService";
import type { MemoryContext, MemorySearchResult } from "@/lib/growth-engine/types";

/** §5.2 — rerank sonrası enjekte edilecek maksimum recall örneği. */
export const RERANK_TOP_N = 8;

function safeJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Aktif identity kurallarını talimat satırlarına çevirir (en fazla 8). */
async function buildFactLines(accountHandle: string): Promise<string[]> {
  const facts = await getActiveFacts(accountHandle);
  return facts.slice(0, 8).map((f) => `- [${f.type}] ${f.statement}`);
}

/** CaptionDna/HashtagDna kısa özeti — satır varsa eklenir, yoksa atlanır. */
async function buildDnaSummary(accountHandle: string): Promise<string[]> {
  const lines: string[] = [];
  const caption = await prisma.captionDna.findUnique({ where: { accountHandle } }).catch(() => null);
  if (caption) {
    const hooks = safeJsonArray(caption.openingHookTypes).slice(0, 4);
    const signatures = safeJsonArray(caption.signaturePhrases).slice(0, 4);
    const forbidden = safeJsonArray(caption.forbiddenPhrases).slice(0, 4);
    const bits = [
      hooks.length ? `açılış kancaları: ${hooks.join(", ")}` : null,
      `emoji: ${caption.emojiPolicy}`,
      `dil: ${caption.languageRegister}`,
      signatures.length ? `imza ifadeler: ${signatures.join(", ")}` : null,
      forbidden.length ? `yasak ifadeler: ${forbidden.join(", ")}` : null,
    ].filter(Boolean);
    lines.push(`Caption DNA — ${bits.join(" | ")}`);
  }
  const hashtag = await prisma.hashtagDna
    .findFirst({ where: { accountHandle, seriesId: null } })
    .catch(() => null);
  if (hashtag) {
    const core = safeJsonArray(hashtag.coreTags).slice(0, 5);
    if (core.length > 0) {
      lines.push(`Hashtag DNA — çekirdek: ${core.join(" ")} | yerleşim: ${hashtag.placement}`);
    }
  }
  return lines;
}

/**
 * §5.2 — LLM-as-reranker: cosine top-K adayları judge preset'iyle tek batched
 * çağrıda relevance-sıralanır, top-8 tutulur. Aday sayısı ≤ RERANK_TOP_N ise
 * LLM çağrısı YAPILMAZ (bedava kısa devre). Her hata fail-open: orijinal
 * (cosine-sıralı) context aynen döner. Spend `memory_rerank` altında (AC-6).
 */
export async function rerankMemoryContext(
  context: MemoryContext,
  sourceText: string,
  accountId?: string
): Promise<MemoryContext> {
  type Tagged = { group: keyof Pick<MemoryContext, "positiveExamples" | "negativeExamples" | "editedExamples" | "patternExamples">; item: MemorySearchResult };
  const tagged: Tagged[] = [
    ...context.positiveExamples.map((item) => ({ group: "positiveExamples" as const, item })),
    ...context.negativeExamples.map((item) => ({ group: "negativeExamples" as const, item })),
    ...context.editedExamples.map((item) => ({ group: "editedExamples" as const, item })),
    ...context.patternExamples.map((item) => ({ group: "patternExamples" as const, item })),
  ];
  if (tagged.length <= RERANK_TOP_N) return context;

  try {
    const listing = tagged
      .map((t, i) => `${i}. [${t.group}] ${t.item.outputContent.replace(/\s+/g, " ").slice(0, 160)}`)
      .join("\n");
    const run = await generateJsonGated<{ keep?: number[] }>({
      preset: "cemos-final-judge",
      system:
        `Sen bir hafıza alaka hakemisin. Kaynak içeriğe göre en alakalı ${RERANK_TOP_N} hafıza örneğinin ` +
        'index\'lerini seç. Çıktı SADECE JSON: {"keep":[<index>...]}',
      user: `Kaynak içerik:\n"""${sourceText.slice(0, 500)}"""\n\nAdaylar:\n${listing}`,
      temperature: 0,
      purpose: "memory_rerank",
      accountId,
    });
    const keep = Array.isArray(run.data.keep)
      ? new Set(run.data.keep.filter((n) => Number.isInteger(n) && n >= 0 && n < tagged.length))
      : null;
    if (!keep || keep.size === 0) return context;

    const next: MemoryContext = {
      positiveExamples: [],
      negativeExamples: [],
      editedExamples: [],
      patternExamples: [],
      warnings: context.warnings,
    };
    tagged.forEach((t, i) => {
      if (keep.has(i)) next[t.group].push(t.item);
    });
    return next;
  } catch {
    return context; // fail-open: rerank başarısızsa cosine sırası kalır
  }
}

/**
 * Identity hafıza bloğu — grounding'in EN BAŞINA eklenir (§5.4 sıralaması).
 * Boş string = enjekte edilecek içerik yok.
 */
export async function buildIdentityMemoryBlock(accountHandle: string): Promise<string> {
  const parts: string[] = [];

  const constitution = getVoiceConstitution(accountHandle);
  if (constitution) {
    parts.push(`=== SES ANAYASASI (değişmez çapa — her kuralı uygula) ===\n${constitution}`);
  }

  try {
    const factLines = await buildFactLines(accountHandle);
    if (factLines.length > 0) {
      parts.push(
        `=== ÖĞRENİLMİŞ KURALLAR (operatör onaylı hafıza) ===\n${factLines.join("\n")}`
      );
    }
  } catch {
    /* fail-soft */
  }

  try {
    const dnaLines = await buildDnaSummary(accountHandle);
    if (dnaLines.length > 0) {
      parts.push(`=== YAZIM DNA ÖZETİ ===\n${dnaLines.join("\n")}`);
    }
  } catch {
    /* fail-soft */
  }

  return parts.join("\n\n");
}
