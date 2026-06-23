import { prisma } from "@/lib/db/client";
import type { PublishedPost, PerformanceSnapshot } from "@/generated/prisma/client";

// Published Post + Performance Snapshot deposu (Faz CI-6). Published ≠ ContentItem.
// Snapshot window başına idempotent (1h/6h/24h/3d/7d/30d) — predicted↔actual kalibrasyonu.

export const performanceRepo = {
  createPublished(input: {
    accountId: string;
    platform?: string;
    content?: string;
    url?: string;
    externalId?: string;
    draftQueueItemId?: string;
    ideaId?: string;
  }): Promise<PublishedPost> {
    return prisma.publishedPost.create({
      data: {
        accountId: input.accountId,
        platform: input.platform ?? "x",
        content: input.content ?? "",
        url: input.url ?? "",
        externalId: input.externalId ?? null,
        draftQueueItemId: input.draftQueueItemId ?? null,
        ideaId: input.ideaId ?? null,
      },
    });
  },

  listPublished(accountId: string, limit = 50): Promise<PublishedPost[]> {
    return prisma.publishedPost.findMany({
      where: { accountId },
      orderBy: { publishedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
      include: { snapshots: { orderBy: { capturedAt: "desc" } } },
    });
  },

  /** Window başına bir snapshot (idempotent upsert). */
  upsertSnapshot(input: {
    publishedPostId: string;
    window: string;
    metrics: Record<string, unknown>;
    normalizedScore: number;
  }): Promise<PerformanceSnapshot> {
    const { publishedPostId, window, metrics, normalizedScore } = input;
    return prisma.performanceSnapshot.upsert({
      where: { publishedPostId_window: { publishedPostId, window } },
      create: {
        publishedPostId,
        window,
        metricsJson: JSON.stringify(metrics),
        normalizedScore,
      },
      update: {
        metricsJson: JSON.stringify(metrics),
        normalizedScore,
        capturedAt: new Date(),
      },
    });
  },

  getPublished(id: string): Promise<PublishedPost | null> {
    return prisma.publishedPost.findUnique({
      where: { id },
      include: { snapshots: true },
    });
  },
};
