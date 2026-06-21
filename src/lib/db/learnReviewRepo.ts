import { prisma } from "@/lib/db/client";
import type {
  LearnReviewSchedule,
  LearnReviewAttempt,
  LearnItem,
  LearnConcept,
} from "@/generated/prisma/client";

export type DueEntry = LearnReviewSchedule & {
  item: LearnItem & { concept: LearnConcept | null };
};

export type UpdateScheduleInput = Partial<{
  ladderStep: number;
  intervalDays: number;
  ease: number;
  dueAt: Date;
  lastReviewedAt: Date;
  lapses: number;
}>;

export const learnReviewRepo = {
  getScheduleByItem(itemId: string): Promise<LearnReviewSchedule | null> {
    return prisma.learnReviewSchedule.findUnique({ where: { itemId } });
  },

  createSchedule(input: {
    itemId: string;
    dueAt: Date;
    intervalDays: number;
    ladderStep: number;
    ease: number;
  }): Promise<LearnReviewSchedule> {
    return prisma.learnReviewSchedule.create({
      data: {
        itemId: input.itemId,
        dueAt: input.dueAt,
        intervalDays: input.intervalDays,
        ladderStep: input.ladderStep,
        ease: input.ease,
      },
    });
  },

  updateSchedule(itemId: string, data: UpdateScheduleInput): Promise<LearnReviewSchedule> {
    return prisma.learnReviewSchedule.update({ where: { itemId }, data });
  },

  /** Pack item'larından programı olmayanlara ilk schedule yaratır (idempotent). */
  async seedForPack(
    packId: string,
    firstDueAt: Date,
    firstIntervalDays: number
  ): Promise<number> {
    const items = await prisma.learnItem.findMany({
      where: { packId, schedule: { is: null } },
      select: { id: true },
    });
    if (items.length === 0) return 0;
    const res = await prisma.learnReviewSchedule.createMany({
      data: items.map((it) => ({
        itemId: it.id,
        dueAt: firstDueAt,
        intervalDays: firstIntervalDays,
        ladderStep: 0,
        ease: 2.5,
      })),
    });
    return res.count;
  },

  /** Due item'lar (kavram + item dahil) — seçim/sıralama serviste yapılır. */
  listDue(now: Date, limit = 50): Promise<DueEntry[]> {
    return prisma.learnReviewSchedule.findMany({
      where: { dueAt: { lte: now } },
      include: { item: { include: { concept: true } } },
      take: Math.min(Math.max(limit, 1), 200),
    });
  },

  countDue(now: Date): Promise<number> {
    return prisma.learnReviewSchedule.count({ where: { dueAt: { lte: now } } });
  },

  createAttempt(input: {
    itemId: string;
    grade: number;
    correct: boolean;
    responseMs: number;
  }): Promise<LearnReviewAttempt> {
    return prisma.learnReviewAttempt.create({ data: input });
  },

  /** Son n denemenin correct booleanları (mastery hesabı için, yeni→eski). */
  async recentCorrect(itemId: string, n = 5): Promise<boolean[]> {
    const rows = await prisma.learnReviewAttempt.findMany({
      where: { itemId },
      orderBy: { reviewedAt: "desc" },
      take: Math.min(Math.max(n, 1), 50),
      select: { correct: true },
    });
    return rows.map((r) => r.correct).reverse(); // eski→yeni
  },
};
