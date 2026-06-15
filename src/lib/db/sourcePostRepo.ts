import { prisma } from "@/lib/db/client";
import type { SourcePost } from "@/generated/prisma/client";

export type UpsertSourcePostInput = {
  accountId: string;
  sourceId: string;
  tweetId: string;
  text: string;
  likeCount: number;
  retweetCount: number;
  viewCount: number;
  viralScore: number;
  url: string;
  publishedAt?: Date;
  opportunityScore?: number;
  /** JSON-encoded string array of media URLs captured from the tweet (default "[]"). */
  mediaUrls?: string;
};

export type UpsertExternalPostInput = {
  accountId: string;
  sourceId: string;
  sourceType: string;
  externalId: string;
  text: string;
  url: string;
  author?: string;
  lang?: string;
  engagementScore: number;
  sourceWeight: number;
  viralScore: number;
  opportunityScore?: number;
  publishedAt?: Date;
};

export const sourcePostRepo = {
  upsertByTweetId(data: UpsertSourcePostInput): Promise<SourcePost> {
    const { tweetId, ...rest } = data;
    return prisma.sourcePost.upsert({
      where: { tweetId },
      create: { tweetId, ...rest },
      update: {
        likeCount: rest.likeCount,
        retweetCount: rest.retweetCount,
        viewCount: rest.viewCount,
        viralScore: rest.viralScore,
        ...(rest.mediaUrls !== undefined ? { mediaUrls: rest.mediaUrls } : {}),
      },
    });
  },

  /**
   * Multi-source upsert. Uses a prefixed `<sourceType>:<externalId>` as the
   * universal dedup key (raw id for X to stay back-compatible).
   */
  upsertByExternalId(data: UpsertExternalPostInput): Promise<SourcePost> {
    const tweetId =
      data.sourceType === "x" ? data.externalId : `${data.sourceType}:${data.externalId}`;
    return prisma.sourcePost.upsert({
      where: { tweetId },
      create: {
        tweetId,
        accountId: data.accountId,
        sourceId: data.sourceId,
        sourceType: data.sourceType,
        externalId: data.externalId,
        text: data.text,
        url: data.url,
        author: data.author,
        lang: data.lang,
        engagementScore: data.engagementScore,
        sourceWeight: data.sourceWeight,
        viralScore: data.viralScore,
        opportunityScore: data.opportunityScore ?? 0,
        likeCount: 0,
        retweetCount: 0,
        viewCount: 0,
        publishedAt: data.publishedAt,
      },
      update: {
        engagementScore: data.engagementScore,
        viralScore: data.viralScore,
        ...(data.opportunityScore !== undefined
          ? { opportunityScore: data.opportunityScore }
          : {}),
      },
    });
  },

  listNewByAccount(
    accountId: string,
    limit = 50
  ): Promise<(SourcePost & { source: { handle: string } })[]> {
    return prisma.sourcePost.findMany({
      where: { accountId, status: "new" },
      orderBy: { viralScore: "desc" },
      take: limit,
      include: { source: { select: { handle: true } } },
    }) as Promise<(SourcePost & { source: { handle: string } })[]>;
  },

  findById(id: string): Promise<SourcePost | null> {
    return prisma.sourcePost.findUnique({ where: { id } });
  },

  markUsed(id: string): Promise<SourcePost> {
    return prisma.sourcePost.update({ where: { id }, data: { status: "used" } });
  },

  markRejected(id: string): Promise<SourcePost> {
    return prisma.sourcePost.update({ where: { id }, data: { status: "rejected" } });
  },

  markIgnored(id: string): Promise<SourcePost> {
    return prisma.sourcePost.update({ where: { id }, data: { status: "ignored" } });
  },

  markReviewed(id: string): Promise<SourcePost> {
    return prisma.sourcePost.update({ where: { id }, data: { status: "reviewed" } });
  },

  markBlocked(id: string): Promise<SourcePost> {
    return prisma.sourcePost.update({ where: { id }, data: { status: "blocked" } });
  },
};
