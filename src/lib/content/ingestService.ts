import type { ContentItem } from "@/generated/prisma/client";
import { contentItemRepo } from "@/lib/db/contentItemRepo";
import { creatorRepo } from "@/lib/db/creatorRepo";
import {
  engagementOf,
  type CanonicalMetrics,
  type NormalizedContentInput,
} from "@/lib/content/normalizer";
import { computeBaseline, computeOutlier } from "@/lib/content/outlier";

// Content ingest orchestrator (Capture→Understand çekirdeği).
// normalize → persist (idempotent) → creator-link → (opsiyonel) baseline+outlier.
// Mevcut ingestion'lar (news/X/IG/YT/repo) bunu ÇAĞIRABİLİR; hiçbiri zorunlu değil
// (additive). Asla mevcut tabloları değiştirmez — yalnız kanonik kopya yazar.

const ENGAGEMENT = "engagement";

function parseMetrics(metricsJson: string): CanonicalMetrics {
  try {
    const parsed = JSON.parse(metricsJson);
    return parsed && typeof parsed === "object" ? (parsed as CanonicalMetrics) : {};
  } catch {
    return {};
  }
}

/** Kanonik içerik birimini yazar (idempotent) ve varsa creator'ı bağlar. */
export async function ingestContent(input: NormalizedContentInput): Promise<ContentItem> {
  const item = await contentItemRepo.upsertNormalized(input);

  // Creator linkage: yazar/handle varsa platform+handle ile tekil creator bağla.
  const handle = (input.author ?? "").trim();
  if (handle && !item.creatorId) {
    const creator = await creatorRepo.upsert({ platform: input.platform, handle });
    return contentItemRepo.setCreator(item.id, creator.id);
  }
  return item;
}

/**
 * Creator+format baseline'ını yeniden hesaplar: aynı creator+format'taki son
 * windowDays içeriklerinin engagement medyanı. Eden outlier paydası.
 */
export async function recomputeBaseline(
  creatorId: string,
  platform: string,
  format: string,
  metric: string = ENGAGEMENT,
  windowDays = 30,
): Promise<{ medianValue: number; sampleSize: number }> {
  // Baseline'a YALNIZ provider kaynaklı içerik girer — manuel capture'ların
  // operatör-gözlemi metrikleri medyanı kirletemez (Phase 3C provenance kuralı).
  const items = await contentItemRepo.list({ creatorId, format, sourceType: "external", limit: 200 });
  const values = items.map((it) => engagementOf(parseMetrics(it.metricsJson), platform));
  const { medianValue, sampleSize } = computeBaseline(values);
  await creatorRepo.upsertBaseline({
    creatorId,
    platform,
    format,
    metric,
    medianValue,
    sampleSize,
    windowDays,
  });
  return { medianValue, sampleSize };
}

/**
 * Tek içerik birimi için outlier skorunu hesaplar+yazar. Baseline yoksa veya
 * yetersizse insufficient=true (sahte skor üretilmez). Açıklanabilir.
 */
export async function scoreOutlier(
  contentItemId: string,
  metric: string = ENGAGEMENT,
): Promise<{ multiplier: number; insufficient: boolean }> {
  const item = await contentItemRepo.getById(contentItemId);
  if (!item) throw new Error(`ContentItem not found: ${contentItemId}`);

  const metricValue = engagementOf(parseMetrics(item.metricsJson), item.platform);

  let baselineMedian = 0;
  let sampleSize = 0;
  if (item.creatorId && item.format) {
    const baseline = await creatorRepo.getBaseline(item.creatorId, item.format, metric);
    if (baseline) {
      baselineMedian = baseline.medianValue;
      sampleSize = baseline.sampleSize;
    }
  }

  const result = computeOutlier(metricValue, baselineMedian, sampleSize);
  await creatorRepo.upsertOutlierScore({
    contentItemId,
    metric,
    metricValue,
    baselineMedian,
    multiplier: result.multiplier,
    sampleSize,
    insufficient: result.insufficient,
    explanation: { ...result.explanation, format: item.format, platform: item.platform },
  });
  return { multiplier: result.multiplier, insufficient: result.insufficient };
}
