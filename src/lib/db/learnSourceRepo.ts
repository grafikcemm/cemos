import { prisma } from "@/lib/db/client";
import type { LearnSource } from "@/generated/prisma/client";

export type UpsertLearnSourceInput = {
  kind?: string;
  externalId: string;
  url: string;
  title?: string;
  channelTitle?: string;
  durationSec?: number;
  lang?: string | null;
  metaJson?: string;
  userId?: string | null;
};

export type UpdateLearnSourceInput = Partial<{
  title: string;
  channelTitle: string;
  durationSec: number;
  lang: string | null;
  metaJson: string;
  status: string;
}>;

export const learnSourceRepo = {
  /** [kind, externalId] benzersiz → aynı video iki kez eklenince mevcut kaynak döner. */
  async upsertByExternal(input: UpsertLearnSourceInput): Promise<LearnSource> {
    const kind = input.kind ?? "youtube";
    return prisma.learnSource.upsert({
      where: { kind_externalId: { kind, externalId: input.externalId } },
      update: {}, // idempotent: mevcut kaydı bozma
      create: {
        kind,
        externalId: input.externalId,
        url: input.url,
        title: input.title ?? "",
        channelTitle: input.channelTitle ?? "",
        durationSec: input.durationSec ?? 0,
        lang: input.lang ?? null,
        metaJson: input.metaJson ?? "{}",
        userId: input.userId ?? null,
      },
    });
  },

  getById(id: string): Promise<LearnSource | null> {
    return prisma.learnSource.findUnique({ where: { id } });
  },

  findByExternal(kind: string, externalId: string): Promise<LearnSource | null> {
    return prisma.learnSource.findUnique({
      where: { kind_externalId: { kind, externalId } },
    });
  },

  list(limit = 100): Promise<LearnSource[]> {
    return prisma.learnSource.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  },

  update(id: string, data: UpdateLearnSourceInput): Promise<LearnSource> {
    return prisma.learnSource.update({ where: { id }, data });
  },
};
