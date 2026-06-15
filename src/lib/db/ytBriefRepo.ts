import { prisma } from "@/lib/db/client";
import type { YtBrief } from "@/generated/prisma/client";

export type UpdateYtBriefInput = Partial<{
  status: string;
  pillar: string;
  titleVariantsJson: string;
  thumbnailConcept: string;
  seoDescription: string;
  hookScript: string;
  fullScript: string;
  outlineJson: string;
  differentiationAnalysis: string;
  editingNotes: string;
  shootingNotes: string;
  transcriptUsed: boolean;
  sourceTranscript: string;
  modelUsed: string;
  costUsd: number;
  editedScript: string;
  feedbackNote: string;
}>;

export const ytBriefRepo = {
  create(input: { videoId: string; status?: string }): Promise<YtBrief> {
    return prisma.ytBrief.create({
      data: { videoId: input.videoId, status: input.status ?? "draft" },
    });
  },

  getById(id: string): Promise<YtBrief | null> {
    return prisma.ytBrief.findUnique({ where: { id } });
  },

  listByVideo(videoId: string): Promise<YtBrief[]> {
    return prisma.ytBrief.findMany({ where: { videoId }, orderBy: { createdAt: "desc" } });
  },

  update(id: string, data: UpdateYtBriefInput): Promise<YtBrief> {
    return prisma.ytBrief.update({ where: { id }, data });
  },

  /** Günlük brief üretim limiti için bugünkü (UTC) brief sayısı. */
  countCreatedToday(): Promise<number> {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return prisma.ytBrief.count({ where: { createdAt: { gte: start } } });
  },
};
