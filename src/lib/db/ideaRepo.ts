import { prisma } from "@/lib/db/client";
import type { Idea, IdeaSource } from "@/generated/prisma/client";

// Idea deposu. Idea = kaynak+voice'a bağlı özgünleştirilmiş fikir (Draft'tan ÖNCE).
// QueueItem = Draft olarak korunur. IdeaSource provenance: bir idea çoklu kanonik
// ContentItem alıntılar (Eden "apply structure" çıktısı önce Idea üretir, draft değil).

export const ideaRepo = {
  create(input: {
    accountId: string;
    title?: string;
    angle?: string;
    hook?: string;
    bodyOutline?: string;
    platform?: string;
    format?: string;
    objective?: string;
    whyNow?: string;
    voiceProfileId?: string | null;
    scores?: Record<string, unknown>;
    transformationType?: string;
    promptVersion?: string;
    modelUsed?: string;
    costUsd?: number;
    sourceContentItemIds?: string[];
  }): Promise<Idea> {
    const sourceIds = input.sourceContentItemIds ?? [];
    return prisma.idea.create({
      data: {
        accountId: input.accountId,
        title: input.title ?? "",
        angle: input.angle ?? "",
        hook: input.hook ?? "",
        bodyOutline: input.bodyOutline ?? "",
        platform: input.platform ?? "x",
        format: input.format ?? "",
        objective: input.objective ?? "",
        whyNow: input.whyNow ?? "",
        voiceProfileId: input.voiceProfileId ?? null,
        scoresJson: JSON.stringify(input.scores ?? {}),
        transformationType: input.transformationType ?? null,
        promptVersion: input.promptVersion ?? "",
        modelUsed: input.modelUsed ?? "",
        costUsd: input.costUsd ?? 0,
        sources: {
          create: sourceIds.map((contentItemId, i) => ({
            contentItemId,
            role: i === 0 ? "primary" : "supporting",
          })),
        },
      },
    });
  },

  getById(id: string) {
    return prisma.idea.findUnique({
      where: { id },
      include: { sources: { include: { contentItem: true } } },
    });
  },

  list(filters: { accountId?: string; status?: string; platform?: string; limit?: number }): Promise<Idea[]> {
    const where: Record<string, unknown> = {};
    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.status) where.status = filters.status;
    if (filters.platform) where.platform = filters.platform;
    return prisma.idea.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(filters.limit ?? 50, 1), 200),
    });
  },

  setStatus(id: string, status: string): Promise<Idea> {
    return prisma.idea.update({ where: { id }, data: { status } });
  },

  addSource(ideaId: string, contentItemId: string, role = "supporting"): Promise<IdeaSource> {
    return prisma.ideaSource.upsert({
      where: { ideaId_contentItemId: { ideaId, contentItemId } },
      create: { ideaId, contentItemId, role },
      update: { role },
    });
  },
};
