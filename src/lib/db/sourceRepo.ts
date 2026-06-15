import { prisma } from "@/lib/db/client";
import type { Source } from "@/generated/prisma/client";

export type CreateSourceInput = {
  accountId: string;
  handle: string;
  displayName?: string;
  enabled?: boolean;
  mode?: string;
  thresholdLikes?: number;
  thresholdRetweets?: number;
};

export type UpdateSourceInput = Partial<
  Pick<Source, "displayName" | "enabled" | "mode" | "thresholdLikes" | "thresholdRetweets">
>;

export const sourceRepo = {
  listByAccount(accountId: string, includeArchived = false): Promise<Source[]> {
    return prisma.source.findMany({
      where: {
        accountId,
        archivedAt: includeArchived ? undefined : null,
      },
      orderBy: { createdAt: "asc" },
    });
  },

  findById(id: string): Promise<Source | null> {
    return prisma.source.findUnique({ where: { id } });
  },

  findByAccountAndHandle(accountId: string, handle: string): Promise<Source | null> {
    return prisma.source.findUnique({ where: { accountId_handle: { accountId, handle } } });
  },

  create(data: CreateSourceInput): Promise<Source> {
    return prisma.source.create({ data });
  },

  update(id: string, data: UpdateSourceInput): Promise<Source> {
    return prisma.source.update({ where: { id }, data });
  },

  archive(id: string): Promise<Source> {
    return prisma.source.update({
      where: { id },
      data: { archivedAt: new Date(), enabled: false },
    });
  },

  listEnabledByAccount(accountId: string): Promise<Source[]> {
    return prisma.source.findMany({
      where: { accountId, enabled: true, archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * Finds (or creates) the synthetic Source row that owns all discovered posts
   * of a given platform for an account, e.g. handle "__reddit". This keeps the
   * required SourcePost.sourceId FK satisfied for non-X connectors without
   * forcing the user to manually register every feed/subreddit.
   */
  async ensureDiscoverySource(accountId: string, sourceType: string): Promise<Source> {
    const handle = `__${sourceType}`;
    const existing = await prisma.source.findUnique({
      where: { accountId_handle: { accountId, handle } },
    });
    if (existing) return existing;
    return prisma.source.create({
      data: {
        accountId,
        handle,
        displayName: `Keşif: ${sourceType}`,
        mode: "DISCOVERY",
        enabled: true,
      },
    });
  },
};
