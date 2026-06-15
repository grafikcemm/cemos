import { prisma } from "@/lib/db/client";
import type { IgComment } from "@/generated/prisma/client";

export type UpsertIgCommentInput = {
  commentId: string;
  mediaId: string;
  parentCommentId?: string | null;
  username?: string;
  text?: string;
  postedAt?: Date | null;
};

export type IgCommentFeedFilters = {
  status?: string;
  minPriority?: number;
  intent?: string;
  mediaId?: string;
  limit?: number;
  /** Bu kullanıcı adını hariç tut (kendi yanıtlarımızı gizle). */
  excludeUsername?: string;
};

export type UpdateIgCommentAnalysis = {
  trText: string;
  lang: string;
  intent: string;
  intentConfidence: number;
  sentiment: string;
  priority: number;
  status?: string;
  analysisJson?: string;
};

type CommentWhere = {
  status?: string;
  priority?: { gte: number };
  intent?: string;
  mediaId?: string;
  username?: { not: string };
};

export const igCommentRepo = {
  upsertByCommentId(input: UpsertIgCommentInput): Promise<IgComment> {
    const { commentId, mediaId, parentCommentId, username, text, postedAt } = input;
    // Sadece API'den gelen ham alanlar update edilir — classify çıktısı
    // (trText/intent/priority/...) ve status KORUNUR; yeniden sync analizi ezmez.
    const apiFields = {
      ...(parentCommentId !== undefined ? { parentCommentId } : {}),
      ...(username !== undefined ? { username } : {}),
      ...(text !== undefined ? { text } : {}),
      ...(postedAt !== undefined ? { postedAt } : {}),
    };
    return prisma.igComment.upsert({
      where: { commentId },
      create: { commentId, mediaId, ...apiFields },
      update: apiFields,
    });
  },

  getByCommentId(commentId: string): Promise<IgComment | null> {
    return prisma.igComment.findUnique({ where: { commentId } });
  },

  /** Sınıflandırılmamış yorumlar (classify kuyruğu). */
  listNew(limit = 200): Promise<IgComment[]> {
    return prisma.igComment.findMany({
      where: { status: "new" },
      orderBy: { createdAt: "asc" },
      take: Math.min(Math.max(limit, 1), 500),
    });
  },

  /** Sekme akışı: önceliğe göre azalan, filtreli. */
  listFeed(filters: IgCommentFeedFilters): Promise<IgComment[]> {
    const where: CommentWhere = {};
    if (filters.status && filters.status !== "all") where.status = filters.status;
    if (typeof filters.minPriority === "number") where.priority = { gte: filters.minPriority };
    if (filters.intent && filters.intent !== "all") where.intent = filters.intent;
    if (filters.mediaId) where.mediaId = filters.mediaId;
    if (filters.excludeUsername) where.username = { not: filters.excludeUsername };
    return prisma.igComment.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: Math.min(Math.max(filters.limit ?? 60, 1), 200),
    });
  },

  /** Toplu taslak için: öncelik eşiği üstü, henüz taslaklanmamış. */
  listForBulkDrafts(minPriority: number, limit = 30): Promise<IgComment[]> {
    return prisma.igComment.findMany({
      where: { priority: { gte: minPriority }, status: "analyzed" },
      orderBy: { priority: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
    });
  },

  setStatus(commentId: string, status: string): Promise<IgComment> {
    return prisma.igComment.update({ where: { commentId }, data: { status } });
  },

  updateAnalysis(commentId: string, data: UpdateIgCommentAnalysis): Promise<IgComment> {
    return prisma.igComment.update({
      where: { commentId },
      data: {
        trText: data.trText,
        lang: data.lang,
        intent: data.intent,
        intentConfidence: data.intentConfidence,
        sentiment: data.sentiment,
        priority: data.priority,
        status: data.status ?? "analyzed",
        analysisJson: data.analysisJson ?? "{}",
      },
    });
  },
};
