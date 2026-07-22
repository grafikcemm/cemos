import { prisma } from "@/lib/db/client";
import type { ContentItem } from "@/generated/prisma/client";
import type { NormalizedContentInput } from "@/lib/content/normalizer";

// Kanonik ContentItem deposu. Idempotent upsert: (platform, externalId) dedup —
// aynı kaynak iki kez normalize edilince yeni satır DEĞİL, mevcut güncellenir.
// JSON alanları (mediaUrls/metrics/raw) String kolonlarda saklanır (proje deseni).

type ContentItemWritable = {
  platform: string;
  externalId: string;
  canonicalUrl: string | null;
  sourceType: string;
  originTable: string | null;
  originId: string | null;
  creatorId: string | null;
  contentType: string;
  format: string;
  title: string;
  body: string;
  transcript: string;
  language: string | null;
  author: string;
  mediaUrlsJson: string;
  metricsJson: string;
  rawMetadataJson: string;
  publishedAt: Date | null;
};

function serialize(input: NormalizedContentInput): ContentItemWritable {
  return {
    platform: input.platform,
    externalId: input.externalId,
    canonicalUrl: input.canonicalUrl ?? null,
    sourceType: input.sourceType ?? "external",
    originTable: input.originTable ?? null,
    originId: input.originId ?? null,
    creatorId: null,
    contentType: input.contentType ?? "post",
    format: input.format ?? "",
    title: input.title ?? "",
    body: input.body ?? "",
    transcript: input.transcript ?? "",
    language: input.language ?? null,
    author: input.author ?? "",
    mediaUrlsJson: JSON.stringify(input.mediaUrls ?? []),
    metricsJson: JSON.stringify(input.metrics ?? {}),
    rawMetadataJson: JSON.stringify(input.rawMetadata ?? {}),
    publishedAt: input.publishedAt ?? null,
  };
}

export type ContentItemFilters = {
  platform?: string;
  format?: string;
  analysisStatus?: string;
  creatorId?: string;
  /** external | own | manual — baseline gibi provider-only akışlar filtreler. */
  sourceType?: string;
  limit?: number;
};

export const contentItemRepo = {
  /** Idempotent normalize→persist. firstSeenAt yalnız create'te; mutable alanlar update'te tazelenir. */
  upsertNormalized(input: NormalizedContentInput): Promise<ContentItem> {
    const data = serialize(input);
    return prisma.contentItem.upsert({
      where: { platform_externalId: { platform: data.platform, externalId: data.externalId } },
      create: data,
      update: {
        // Sabit kimlik alanları (platform/externalId/originTable/originId) DEĞİŞMEZ.
        canonicalUrl: data.canonicalUrl,
        contentType: data.contentType,
        format: data.format,
        title: data.title,
        body: data.body,
        transcript: data.transcript,
        language: data.language,
        author: data.author,
        mediaUrlsJson: data.mediaUrlsJson,
        metricsJson: data.metricsJson,
        rawMetadataJson: data.rawMetadataJson,
        publishedAt: data.publishedAt,
      },
    });
  },

  getById(id: string): Promise<ContentItem | null> {
    return prisma.contentItem.findUnique({ where: { id } });
  },

  getByExternal(platform: string, externalId: string): Promise<ContentItem | null> {
    return prisma.contentItem.findUnique({
      where: { platform_externalId: { platform, externalId } },
    });
  },

  list(filters: ContentItemFilters): Promise<ContentItem[]> {
    const where: Record<string, unknown> = {};
    if (filters.platform) where.platform = filters.platform;
    if (filters.format) where.format = filters.format;
    if (filters.analysisStatus) where.analysisStatus = filters.analysisStatus;
    if (filters.creatorId) where.creatorId = filters.creatorId;
    if (filters.sourceType) where.sourceType = filters.sourceType;
    return prisma.contentItem.findMany({
      where,
      orderBy: { firstSeenAt: "desc" },
      take: Math.min(Math.max(filters.limit ?? 50, 1), 200),
    });
  },

  setCreator(id: string, creatorId: string): Promise<ContentItem> {
    return prisma.contentItem.update({ where: { id }, data: { creatorId } });
  },

  setAnalysisStatus(id: string, analysisStatus: string): Promise<ContentItem> {
    return prisma.contentItem.update({ where: { id }, data: { analysisStatus } });
  },
};
