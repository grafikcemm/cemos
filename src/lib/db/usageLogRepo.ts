import { prisma } from "@/lib/db/client";
import type { UsageLog } from "@/generated/prisma/client";

export type CreateUsageLogInput = {
  accountId?: string;
  type: "scan" | "generation" | "openrouter" | "image" | "transcript";
  tweetCount?: number;
  estimatedCostUsd: number;
  date: string;
  provider?: string;
  model?: string;
  meta?: string;
  platform?: string;
};

export const usageLogRepo = {
  create(data: CreateUsageLogInput): Promise<UsageLog> {
    return prisma.usageLog.create({ data });
  },

  sumCostByDate(date: string): Promise<number> {
    return prisma.usageLog
      .aggregate({ where: { date }, _sum: { estimatedCostUsd: true } })
      .then((r) => r._sum.estimatedCostUsd ?? 0);
  },

  sumCostByMonth(yearMonth: string): Promise<number> {
    return prisma.usageLog
      .aggregate({
        where: { date: { startsWith: yearMonth } },
        _sum: { estimatedCostUsd: true },
      })
      .then((r) => r._sum.estimatedCostUsd ?? 0);
  },

  /** Monthly spend for a single provider (e.g. "fal") — drives the separate fal image budget. */
  sumCostByProviderMonth(yearMonth: string, provider: string): Promise<number> {
    return prisma.usageLog
      .aggregate({
        where: { date: { startsWith: yearMonth }, provider },
        _sum: { estimatedCostUsd: true },
      })
      .then((r) => r._sum.estimatedCostUsd ?? 0);
  },

  /** Includes provider-tagged rows plus pre-migration generation/openrouter rows. */
  sumOpenRouterCostByMonth(yearMonth: string): Promise<number> {
    return prisma.usageLog
      .aggregate({
        where: {
          date: { startsWith: yearMonth },
          OR: [
            { provider: "openrouter" },
            { type: "openrouter" },
            { type: "generation" },
          ],
        },
        _sum: { estimatedCostUsd: true },
      })
      .then((r) => r._sum.estimatedCostUsd ?? 0);
  },

  /**
   * Bir aydaki, meta'sında purpose taşıyan satırlar. contains kaba SQL ön-filtresi:
   * meta her zaman JSON.stringify ile yazıldığından (usageService) '"purpose":"'
   * false-negative üretmez; asıl purpose doğrulaması çağıranda JSON.parse ile yapılır.
   */
  findMonthRowsWithPurpose(yearMonth: string): Promise<Array<{ estimatedCostUsd: number; meta: string }>> {
    return prisma.usageLog.findMany({
      where: { date: { startsWith: yearMonth }, meta: { contains: '"purpose":"' } },
      select: { estimatedCostUsd: true, meta: true },
    });
  },

  sumTweetsByDate(date: string): Promise<number> {
    return prisma.usageLog
      .aggregate({
        where: { date, type: "scan" },
        _sum: { tweetCount: true },
      })
      .then((r) => r._sum.tweetCount ?? 0);
  },
};
