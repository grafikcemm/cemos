import { prisma } from "@/lib/db/client";
import type { YtChannel } from "@/generated/prisma/client";
import { redactSecrets } from "@/lib/utils/redactSecrets";

export type UpsertYtChannelInput = {
  channelId: string;
  handle: string;
  title?: string;
  subscriberCount?: number;
  videoCount?: number;
  viewCountTotal?: number;
  uploadsPlaylistId?: string;
  category?: string;
  isCompetitor?: boolean;
  discoveredFrom?: string;
  enabled?: boolean;
};

export const ytChannelRepo = {
  upsertByChannelId(input: UpsertYtChannelInput): Promise<YtChannel> {
    const { channelId, ...rest } = input;
    return prisma.ytChannel.upsert({
      where: { channelId },
      create: { channelId, ...rest },
      update: rest,
    });
  },

  /** Sync hedefleri: aktif rakipler, en eski sync edilen önce. */
  listEnabledCompetitors(): Promise<YtChannel[]> {
    return prisma.ytChannel.findMany({
      where: { enabled: true, isCompetitor: true },
      orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    });
  },

  listAll(): Promise<YtChannel[]> {
    return prisma.ytChannel.findMany({ orderBy: { subscriberCount: "desc" } });
  },

  /** Keşif onay kuyruğu: discovery'den gelen, henüz onaylanmamış. */
  listSuggestions(): Promise<YtChannel[]> {
    return prisma.ytChannel.findMany({
      where: { discoveredFrom: "discovery", enabled: false },
      orderBy: { createdAt: "desc" },
    });
  },

  existingHandles(): Promise<string[]> {
    return prisma.ytChannel
      .findMany({ select: { handle: true } })
      .then((rows) => rows.map((r) => r.handle));
  },

  count(): Promise<number> {
    return prisma.ytChannel.count();
  },

  markSynced(channelId: string, data: { rollingMedianVpd: number }): Promise<YtChannel> {
    return prisma.ytChannel.update({
      where: { channelId },
      data: {
        rollingMedianVpd: data.rollingMedianVpd,
        lastSyncedAt: new Date(),
        errorCount: 0,
        lastError: null,
      },
    });
  },

  async markError(channelId: string, message: string): Promise<void> {
    try {
      await prisma.ytChannel.update({
        where: { channelId },
        data: { errorCount: { increment: 1 }, lastError: redactSecrets(message).slice(0, 500) },
      });
    } catch {
      // kanal kaydı yoksa sessizce geç (fail-open)
    }
  },

  setEnabled(channelId: string, enabled: boolean): Promise<YtChannel> {
    return prisma.ytChannel.update({ where: { channelId }, data: { enabled } });
  },

  updateCategory(channelId: string, category: string): Promise<YtChannel> {
    return prisma.ytChannel.update({ where: { channelId }, data: { category } });
  },
};
