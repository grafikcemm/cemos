import { prisma } from "@/lib/db/client";
import type { IgMessage } from "@/generated/prisma/client";

export type UpsertIgMessageInput = {
  messageId: string;
  conversationId: string;
  fromMe?: boolean;
  text?: string;
  sentAt?: Date | null;
};

export const igMessageRepo = {
  /**
   * Ham mesaj alanları upsert. trText/lang/status KORUNUR — yeniden sync çeviriyi
   * ezmez (igCommentRepo deseni). create'te status default "new".
   */
  upsertByMessageId(input: UpsertIgMessageInput): Promise<IgMessage> {
    const { messageId, conversationId, fromMe, text, sentAt } = input;
    const apiFields = {
      ...(fromMe !== undefined ? { fromMe } : {}),
      ...(text !== undefined ? { text } : {}),
      ...(sentAt !== undefined ? { sentAt } : {}),
    };
    return prisma.igMessage.upsert({
      where: { messageId },
      create: { messageId, conversationId, ...apiFields },
      update: apiFields,
    });
  },

  /** Konuşma thread'i: kronolojik (eski → yeni). */
  listByConversation(conversationId: string, limit = 20): Promise<IgMessage[]> {
    return prisma.igMessage.findMany({
      where: { conversationId },
      orderBy: [{ sentAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: Math.min(Math.max(limit, 1), 100),
    });
  },

  /** Çevrilmemiş gelen mesajlar (translate kuyruğu). */
  listNewInbound(limit = 200): Promise<IgMessage[]> {
    return prisma.igMessage.findMany({
      where: { status: "new", fromMe: false },
      orderBy: { createdAt: "asc" },
      take: Math.min(Math.max(limit, 1), 500),
    });
  },

  updateTranslation(messageId: string, data: { trText: string; lang: string }): Promise<IgMessage> {
    return prisma.igMessage.update({
      where: { messageId },
      data: { trText: data.trText, lang: data.lang, status: "translated" },
    });
  },

  /** Morning kartı "Y DM" — bugün gelen, henüz çevrilmemiş mesaj sayısı. */
  countNewInbound(): Promise<number> {
    return prisma.igMessage.count({ where: { status: "new", fromMe: false } });
  },

  /** rollingSummary eşiği için: konuşmadaki toplam mesaj. */
  countInConversation(conversationId: string): Promise<number> {
    return prisma.igMessage.count({ where: { conversationId } });
  },
};
