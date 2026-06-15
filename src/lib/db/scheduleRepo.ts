import { prisma } from "@/lib/db/client";
import type { Schedule } from "@/generated/prisma/client";

export const scheduleRepo = {
  findByAccount(accountId: string): Promise<Schedule | null> {
    return prisma.schedule.findUnique({ where: { accountId } });
  },

  upsert(accountId: string, cadence: string): Promise<Schedule> {
    return prisma.schedule.upsert({
      where: { accountId },
      create: { accountId, cadence },
      update: { cadence },
    });
  },

  setLastScanAt(accountId: string): Promise<Schedule> {
    return prisma.schedule.update({
      where: { accountId },
      data: { lastScanAt: new Date() },
    });
  },

  update(accountId: string, data: Partial<Omit<Schedule, "id" | "accountId" | "updatedAt">>): Promise<Schedule> {
    return prisma.schedule.update({
      where: { accountId },
      data,
    });
  },
};
