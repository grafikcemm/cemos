import { prisma } from "@/lib/db/client";
import type { IgInsightSnapshot } from "@/generated/prisma/client";

export type UpsertIgInsightInput = {
  followerCount: number;
  reach: number;
  views: number;
  accountsEngaged: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  topMediaJson: string;
  seriesJson: string;
  rawJson: string;
};

export const igInsightSnapshotRepo = {
  /** date @unique → günde 1 idempotent. Aynı gün tekrar çağrı satırı tazeler. */
  upsertByDate(date: string, data: UpsertIgInsightInput): Promise<IgInsightSnapshot> {
    return prisma.igInsightSnapshot.upsert({
      where: { date },
      create: { date, ...data },
      update: data,
    });
  },

  /** Günde-1 kapısı: bugünün İstanbul date'i için satır var mı? */
  getByDate(date: string): Promise<IgInsightSnapshot | null> {
    return prisma.igInsightSnapshot.findUnique({ where: { date } });
  },

  /** Grafikler: son N gün, kronolojik (eski → yeni). */
  async listRecent(limit = 30): Promise<IgInsightSnapshot[]> {
    const rows = await prisma.igInsightSnapshot.findMany({
      orderBy: { date: "desc" },
      take: Math.min(Math.max(limit, 1), 90),
    });
    return rows.reverse();
  },
};
