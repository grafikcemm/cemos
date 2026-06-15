import { prisma } from "@/lib/db/client";
import type { IgMedia } from "@/generated/prisma/client";

export type UpsertIgMediaInput = {
  mediaId: string;
  caption?: string;
  mediaType?: string;
  permalink?: string;
  postedAt?: Date | null;
  likeCount?: number;
  commentCount?: number;
  lastSyncedAt?: Date | null;
};

export const igMediaRepo = {
  upsertByMediaId(input: UpsertIgMediaInput): Promise<IgMedia> {
    const { mediaId, ...rest } = input;
    return prisma.igMedia.upsert({
      where: { mediaId },
      create: { mediaId, ...rest },
      update: rest,
    });
  },

  getByMediaId(mediaId: string): Promise<IgMedia | null> {
    return prisma.igMedia.findUnique({ where: { mediaId } });
  },

  listRecent(limit = 25): Promise<IgMedia[]> {
    return prisma.igMedia.findMany({
      orderBy: { postedAt: { sort: "desc", nulls: "last" } },
      take: Math.min(Math.max(limit, 1), 100),
    });
  },

  /** Yorum akışını içerik-içerik gruplamak için: id listesine göre medya. */
  listByMediaIds(ids: string[]): Promise<IgMedia[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return prisma.igMedia.findMany({ where: { mediaId: { in: ids } } });
  },

  count(): Promise<number> {
    return prisma.igMedia.count();
  },
};
