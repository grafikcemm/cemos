import { prisma } from "@/lib/db/client";
import type { GenerationRun } from "@/generated/prisma/client";

export type CreateGenerationRunInput = {
  accountId: string;
  queueItemId: string;
  modelUsed: string;
  estimatedCostUsd: number;
  usedMock: boolean;
};

export const generationRunRepo = {
  create(data: CreateGenerationRunInput): Promise<GenerationRun> {
    return prisma.generationRun.create({ data });
  },
};
