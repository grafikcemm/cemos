import { prisma } from "@/lib/db/client";
import type { FeedbackEvent } from "@/generated/prisma/client";
import {
  CreateFeedbackEventSchema,
  type CreateFeedbackEventInput,
} from "@/lib/growth-engine/types";

export const feedbackEventRepo = {
  create(raw: CreateFeedbackEventInput): Promise<FeedbackEvent> {
    const input = CreateFeedbackEventSchema.parse(raw);
    return prisma.feedbackEvent.create({
      data: {
        accountId: input.accountId,
        queueItemId: input.queueItemId,
        sourcePostId: input.sourcePostId,
        feedbackType: input.feedbackType,
        originalContent: input.originalContent,
        editedContent: input.editedContent ?? "",
        reason: input.reason ?? "",
        editDistance: input.editDistance ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        // undefined → DB default "x"
        platform: input.platform,
      },
    });
  },

  findByIdempotencyKey(idempotencyKey: string): Promise<FeedbackEvent | null> {
    return prisma.feedbackEvent.findUnique({ where: { idempotencyKey } });
  },

  /** PR-B resume-semantiği: reason JSON'una viralPatternId bağını yazmak için
   *  dar güncelleme (yeni kolon yok — migration yasağı; reason zaten JSON-merge
   *  taşıyıcısı, bkz. mergeReasonWithEditDistance). */
  updateReason(id: string, reason: string): Promise<FeedbackEvent> {
    return prisma.feedbackEvent.update({ where: { id }, data: { reason } });
  },

  listByAccount(accountId: string, limit = 100): Promise<FeedbackEvent[]> {
    return prisma.feedbackEvent.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  listByQueueItem(queueItemId: string): Promise<FeedbackEvent[]> {
    return prisma.feedbackEvent.findMany({
      where: { queueItemId },
      orderBy: { createdAt: "desc" },
    });
  },

  listBySourcePost(sourcePostId: string): Promise<FeedbackEvent[]> {
    return prisma.feedbackEvent.findMany({
      where: { sourcePostId },
      orderBy: { createdAt: "desc" },
    });
  },

  findById(id: string): Promise<FeedbackEvent | null> {
    return prisma.feedbackEvent.findUnique({ where: { id } });
  },
};
