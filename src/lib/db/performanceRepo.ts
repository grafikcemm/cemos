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

  /** draftQueueItemId → PublishedPost (batch, provenance join for snapshot ingestion). */
  async findByDraftQueueItemIds(itemIds: string[]): Promise<Map<string, PublishedPost>> {
    const map = new Map<string, PublishedPost>();
    if (itemIds.length === 0) return map;
    const rows = await prisma.publishedPost.findMany({
      where: { draftQueueItemId: { in: itemIds } },
    });
    for (const row of rows) {
      if (row.draftQueueItemId) map.set(row.draftQueueItemId, row);
    }
    return map;
  },

  /**
   * Published posts in a window with their single most-mature snapshot score,
   * keyed by draftQueueItemId. Feeds patternPromotionService's lessonGate arrays
   * — only posts that HAVE a snapshot (i.e. real measured performance) appear.
   */
  async latestScoreByDraftItem(
    accountId: string,
    opts: { platform?: string; since: Date } = { since: new Date(0) }
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const rows = await prisma.publishedPost.findMany({
      where: {
        accountId,
        platform: opts.platform ?? "x",
        publishedAt: { gte: opts.since },
        draftQueueItemId: { not: null },
      },
      include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
    });
    for (const row of rows) {
      const snap = row.snapshots[0];
      if (row.draftQueueItemId && snap) map.set(row.draftQueueItemId, snap.normalizedScore);
    }
    return map;
  },
};
