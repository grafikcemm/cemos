import { prisma } from "@/lib/db/client";
import type { Account } from "@/generated/prisma/client";

export const accountRepo = {
  findAll(): Promise<Account[]> {
    return prisma.account.findMany({ orderBy: { handle: "asc" } });
  },

  findById(id: string): Promise<Account | null> {
    return prisma.account.findUnique({ where: { id } });
  },

  findByHandle(handle: string): Promise<Account | null> {
    return prisma.account.findUnique({ where: { handle } });
  },
};
