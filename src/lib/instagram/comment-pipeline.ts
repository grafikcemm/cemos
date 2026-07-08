/**
 * Instagram yorum LLM pipeline'ı (Faz D):
 *  - classifyBatch: 10'arlı yorum → tek cheapWriter çağrısı {lang,trText,intent,sentiment,priority}
 *  - generateReplyVariants: creativeWriter → 2-3 çift-dilli yanıt taslağı
 *  - scoreReplyRisk: tek 'risk' merceği (council kalibrasyonu) — eleştiri kapısı
 *
 * SAF yardımcılar (parseClassifyResponse, parseReplyVariants, build*Block, clamp/normalize)
 * I/O içermez → birim test edilebilir. LLM hataları çağıran serviste fail-open ele alınır.
 */

import { generateJsonGated } from "@/lib/ai/generateGated";
import { createPipelineTrace } from "@/lib/agents/pipeline-runner";
import { accountProfiles } from "@/lib/accounts";
import { IG_COMMENT_PURPOSE, IG_REPLY_PURPOSE } from "@/lib/instagram/igConfig";

export const IG_INTENTS = ["soru", "övgü", "eleştiri", "istek", "spam", "diğer"] as const;
export type IgIntent = (typeof IG_INTENTS)[number];

export const IG_SENTIMENTS = ["pozitif", "nötr", "negatif"] as const;
export type IgSentiment = (typeof IG_SENTIMENTS)[number];

export type ClassifyInputComment = { commentId: string; text: string; username?: string };

export type ClassifiedComment = {
  commentId: string;
  lang: string;
  trText: string;
  intent: IgIntent;
  intentConfidence: number;
  sentiment: IgSentiment;
  priority: number;
};

export type DraftVariant = { textTr: string; textOriginal: string | null; tone: string };

// ── SAF yardımcılar ──────────────────────────────────────────────────────────

export function clampPriority(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function normalizeIntent(s: unknown): IgIntent {
  const v = typeof s === "string" ? s.trim().toLocaleLowerCase("tr-TR") : "";
  return (IG_INTENTS as readonly string[]).includes(v) ? (v as IgIntent) : "diğer";
}

export function normalizeSentiment(s: unknown): IgSentiment {
  const v = typeof s === "string" ? s.trim().toLocaleLowerCase("tr-TR") : "";
  if (v.startsWith("poz")) return "pozitif";
  if (v.startsWith("neg")) return "negatif";
  return "nötr";
}

export function buildClassifyUserBlock(
  caption: string,
  comments: ClassifyInputComment[]
): string {
  const cap = (caption || "").slice(0, 300);
  const lines = comments.map(
    (c, i) => `${i}) @${c.username || "?"}: ${(c.text || "").slice(0, 500)}`
  );
  return `Gönderi başlığı: "${cap}"\n\nYorumlar:\n${lines.join("\n")}`;
}

type RawClassifyItem = {
  index?: unknown;
  lang?: unknown;
  trText?: unknown;
  intent?: unknown;
  intentConfidence?: unknown;
  sentiment?: unknown;
  priority?: unknown;
};

/**
 * index'i gönderilen batch sırasına göre commentId'ye eşler; priority'yi 0-100'e
 * kıskaçlar; intent/sentiment'ı bilinen kümelere normalize eder; gönderilmemiş ya
 * da tekrar index'i DÜŞÜRÜR. Parse edilemeyen yorum sonuçta yer almaz → çağıran
 * onu "new" bırakır (sonraki turda yeniden denenir).
 */
export function parseClassifyResponse(
  raw: { items?: RawClassifyItem[] } | null | undefined,
  batch: ClassifyInputComment[]
): ClassifiedComment[] {
  const items = Array.isArray(raw?.items) ? (raw as { items: RawClassifyItem[] }).items : [];
  const out: ClassifiedComment[] = [];
  const seen = new Set<number>();
  for (const item of items) {
    const idx = typeof item.index === "number" ? item.index : Number(item.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= batch.length || seen.has(idx)) continue;
    seen.add(idx);
    const src = batch[idx];
    const conf =
      typeof item.intentConfidence === "number"
        ? item.intentConfidence
        : Number(item.intentConfidence);
    const langRaw = typeof item.lang === "string" ? item.lang.trim().toLowerCase() : "";
    const trText = typeof item.trText === "string" ? item.trText.trim() : "";
    out.push({
      commentId: src.commentId,
      lang: langRaw ? langRaw.slice(0, 8) : "tr",
      trText: trText || src.text || "",
      intent: normalizeIntent(item.intent),
      intentConfidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0,
      sentiment: normalizeSentiment(item.sentiment),
      priority: clampPriority(item.priority),
    });
  }
  return out;
}

type RawVariant = { textTr?: unknown; textOriginal?: unknown; tone?: unknown };

/** En çok 3 varyant; textTr zorunlu; textOriginal yalnız yabancı dilde tutulur. */
export function parseReplyVariants(
  raw: { variants?: RawVariant[] } | null | undefined,
  lang: string
): DraftVariant[] {
  const foreign = Boolean(lang) && lang.toLowerCase() !== "tr";
  const arr = Array.isArray(raw?.variants) ? (raw as { variants: RawVariant[] }).variants : [];
  const out: DraftVariant[] = [];
  for (const v of arr) {
    if (out.length >= 3) break; // en çok 3 GEÇERLİ varyant (boş textTr slot harcamaz)
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

export function buildReplyUserBlock(input: {
  caption: string;
  commentText: string;
  trText: string;
  lang: string;
  intent: string;
}): string {
  const foreign = Boolean(input.lang) && input.lang.toLowerCase() !== "tr";
  const bilingual = foreign
    ? `Yorumcu '${input.lang}' dilinde yazmış. HER varyant için: textTr (Türkçe, senin okuman için) VE ` +
      `textOriginal ('${input.lang}' dilinde, GÖNDERİLECEK olan yanıt) üret.`
    : "Yorumcu Türkçe yazmış. Sadece textTr üret; textOriginal'i boş bırak.";
  return [
    `Gönderi başlığı: "${(input.caption || "").slice(0, 300)}"`,
    `Yorum (orijinal): "${(input.commentText || "").slice(0, 500)}"`,
    `Yorum (Türkçe): "${(input.trText || "").slice(0, 500)}"`,
    `Niyet: ${input.intent}`,
    "",
    bilingual,
    "",
    'Çıktı SADECE JSON: {"variants":[{"textTr":"..","textOriginal":"..","tone":"samimi|bilgilendirici|kısa-net"}]} — 2-3 varyant, farklı tonlarda.',
  ].join("\n");
}

/** @grafikcem sesi — IG yanıtı için yumuşatılmış (tweet değil, kısa insani yanıt). */
export function buildReplyVoice(): string {
  const p = accountProfiles.grafikcem;
  return [
    `Sen @grafikcem hesabının sesisin. Persona: ${p.persona}. Konsept: ${p.concept}.`,
    "Bir Instagram YORUMUNA kısa, insani, içeriden bir yanıt yazıyorsun (tweet değil).",
    "Ton: pratik, sıcak ama abartısız; bilen ama ukala değil. Yorumcuyu gerçekten dinlemiş gibi.",
    "Emoji kullanma ya da en fazla bir tane. Klişe ('takipte kal', 'bunu kaçırma') ve satış dili YOK.",
    "Yanıtlar kısa: 1-2 cümle. Yorumcunun sorusunu/yorumunu somut karşıla, uydurma bilgi verme.",
  ].join(" ");
}

const CLASSIFY_SYSTEM =
  "Sen bir Instagram yorum sınıflandırıcısısın. Sana gönderi başlığı + numaralı yorumlar verilir. " +
  "HER yorum için: dilini tespit et (lang, ISO: tr/en/..), Türkçe'ye çevir (trText; zaten Türkçe ise aynen), " +
  "niyetini sınıfla (intent ∈ {soru, övgü, eleştiri, istek, spam, diğer}), intentConfidence (0-1), " +
  "duygu (sentiment ∈ {pozitif, nötr, negatif}) ve 0-100 priority ver. " +
  "PRIORITY KURALI: soru ve istek yüksek (60-90, yanıt gerektirir); eleştiri orta-yüksek (50-80, itibar riski); " +
  "övgü düşük-orta (20-40); spam çok düşük (0-10). " +
  'Çıktı SADECE JSON: {"items":[{"index":0,"lang":"..","trText":"..","intent":"..","intentConfidence":0.0,"sentiment":"..","priority":0}]}';

// ── LLM çağrıları (çağıran serviste fail-open sarmalanır) ──────────────────────
// Dalga 2 (Sprint 2): tüm çağrılar generateJsonGated — bütçe kapısı + tam 1
// UsageLog gated içinde yazılır (eski logIgSpend çift-log olurdu, kaldırıldı).

/** 10'arlı batch → tek cheapWriter çağrısı. Hata fırlatabilir; servis yutar. */
export async function classifyBatch(
  caption: string,
  batch: ClassifyInputComment[],
  opts?: { mediaId?: string }
): Promise<ClassifiedComment[]> {
  if (batch.length === 0) return [];
  const r = await generateJsonGated<{ items?: RawClassifyItem[] }>({
    role: "cheapWriter",
    temperature: 0.2,
    system: CLASSIFY_SYSTEM,
    user: buildClassifyUserBlock(caption, batch),
    purpose: IG_COMMENT_PURPOSE,
    platform: "instagram",
    ...(opts?.mediaId ? { meta: { refId: opts.mediaId } } : {}),
  });
  return parseClassifyResponse(r.data, batch);
}

/** creativeWriter → 2-3 varyant. Hata fırlatabilir; servis yutar. */
export async function generateReplyVariants(input: {
  caption: string;
  commentText: string;
  trText: string;
  lang: string;
  intent: string;
  commentId?: string;
}): Promise<DraftVariant[]> {
  const trace = createPipelineTrace({
    platform: "instagram",
    pipelineId: IG_REPLY_PURPOSE,
    subjectType: "ig_comment",
    subjectId: input.commentId ?? "",
  });
  // runStage (gated) UsageLog'u kendisi yazar — burada ekstra log YOK.
  const r = await trace.runStage<{ variants?: RawVariant[] }>({
    stage: "yanit",
    role: "creativeWriter",
    temperature: 0.8,
    system: buildReplyVoice(),
    user: buildReplyUserBlock(input),
  });
  if (input.commentId) await trace.flush(r.actualCostUsd);
  return parseReplyVariants(r.data, input.lang);
}

/**
 * Tek mercekli GÜVENLİK skoru (council 'risk' merceği kalibrasyonu: 100=tamamen
 * güvenli, 0=hakaret/iftira/savunmacı kavga riski). eleştiri yanıtı kapısı.
 * OPENROUTER yoksa ya da hata → fail-open 70 (nötr-güvenli; gereksiz alarm yok).
 */
export async function scoreReplyRisk(
  replyText: string
): Promise<{ safety: number; usedLlm: boolean }> {
  if (!process.env.OPENROUTER_API_KEY) return { safety: 70, usedLlm: false };
  try {
    const r = await generateJsonGated<{ score?: number }>({
      role: "cheapWriter",
      temperature: 0.2,
      system:
        "Sen tek mercekli bir içerik jürisisin. Bir Instagram yorum yanıtının @grafikcem için ne kadar " +
        "GÜVENLİ olduğunu puanla (100=tamamen güvenli, 0=hakaret/iftira/asılsız iddia/savunmacı kavga " +
        'riski yüksek). Çıktı SADECE JSON: {"score":<0-100>}',
      user: `Yanıt:\n"""${(replyText || "").slice(0, 500)}"""`,
      purpose: IG_REPLY_PURPOSE,
      platform: "instagram",
    });
    const s = typeof r.data.score === "number" ? r.data.score : 70;
    return { safety: Math.max(0, Math.min(100, s)), usedLlm: true };
  } catch {
    return { safety: 70, usedLlm: false };
  }
}
