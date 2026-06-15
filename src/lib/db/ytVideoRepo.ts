import { prisma } from "@/lib/db/client";
import type { YtVideo } from "@/generated/prisma/client";

export type UpsertYtVideoInput = {
  videoId: string;
  channelId: string;
  title?: string;
  description?: string;
  publishedAt?: Date | null;
  durationSec?: number;
  isShort?: boolean;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  viewsPerDay?: number;
  outlierScore?: number;
  likeRatio?: number;
};

export type OpportunityFilters = {
  category?: string;
  minScore?: number;
  sinceDays?: number;
  isShort?: boolean;
  limit?: number;
};

type VideoWhere = {
  outlierScore?: { gte: number };
  publishedAt?: { gte: Date };
  isShort?: boolean;
  channel?: { category: string };
};

export const ytVideoRepo = {
  upsertByVideoId(input: UpsertYtVideoInput): Promise<YtVideo> {
    const { videoId, channelId, ...rest } = input;
    return prisma.ytVideo.upsert({
      where: { videoId },
      create: { videoId, channelId, ...rest },
      update: rest, // channelId update'te değişmez
    });
  },

  /** Medyan penceresi: kanalın sinceMs'ten yeni videoları. */
  recentByChannel(channelId: string, sinceMs: number): Promise<YtVideo[]> {
    return prisma.ytVideo.findMany({
      where: { channelId, publishedAt: { gte: new Date(sinceMs) } },
    });
  },

  getByVideoId(videoId: string): Promise<YtVideo | null> {
    return prisma.ytVideo.findUnique({ where: { videoId } });
  },

  setStatus(videoId: string, status: string): Promise<YtVideo> {
    return prisma.ytVideo.update({ where: { videoId }, data: { status } });
  },

  /** Fırsat akışı: outlierScore'a göre azalan, filtreli. */
  listOpportunities(filters: OpportunityFilters): Promise<YtVideo[]> {
    const where: VideoWhere = {};
    if (typeof filters.minScore === "number") where.outlierScore = { gte: filters.minScore };
    if (typeof filters.sinceDays === "number") {
      where.publishedAt = { gte: new Date(Date.now() - filters.sinceDays * 86_400_000) };
    }
    if (typeof filters.isShort === "boolean") where.isShort = filters.isShort;
    if (filters.category && filters.category !== "all") {
      where.channel = { category: filters.category };
    }
    return prisma.ytVideo.findMany({
      where,
      orderBy: { outlierScore: "desc" },
      take: Math.min(Math.max(filters.limit ?? 60, 1), 200),
      include: { channel: true },
    });
  },
};
