import { prisma } from "@/lib/db/client";
import type { PublishLog } from "@/generated/prisma/client";

export type CreatePublishLogInput = {
  accountId: string;
  content: string;
  platform?: string;
  externalId?: string;
  scheduledAt?: Date | null;
  success?: boolean;
  errorMessage?: string | null;
  payload?: string;
};

export const publishLogRepo = {
  create(data: CreatePublishLogInput): Promise<PublishLog> {
    return prisma.publishLog.create({ data });
  },

  recentByAccount(accountId: string, days = 7): Promise<PublishLog[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return prisma.publishLog.findMany({
      where: { accountId, publishedAt: { gte: since } },
      orderBy: { publishedAt: "desc" },
      take: 200,
    });
  },
};
