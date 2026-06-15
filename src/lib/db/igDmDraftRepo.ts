import { prisma } from "@/lib/db/client";
import type { IgDmDraft } from "@/generated/prisma/client";

export type CreateIgDmDraftInput = {
  conversationId: string;
  messageId?: string | null;
  variant: number;
  textTr: string;
  textOriginal?: string | null;
  tone?: string;
  riskWarning?: boolean;
};

export type UpdateIgDmDraftInput = {
  status?: string;
  editedText?: string | null;
  sentAt?: Date | null;
};

export const igDmDraftRepo = {
  create(input: CreateIgDmDraftInput): Promise<IgDmDraft> {
    return prisma.igDmDraft.create({
      data: {
        conversationId: input.conversationId,
        messageId: input.messageId ?? null,
        variant: input.variant,
        textTr: input.textTr,
        textOriginal: input.textOriginal ?? null,
        tone: input.tone ?? "",
        riskWarning: input.riskWarning ?? false,
      },
    });
  },

  getById(id: string): Promise<IgDmDraft | null> {
    return prisma.igDmDraft.findUnique({ where: { id } });
  },

  listByConversation(conversationId: string): Promise<IgDmDraft[]> {
    return prisma.igDmDraft.findMany({
      where: { conversationId },
      orderBy: { variant: "asc" },
    });
  },

  /** Yeniden üretimde eski taslakları temizle (tek aktif set). */
  deleteByConversation(conversationId: string): Promise<{ count: number }> {
    return prisma.igDmDraft.deleteMany({ where: { conversationId } });
  },

  update(id: string, data: UpdateIgDmDraftInput): Promise<IgDmDraft> {
    return prisma.igDmDraft.update({ where: { id }, data });
  },

  /** DM listesi "taslak var" rozeti için: aktif taslağı olan konuşma id'leri. */
  async listConversationIdsWithDrafts(): Promise<string[]> {
    const rows = await prisma.igDmDraft.findMany({
      where: { status: { in: ["draft", "edited"] } },
      distinct: ["conversationId"],
      select: { conversationId: true },
    });
    return rows.map((r) => r.conversationId);
  },
};
