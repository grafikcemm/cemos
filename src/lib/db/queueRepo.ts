import { prisma } from "@/lib/db/client";
import type { QueueItem } from "@/generated/prisma/client";

export type CreateQueueItemInput = {
  accountId: string;
  sourcePostId?: string;
  content: string;
  draftType?: string;
  mode?: string;
  /** Kalite kapısı: yüksek-şiddet leak / cap-altı TR doğallık → "needs_edit". */
  status?: string;
  estimatedCostUsd?: number;
  usedMock?: boolean;
  scores?: string;
  lintReport?: string;
  candidatesJson?: string;
  /** Phase 2D: thread'in canonical publication payload'ı (serializeThreadSegments JSON). */
  threadSegments?: string;
  lastError?: string;
  approvedAt?: Date;
  // News→draft bridge + visual content provenance.
  newsItemId?: string;
  imageUrl?: string;
  generatedImageUrl?: string;
};

export type UpdateQueueItemInput = Partial<
  Pick<
    QueueItem,
    | "editedContent"
    | "status"
    | "scheduledAt"
    | "publishedAt"
    | "estimatedCostUsd"
    | "lintReport"
    | "lastError"
    | "approvedAt"
    | "scores"
    | "generatedImageUrl"
    | "threadSegments"
  >
>;

export const queueRepo = {
  create(data: CreateQueueItemInput): Promise<QueueItem> {
    return prisma.queueItem.create({ data });
  },

  listByAccount(accountId: string, limit = 100): Promise<QueueItem[]> {
    return prisma.queueItem.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  findById(id: string): Promise<QueueItem | null> {
    return prisma.queueItem.findUnique({ where: { id } });
  },

  update(id: string, data: UpdateQueueItemInput): Promise<QueueItem> {
    return prisma.queueItem.update({ where: { id }, data });
  },

  delete(id: string): Promise<QueueItem> {
    return prisma.queueItem.delete({ where: { id } });
  },
};
