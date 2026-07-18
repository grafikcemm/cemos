import { z } from "zod";
import { InspirationStructureAnalysisSchema } from "@/lib/inspiration/structuralAnalysis";

/**
 * BoardItem.metaJson — versioned, Zod-typed ilham zarfı (Phase 3C §A).
 *
 * Mevcut `metaJson` kolonu kullanılır (SIFIR migration). Her okuma parse +
 * validation'dan geçer; bilinmeyen/bozuk zarf fail-closed `null` döner (UI
 * "analiz yok / eski kayıt" olarak dürüst gösterir). `rawMetadataJson`
 * kontrolsüz analiz deposu DEĞİLDİR — analiz yalnız bu zarfta yaşar.
 */

export const INSPIRATION_META_SCHEMA_VERSION = "1";

export const InspirationFormatSchema = z.enum(["ig_reel", "ig_carousel", "ig_static", "unknown"]);
export type InspirationFormat = z.infer<typeof InspirationFormatSchema>;

/**
 * Manuel metrik: operatörün Instagram'da GÖRDÜĞÜ değerler. Meta API metriği
 * DEĞİLDİR ve baseline/outlier hesabına asla girmez (provenance alanı zorunlu).
 */
export const ManualMetricsSchema = z.object({
  provenance: z.literal("operator_observed"),
  observedAt: z.string().datetime(),
  likes: z.number().int().min(0).optional(),
  comments: z.number().int().min(0).optional(),
  views: z.number().int().min(0).optional(),
  saves: z.number().int().min(0).optional(),
  shares: z.number().int().min(0).optional(),
});
export type ManualMetrics = z.infer<typeof ManualMetricsSchema>;

export const InspirationMetaSchema = z.object({
  schemaVersion: z.literal(INSPIRATION_META_SCHEMA_VERSION),
  kind: z.literal("inspiration_capture"),
  format: InspirationFormatSchema,
  /** Operatör beyanı mı, URL'den mi türedi — dürüst kaynak etiketi. */
  formatSource: z.enum(["operator", "url_hint", "unknown"]),
  creatorHandle: z.string().max(60).default(""),
  /** Operatörün elle girdiği caption (kaynak: kullanıcı; API'den ÇEKİLMEDİ). */
  caption: z.string().max(10_000).default(""),
  transcript: z.string().max(20_000).default(""),
  manualMetrics: ManualMetricsSchema.nullable().default(null),
  capturedAt: z.string().datetime(),
  /** Deterministik yapısal analiz — versioned kalıcı çıktı (LLM DEĞİL). */
  analysis: InspirationStructureAnalysisSchema.nullable().default(null),
});
export type InspirationMeta = z.infer<typeof InspirationMetaSchema>;

/** Fail-closed parse: bozuk/yabancı/eski zarf → null (asla throw). */
export function parseInspirationMeta(metaJson: string | null | undefined): InspirationMeta | null {
  if (!metaJson) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(metaJson);
  } catch {
    return null;
  }
  const parsed = InspirationMetaSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function serializeInspirationMeta(meta: InspirationMeta): string {
  return JSON.stringify(InspirationMetaSchema.parse(meta));
}
