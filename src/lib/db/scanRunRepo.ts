import { prisma } from "@/lib/db/client";
import type { ScanRun } from "@/generated/prisma/client";

export const scanRunRepo = {
  create(accountId: string): Promise<ScanRun> {
    return prisma.scanRun.create({ data: { accountId } });
  },

  finish(
    id: string,
    data: {
      sourcesScanned: number;
      tweetsFound: number;
      postsInserted: number;
      estimatedCostUsd: number;
      errors: string[];
    }
  ): Promise<ScanRun> {
    return prisma.scanRun.update({
      where: { id },
      data: {
        ...data,
        errors: JSON.stringify(data.errors),
        finishedAt: new Date(),
      },
    });
  },
};
