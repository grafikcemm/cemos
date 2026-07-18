import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  INSPIRATION_META_SCHEMA_VERSION,
  InspirationMetaSchema,
  parseInspirationMeta,
  serializeInspirationMeta,
  type InspirationMeta,
} from "@/lib/inspiration/inspirationMeta";
import {
  analyzeInspirationStructure,
  type InspirationStructureAnalysis,
} from "@/lib/inspiration/structuralAnalysis";

/**
 * Deterministik analiz persist katmanı (Phase 3C §B).
 *
 * ÜCRETSİZDİR: LLM yok, ağ yok, ücretli çağrı yok — yalnız saf analiz + DB
 * yazımı. Sonuç `analysisStatus="analyzed"` bayrağında KAYBOLMAZ: versioned
 * çıktı BoardItem.metaJson zarfında kalıcı tutulur. Sahiplik fail-closed:
 * yalnız aktif hesabın panosundaki kayıt analiz edilir.
 */

export const AnalyzeInspirationSchema = z.object({
  accountId: z.string().min(1).max(64),
  boardItemId: z.string().min(1).max(64),
});

export type AnalyzeFailureCode = "not_found" | "board_not_owned" | "no_content";

export type AnalyzeResult =
  | { ok: true; analysis: InspirationStructureAnalysis; meta: InspirationMeta }
  | { ok: false; code: AnalyzeFailureCode; message: string };

/** Zarfsız (legacy) kayıtlar için mevcut ContentItem verisinden dürüst zarf kur. */
function bootstrapMeta(content: {
  format: string;
  body: string;
  transcript: string;
  author: string;
}): InspirationMeta {
  const format =
    content.format === "ig_reel" || content.format === "ig_carousel" || content.format === "ig_static"
      ? content.format
      : "unknown";
  return InspirationMetaSchema.parse({
    schemaVersion: INSPIRATION_META_SCHEMA_VERSION,
    kind: "inspiration_capture",
    format,
    formatSource: format === "unknown" ? "unknown" : "url_hint",
    creatorHandle: content.author,
    caption: content.body.slice(0, 10_000),
    transcript: content.transcript.slice(0, 20_000),
    manualMetrics: null,
    capturedAt: new Date().toISOString(),
    analysis: null,
  });
}

export async function analyzeInspirationItem(rawInput: unknown): Promise<AnalyzeResult> {
  const input = AnalyzeInspirationSchema.parse(rawInput);

  const item = await prisma.boardItem.findUnique({
    where: { id: input.boardItemId },
    include: { board: true, contentItem: true },
  });
  if (!item) return { ok: false, code: "not_found", message: "Kayıt bulunamadı." };
  if (!item.board || item.board.accountId !== input.accountId) {
    return { ok: false, code: "board_not_owned", message: "Bu kayıt aktif hesabın panosunda değil." };
  }
  if (!item.contentItem) {
    return {
      ok: false,
      code: "no_content",
      message: "Bu kayıt içerik havuzuna bağlı değil (not) — yapısal analiz için URL ile kaydet.",
    };
  }

  const content = item.contentItem;
  const meta = parseInspirationMeta(item.metaJson) ?? bootstrapMeta(content);

  // Provider outlier kanıtı varsa dürüst özetle analize taşınır (yoksa null).
  const score = await prisma.contentOutlierScore.findUnique({
    where: { contentItemId_metric: { contentItemId: content.id, metric: "engagement" } },
  });

  let mediaUrls: unknown[] = [];
  try {
    const parsed = JSON.parse(content.mediaUrlsJson);
    if (Array.isArray(parsed)) mediaUrls = parsed;
  } catch {
    mediaUrls = [];
  }

  const analysis = analyzeInspirationStructure({
    format: meta.format,
    caption: meta.caption || content.body.slice(0, 10_000),
    transcript: meta.transcript || content.transcript.slice(0, 20_000),
    userNote: item.note,
    creatorHandle: meta.creatorHandle || content.author,
    hasMediaUrl: mediaUrls.length > 0,
    manualMetricsPresent: meta.manualMetrics !== null,
    providerOutlier: score
      ? {
          multiplier: score.insufficient ? null : score.multiplier,
          insufficient: score.insufficient,
          sampleSize: score.sampleSize,
          baselineMedian: score.baselineMedian,
          computedAt: score.computedAt.toISOString(),
        }
      : null,
    analyzedAt: new Date().toISOString(),
  });

  const nextMeta = InspirationMetaSchema.parse({ ...meta, analysis });

  await prisma.$transaction(async (tx) => {
    await tx.boardItem.update({
      where: { id: item.id },
      data: { metaJson: serializeInspirationMeta(nextMeta) },
    });
    await tx.contentItem.update({
      where: { id: content.id },
      data: { analysisStatus: "analyzed" },
    });
  });

  return { ok: true, analysis, meta: nextMeta };
}
