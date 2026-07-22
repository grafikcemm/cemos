import { prisma } from "@/lib/db/client";
import type { Creator, CreatorBaseline, ContentOutlierScore } from "@/generated/prisma/client";

// Creator + baseline + outlier-score deposu. Outlier domeni: creator-relative
// medyan (baseline) ve içerik-başına çarpan (outlier score). Idempotent upsert'ler.

export const creatorRepo = {
  /** platform+handle ile tekil creator (idempotent). */
  upsert(input: {
    platform: string;
    handle: string;
    displayName?: string;
    followers?: number;
  }): Promise<Creator> {
    const { platform, handle, ...rest } = input;
    return prisma.creator.upsert({
      where: { platform_handle: { platform, handle } },
      create: { platform, handle, ...rest },
      update: rest,
    });
  },

  getByHandle(platform: string, handle: string): Promise<Creator | null> {
    return prisma.creator.findUnique({ where: { platform_handle: { platform, handle } } });
  },

  /** creator+format+metric başına bir baseline (idempotent; window kapanışında tazelenir). */
  upsertBaseline(input: {
    creatorId: string;
    platform: string;
    format: string;
    metric: string;
    medianValue: number;
    sampleSize: number;
    windowDays?: number;
  }): Promise<CreatorBaseline> {
    const { creatorId, format, metric, ...rest } = input;
    return prisma.creatorBaseline.upsert({
      where: { creatorId_format_metric: { creatorId, format, metric } },
      create: { creatorId, format, metric, ...rest },
      update: { ...rest, computedAt: new Date() },
    });
  },

  getBaseline(creatorId: string, format: string, metric: string): Promise<CreatorBaseline | null> {
    return prisma.creatorBaseline.findUnique({
      where: { creatorId_format_metric: { creatorId, format, metric } },
    });
  },

  /** content item başına bir outlier score (metric başına idempotent). */
  upsertOutlierScore(input: {
    contentItemId: string;
    metric: string;
    metricValue: number;
    baselineMedian: number;
    multiplier: number;
    sampleSize: number;
    insufficient: boolean;
    explanation: Record<string, unknown>;
  }): Promise<ContentOutlierScore> {
    const { contentItemId, metric, explanation, ...rest } = input;
    return prisma.contentOutlierScore.upsert({
      where: { contentItemId_metric: { contentItemId, metric } },
      create: { contentItemId, metric, explanationJson: JSON.stringify(explanation), ...rest },
      update: { ...rest, explanationJson: JSON.stringify(explanation), computedAt: new Date() },
    });
  },

  listTopOutliers(limit = 50): Promise<ContentOutlierScore[]> {
    return prisma.contentOutlierScore.findMany({
      where: { insufficient: false },
      orderBy: { multiplier: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
      include: { contentItem: true },
    });
  },
};
