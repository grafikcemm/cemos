import { prisma } from "@/lib/db/client";
import type { IgReplyDraft } from "@/generated/prisma/client";

export type CreateIgReplyDraftInput = {
  commentId: string;
  variant: number;
  textTr: string;
  textOriginal?: string | null;
  tone?: string;
  riskWarning?: boolean;
};

export type UpdateIgReplyDraftInput = {
  status?: string;
  editedText?: string | null;
  sentAt?: Date | null;
};

export const igReplyDraftRepo = {
  create(input: CreateIgReplyDraftInput): Promise<IgReplyDraft> {
    return prisma.igReplyDraft.create({
      data: {
        commentId: input.commentId,
        variant: input.variant,
        textTr: input.textTr,
        textOriginal: input.textOriginal ?? null,
        tone: input.tone ?? "",
        riskWarning: input.riskWarning ?? false,
      },
    });
  },

  getById(id: string): Promise<IgReplyDraft | null> {
    return prisma.igReplyDraft.findUnique({ where: { id } });
  },

  listByComment(commentId: string): Promise<IgReplyDraft[]> {
    return prisma.igReplyDraft.findMany({
      where: { commentId },
      orderBy: { variant: "asc" },
    });
  },

  /** Yeniden üretimde eski taslakları temizle (tek aktif set kalsın). */
  deleteByComment(commentId: string): Promise<{ count: number }> {
    return prisma.igReplyDraft.deleteMany({ where: { commentId } });
  },

  update(id: string, data: UpdateIgReplyDraftInput): Promise<IgReplyDraft> {
    return prisma.igReplyDraft.update({ where: { id }, data });
  },
};
