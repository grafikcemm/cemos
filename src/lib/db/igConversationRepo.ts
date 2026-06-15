import { prisma } from "@/lib/db/client";
import type { IgConversation } from "@/generated/prisma/client";

export type UpsertIgConversationInput = {
  conversationId: string;
  participantId?: string;
  participantUsername?: string;
  lastMessageAt?: Date | null;
};

export const igConversationRepo = {
  /**
   * API'den gelen ham alanları upsert eder. rollingSummary KORUNUR — yeniden sync
   * özeti ezmez (igCommentRepo classify-koruma deseni). lastSyncedAt her sync set.
   */
  upsertByConversationId(input: UpsertIgConversationInput): Promise<IgConversation> {
    const { conversationId, participantId, participantUsername, lastMessageAt } = input;
    const apiFields = {
      ...(participantId !== undefined ? { participantId } : {}),
      ...(participantUsername !== undefined ? { participantUsername } : {}),
      ...(lastMessageAt !== undefined ? { lastMessageAt } : {}),
      lastSyncedAt: new Date(),
    };
    return prisma.igConversation.upsert({
      where: { conversationId },
      create: { conversationId, ...apiFields },
      update: apiFields,
    });
  },

  getByConversationId(conversationId: string): Promise<IgConversation | null> {
    return prisma.igConversation.findUnique({ where: { conversationId } });
  },

  /** Sekme listesi: en son mesajlaşılan üstte. */
  listRecent(limit = 20): Promise<IgConversation[]> {
    return prisma.igConversation.findMany({
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      take: Math.min(Math.max(limit, 1), 100),
    });
  },

  setRollingSummary(conversationId: string, rollingSummary: string): Promise<IgConversation> {
    return prisma.igConversation.update({
      where: { conversationId },
      data: { rollingSummary },
    });
  },
};
