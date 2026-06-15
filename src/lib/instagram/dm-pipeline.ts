/**
 * Instagram DM LLM pipeline'ı (Faz E) — comment-pipeline aynası:
 *  - translateInbound: 10'arlı gelen mesaj → tek cheapWriter çağrısı {lang,trText}
 *  - updateRollingSummary: konuşma >10 mesaj → cheapWriter bağlam özeti (sınırlı bağlam)
 *  - generateDmVariants: creativeWriter → 2 bağlam-farkında yanıt taslağı
 *  - scoreDmRisk: tek 'risk' merceği — DM hassas, taslaktan ÖNCE her zaman çalışır
 *
 * SAF yardımcılar (parse*, build*Block) I/O içermez → birim test edilebilir.
 * LLM hataları çağıran serviste fail-open ele alınır.
 */

import { generateJson } from "@/lib/ai/openrouter";
import { createPipelineTrace } from "@/lib/agents/pipeline-runner";
import { usageService } from "@/lib/services/usageService";
import { accountProfiles } from "@/lib/accounts";
import { IG_DM_READ_PURPOSE, IG_DM_DRAFT_PURPOSE } from "@/lib/instagram/igConfig";

export type DmTranslateInput = { messageId: string; text: string };
export type TranslatedMessage = { messageId: string; lang: string; trText: string };
export type DmDraftVariant = { textTr: string; textOriginal: string | null; tone: string };
export type DmContextMessage = { fromMe: boolean; text: string; trText: string };

// ── SAF yardımcılar ──────────────────────────────────────────────────────────

export function buildDmTranslateBlock(messages: DmTranslateInput[]): string {
  const lines = messages.map((m, i) => `${i}) ${(m.text || "").slice(0, 600)}`);
  return `Gelen Instagram DM mesajları:\n${lines.join("\n")}`;
}

type RawTranslateItem = { index?: unknown; lang?: unknown; trText?: unknown };

/** index'i batch sırasına göre messageId'ye eşler; bozuk/tekrar index'i düşürür. */
export function parseDmTranslateResponse(
  raw: { items?: RawTranslateItem[] } | null | undefined,
  batch: DmTranslateInput[]
): TranslatedMessage[] {
  const items = Array.isArray(raw?.items) ? (raw as { items: RawTranslateItem[] }).items : [];
  const out: TranslatedMessage[] = [];
  const seen = new Set<number>();
  for (const item of items) {
    const idx = typeof item.index === "number" ? item.index : Number(item.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= batch.length || seen.has(idx)) continue;
    seen.add(idx);
    const src = batch[idx];
    const langRaw = typeof item.lang === "string" ? item.lang.trim().toLowerCase() : "";
    const trText = typeof item.trText === "string" ? item.trText.trim() : "";
    out.push({
      messageId: src.messageId,
      lang: langRaw ? langRaw.slice(0, 8) : "tr",
      trText: trText || src.text || "",
    });
  }
  return out;
}

function formatContextLines(messages: DmContextMessage[]): string {
  return messages
    .map((m) => `${m.fromMe ? "Ben" : "Karşı taraf"}: ${(m.trText || m.text || "").slice(0, 400)}`)
    .join("\n");
}

export function buildSummaryBlock(prevSummary: string, messages: DmContextMessage[]): string {
  const prev = prevSummary.trim()
    ? `Önceki özet:\n"${prevSummary.slice(0, 800)}"\n\n`
    : "";
  return (
    `${prev}Konuşmanın son mesajları:\n${formatContextLines(messages)}\n\n` +
    "Bu konuşmayı 2-3 cümlede özetle: karşı taraf kim/ne istiyor, hangi konu konuşuldu, " +
    'açık kalan ne var. Çıktı SADECE JSON: {"summary":".."}'
  );
}

/** @grafikcem DM sesi — birebir, daha sıcak ve özel (yorum yanıtından daha kişisel). */
export function buildDmDraftVoice(): string {
  const p = accountProfiles.grafikcem;
  return [
    `Sen @grafikcem hesabının sesisin. Persona: ${p.persona}.`,
    "Bir Instagram ÖZEL MESAJINA (DM) yanıt yazıyorsun — birebir, kişisel, sıcak ama profesyonel.",
    "Ton: gerçek bir insan gibi, yardımsever, içeriden; satış baskısı yok. Karşı tarafı dinlemiş gibi.",
    "Kısa tut: 1-3 cümle. Somut soruyu somut karşıla; uydurma bilgi/fiyat/söz verme.",
    "Emoji yok ya da en fazla bir tane. Klişe ('takipte kal') ve otomatik-bot dili YOK.",
  ].join(" ");
}

export function buildDmDraftUserBlock(input: {
  rollingSummary: string;
  recentMessages: DmContextMessage[];
  lang: string;
}): string {
  const foreign = Boolean(input.lang) && input.lang.toLowerCase() !== "tr";
  const summary = input.rollingSummary.trim()
    ? `Konuşma özeti: "${input.rollingSummary.slice(0, 800)}"\n\n`
    : "";
  const bilingual = foreign
    ? `Karşı taraf '${input.lang}' dilinde yazıyor. HER varyant için: textTr (Türkçe, senin okuman için) VE ` +
      `textOriginal ('${input.lang}' dilinde, GÖNDERİLECEK yanıt) üret.`
    : "Karşı taraf Türkçe yazıyor. Sadece textTr üret; textOriginal'i boş bırak.";
  return [
    summary + `Son mesajlar:\n${formatContextLines(input.recentMessages)}`,
    "",
    bilingual,
    "",
    'Çıktı SADECE JSON: {"variants":[{"textTr":"..","textOriginal":"..","tone":"samimi|net|yardımsever"}]} — TAM 2 varyant, farklı tonlarda.',
  ].join("\n");
}

type RawVariant = { textTr?: unknown; textOriginal?: unknown; tone?: unknown };

/** En çok 2 varyant; textTr zorunlu; textOriginal yalnız yabancı dilde. */
export function parseDmVariants(
  raw: { variants?: RawVariant[] } | null | undefined,
  lang: string
): DmDraftVariant[] {
  const foreign = Boolean(lang) && lang.toLowerCase() !== "tr";
  const arr = Array.isArray(raw?.variants) ? (raw as { variants: RawVariant[] }).variants : [];
  const out: DmDraftVariant[] = [];
  for (const v of arr) {
    if (out.length >= 2) break;
    const textTr = typeof v.textTr === "string" ? v.textTr.trim() : "";
    if (!textTr) continue;
    const orig = typeof v.textOriginal === "string" ? v.textOriginal.trim() : "";
    out.push({
      textTr,
      textOriginal: foreign && orig ? orig : null,
      tone: typeof v.tone === "string" && v.tone.trim() ? v.tone.trim().slice(0, 40) : "samimi",
    });
  }
  return out;
}

const TRANSLATE_SYSTEM =
  "Sen bir Instagram DM çevirmenisin. Sana numaralı gelen mesajlar verilir. HER mesaj için: " +
  "dilini tespit et (lang, ISO: tr/en/..) ve Türkçe'ye çevir (trText; zaten Türkçe ise aynen koru). " +
  'Çıktı SADECE JSON: {"items":[{"index":0,"lang":"..","trText":".."}]}';

// ── LLM çağrıları (çağıran serviste fail-open sarmalanır) ──────────────────────

async function logIgSpend(
  r: { actualCostUsd: number; model: string },
  purpose: string,
  refId?: string
): Promise<void> {
  await usageService.recordOpenRouter({
    estimatedCostUsd: r.actualCostUsd,
    model: r.model,
    meta: refId ? { purpose, refId } : { purpose },
    platform: "instagram",
  });
}

/** 10'arlı batch → tek cheapWriter çağrısı. Hata fırlatabilir; servis yutar. */
export async function translateInbound(batch: DmTranslateInput[]): Promise<TranslatedMessage[]> {
  if (batch.length === 0) return [];
  const r = await generateJson<{ items?: RawTranslateItem[] }>({
    role: "cheapWriter",
    temperature: 0.2,
    system: TRANSLATE_SYSTEM,
    user: buildDmTranslateBlock(batch),
  });
  await logIgSpend(r, IG_DM_READ_PURPOSE);
  return parseDmTranslateResponse(r.data, batch);
}

/** Konuşma özeti (bağlamı sınırlı tut). Hata fırlatabilir; servis yutar. */
export async function updateRollingSummary(
  prevSummary: string,
  messages: DmContextMessage[]
): Promise<string> {
  const r = await generateJson<{ summary?: unknown }>({
    role: "cheapWriter",
    temperature: 0.2,
    system: "Sen bir konuşma özetleyicisin. Kısa, nesnel, Türkçe özet üret.",
    user: buildSummaryBlock(prevSummary, messages),
  });
  await logIgSpend(r, IG_DM_READ_PURPOSE);
  return typeof r.data.summary === "string" ? r.data.summary.trim().slice(0, 1000) : prevSummary;
}

/** creativeWriter → 2 bağlam-farkında varyant. Hata fırlatabilir; servis yutar. */
export async function generateDmVariants(input: {
  rollingSummary: string;
  recentMessages: DmContextMessage[];
  lang: string;
  conversationId?: string;
}): Promise<DmDraftVariant[]> {
  const trace = createPipelineTrace({
    platform: "instagram",
    pipelineId: IG_DM_DRAFT_PURPOSE,
    subjectType: "ig_conversation",
    subjectId: input.conversationId ?? "",
  });
  const r = await trace.runStage<{ variants?: RawVariant[] }>({
    stage: "taslak",
    role: "creativeWriter",
    temperature: 0.8,
    system: buildDmDraftVoice(),
    user: buildDmDraftUserBlock(input),
  });
  await logIgSpend(r, IG_DM_DRAFT_PURPOSE);
  if (input.conversationId) await trace.flush(r.actualCostUsd);
  return parseDmVariants(r.data, input.lang);
}

/**
 * Tek mercekli GÜVENLİK skoru (100=güvenli, 0=söz/iddia/savunmacı risk yüksek).
 * DM hassas → taslak gösterilmeden ÖNCE HER ZAMAN çalışır. OPENROUTER yoksa/hata →
 * fail-open 70.
 */
export async function scoreDmRisk(
  replyText: string
): Promise<{ safety: number; usedLlm: boolean }> {
  if (!process.env.OPENROUTER_API_KEY) return { safety: 70, usedLlm: false };
  try {
    const r = await generateJson<{ score?: number }>({
      role: "cheapWriter",
      temperature: 0.2,
      system:
        "Sen tek mercekli bir içerik jürisisin. Bir Instagram DM yanıtının @grafikcem için ne kadar " +
        "GÜVENLİ olduğunu puanla (100=tamamen güvenli, 0=kesin söz/fiyat taahhüdü, asılsız iddia, " +
        'hakaret ya da kişisel veri ifşası riski yüksek). Çıktı SADECE JSON: {"score":<0-100>}',
      user: `Yanıt:\n"""${(replyText || "").slice(0, 500)}"""`,
    });
    await logIgSpend(r, IG_DM_DRAFT_PURPOSE);
    const s = typeof r.data.score === "number" ? r.data.score : 70;
    return { safety: Math.max(0, Math.min(100, s)), usedLlm: true };
  } catch {
    return { safety: 70, usedLlm: false };
  }
}
