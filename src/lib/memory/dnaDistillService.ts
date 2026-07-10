/**
 * CaptionDna / HashtagDna damıtma (FINAL-MEMORY-SPEC §4 — dalga-2 kapanışı).
 *
 * Deterministik, LLM'SİZ: yalnızca ölçülebilir yapısal istatistik yazar
 * (uzunluk aralığı, emoji politikası, açılış kancası dağılımı, satır düzeni,
 * hashtag frekansı). Kural/imza cümlesi ÜRETMEZ — identity kuralları
 * MemoryFact onay kuyruğunun işidir (write discipline korunur).
 *
 * Kaynaklar (bugün mevcut olan veri):
 *   - QueueItem (approved/published/manual_published) → editedContent ?? content
 *     (operatörün kendi sesiyle son hâli — en güçlü sinyal).
 *   - TrainingExample (label: positive|edited) → outputContent.
 *   - SeriesProfile.hashtagDnaJson (operatör tohumu) → seri-bazlı HashtagDna.
 *
 * Fail-closed: hesap başına < MIN_EVIDENCE örnek varsa CaptionDna YAZILMAZ.
 * Tetik: haftalık Pazartesi /api/cron/learn (yeni cron yok — D7).
 */

import { prisma } from "@/lib/db/client";

export const MIN_EVIDENCE = 10;
const CORPUS_LIMIT = 100;
const SPARSE_EMOJI_RATIO = 0.05;
const FREE_EMOJI_RATIO = 0.5;

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

export type OpeningHookType = "soru" | "rakam" | "senli_hitap" | "iddia";

/** İlk cümlenin kanca tipini sınıflandır (deterministik heuristik). */
export function classifyOpeningHook(text: string): OpeningHookType {
  const firstLine = text.trim().split("\n")[0] ?? "";
  const firstSentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? firstLine;
  if (/\?\s*$/.test(firstSentence)) return "soru";
  if (/^\d|%\d|\d+%|\d+ (kat|saat|dakika|adım|araç|yol)/iu.test(firstSentence)) return "rakam";
  if (/\b(sen|siz|senin|sizin)\b/iu.test(firstSentence)) return "senli_hitap";
  return "iddia";
}

export function computeLengthRange(texts: string[]): { min: number; max: number; median: number } {
  const lens = texts.map((t) => t.length).sort((a, b) => a - b);
  if (lens.length === 0) return { min: 0, max: 0, median: 0 };
  return {
    min: lens[0],
    max: lens[lens.length - 1],
    median: lens[Math.floor(lens.length / 2)],
  };
}

export function computeEmojiPolicy(texts: string[]): "none" | "sparse" | "free" {
  if (texts.length === 0) return "none";
  const withEmoji = texts.filter((t) => EMOJI_RE.test(t)).length / texts.length;
  if (withEmoji < SPARSE_EMOJI_RATIO) return "none";
  if (withEmoji < FREE_EMOJI_RATIO) return "sparse";
  return "free";
}

export function computeLineBreakPattern(texts: string[]): string {
  if (texts.length === 0) return "tek_blok";
  const avgParagraphs =
    texts.reduce((sum, t) => sum + t.trim().split(/\n{2,}/).length, 0) / texts.length;
  if (avgParagraphs < 1.5) return "tek_blok";
  if (avgParagraphs < 3) return "cift_paragraf";
  return "cok_paragraf";
}

/** Frekansa göre azalan sıralı benzersiz açılış kanca tipleri. */
export function rankOpeningHooks(texts: string[]): OpeningHookType[] {
  const freq = new Map<OpeningHookType, number>();
  for (const t of texts) {
    const hook = classifyOpeningHook(t);
    freq.set(hook, (freq.get(hook) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/** Korpustaki hashtag frekansları (küçük harfe indirger). */
export function extractHashtagFrequency(texts: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of texts) {
    for (const tag of t.match(HASHTAG_RE) ?? []) {
      const key = tag.toLowerCase();
      freq.set(key, (freq.get(key) ?? 0) + 1);
    }
  }
  return freq;
}

export type DnaDistillEntry = {
  handle: string;
  corpus: number;
  captionDna: "written" | "skipped_low_evidence" | "skipped_operator_owned";
  hashtagDna: "written" | "skipped_no_tags";
  seriesHashtagDna: number;
  error?: string;
};

async function corpusForAccount(accountId: string): Promise<string[]> {
  const [queue, training] = await Promise.all([
    prisma.queueItem.findMany({
      where: { accountId, status: { in: ["approved", "published", "manual_published"] } },
      orderBy: { createdAt: "desc" },
      take: CORPUS_LIMIT,
      select: { content: true, editedContent: true },
    }),
    prisma.trainingExample.findMany({
      where: { accountId, label: { in: ["positive", "edited"] } },
      orderBy: { createdAt: "desc" },
      take: CORPUS_LIMIT,
      select: { outputContent: true },
    }),
  ]);
  const texts = [
    ...queue.map((q) => (q.editedContent?.trim() ? q.editedContent : q.content)),
    ...training.map((t) => t.outputContent),
  ]
    .map((t) => t?.trim() ?? "")
    .filter((t) => t.length > 0);
  return texts.slice(0, CORPUS_LIMIT);
}

async function distillCaptionDna(
  handle: string,
  texts: string[]
): Promise<"written" | "skipped_low_evidence" | "skipped_operator_owned"> {
  if (texts.length < MIN_EVIDENCE) return "skipped_low_evidence";

  // Write discipline: operatör-tohumlu CaptionDna insan-sahiplidir — otomatik
  // istatistik onu EZEMEZ (identity > own_metric). Operatör satırı silmedikçe
  // damıtma yalnız gözlem olarak kalır.
  const owned = await prisma.captionDna.findUnique({ where: { accountHandle: handle } });
  if (owned?.provenance === "operator") return "skipped_operator_owned";

  const data = {
    openingHookTypes: JSON.stringify(rankOpeningHooks(texts)),
    lengthRange: JSON.stringify(computeLengthRange(texts)),
    emojiPolicy: computeEmojiPolicy(texts),
    lineBreakPattern: computeLineBreakPattern(texts),
    confidence: Math.min(1, texts.length / 50) * 0.9,
    evidenceCount: texts.length,
    provenance: "own_metric",
  };

  if (owned) {
    await prisma.captionDna.update({
      where: { accountHandle: handle },
      data: { ...data, version: owned.version + 1 },
    });
  } else {
    await prisma.captionDna.create({ data: { accountHandle: handle, ...data } });
  }
  return "written";
}

async function distillAccountHashtagDna(
  handle: string,
  texts: string[]
): Promise<"written" | "skipped_no_tags"> {
  const freq = extractHashtagFrequency(texts);
  if (freq.size === 0) return "skipped_no_tags";

  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const core = ranked.filter(([, n]) => n >= 3).slice(0, 8).map(([t]) => t);
  const rotating = ranked
    .filter(([t, n]) => n < 3 && !core.includes(t))
    .slice(0, 12)
    .map(([t]) => t);
  const perText = texts.map((t) => (t.match(HASHTAG_RE) ?? []).length).filter((n) => n > 0);
  const tagCountRange =
    perText.length > 0
      ? { min: Math.min(...perText), max: Math.max(...perText) }
      : { min: 0, max: 0 };

  const data = {
    coreTags: JSON.stringify(core),
    rotatingTags: JSON.stringify(rotating),
    tagCountRange: JSON.stringify(tagCountRange),
    confidence: Math.min(1, perText.length / 20) * 0.9,
    evidenceCount: perText.length,
  };

  // seriesId=null satırında Postgres NULL'ları unique saymaz — upsert yerine
  // findFirst+update ile tek hesap-seviyesi satır garanti edilir.
  const existing = await prisma.hashtagDna.findFirst({
    where: { accountHandle: handle, seriesId: null },
  });
  if (existing) {
    await prisma.hashtagDna.update({ where: { id: existing.id }, data });
  } else {
    await prisma.hashtagDna.create({ data: { accountHandle: handle, seriesId: null, ...data } });
  }
  return "written";
}

/** Operatör-tohumlu SeriesProfile.hashtagDnaJson → seri-bazlı HashtagDna satırı. */
async function distillSeriesHashtagDna(handle: string, accountId: string): Promise<number> {
  const series = await prisma.seriesProfile.findMany({
    where: { accountId, isActive: true },
    select: { id: true, hashtagDnaJson: true },
  });
  let written = 0;
  for (const s of series) {
    let tags: string[] = [];
    try {
      const parsed: unknown = JSON.parse(s.hashtagDnaJson);
      if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === "string");
    } catch {
      continue; // bozuk JSON → bu seri atlanır, damıtma sürer
    }
    if (tags.length === 0) continue;

    const data = {
      coreTags: JSON.stringify(tags.map((t) => t.toLowerCase())),
      tagCountRange: JSON.stringify({ min: tags.length, max: tags.length }),
      confidence: 0.8, // operatör tohumu — insan kaynaklı, yüksek güven
      evidenceCount: 1,
    };
    const existing = await prisma.hashtagDna.findFirst({
      where: { accountHandle: handle, seriesId: s.id },
    });
    if (existing) {
      await prisma.hashtagDna.update({ where: { id: existing.id }, data });
    } else {
      await prisma.hashtagDna.create({ data: { accountHandle: handle, seriesId: s.id, ...data } });
    }
    written++;
  }
  return written;
}

/**
 * Haftalık DNA damıtma girişi (learn cron, Pazartesi). Hesap başına fail-open:
 * bir hesabın hatası diğerini durdurmaz; cron'u asla bozmaz.
 */
export async function runDnaDistillation(opts: { handles: string[] }): Promise<DnaDistillEntry[]> {
  const out: DnaDistillEntry[] = [];
  for (const handle of opts.handles) {
    try {
      const account = await prisma.account.findUnique({
        where: { handle },
        select: { id: true },
      });
      if (!account) {
        out.push({
          handle,
          corpus: 0,
          captionDna: "skipped_low_evidence",
          hashtagDna: "skipped_no_tags",
          seriesHashtagDna: 0,
          error: "account_not_found",
        });
        continue;
      }
      const texts = await corpusForAccount(account.id);
      const captionDna = await distillCaptionDna(handle, texts);
      const hashtagDna = await distillAccountHashtagDna(handle, texts);
      const seriesHashtagDna = await distillSeriesHashtagDna(handle, account.id);
      out.push({ handle, corpus: texts.length, captionDna, hashtagDna, seriesHashtagDna });
    } catch (err) {
      out.push({
        handle,
        corpus: 0,
        captionDna: "skipped_low_evidence",
        hashtagDna: "skipped_no_tags",
        seriesHashtagDna: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}
