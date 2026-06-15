import { prisma } from "@/lib/db/client";
import type { EvalTest } from "@/generated/prisma/client";
import {
  CreateEvalTestSchema,
  UpdateEvalTestSchema,
  type CreateEvalTestInput,
  type UpdateEvalTestInput,
} from "@/lib/growth-engine/types";

export const evalTestRepo = {
  create(raw: CreateEvalTestInput): Promise<EvalTest> {
    const input = CreateEvalTestSchema.parse(raw);
    return prisma.evalTest.create({
      data: {
        accountId: input.accountId,
        testName: input.testName,
        sourceContent: input.sourceContent,
        expectedBehavior: input.expectedBehavior,
        generatedOutput: input.generatedOutput ?? "",
        score: input.score,
        failureReason: input.failureReason,
        platform: input.platform ?? "x",
        pipelineId: input.pipelineId,
      },
    });
  },

  listByPlatform(platform: string, limit = 100): Promise<EvalTest[]> {
    return prisma.evalTest.findMany({
      where: { platform },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  listByAccount(accountId: string): Promise<EvalTest[]> {
    return prisma.evalTest.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
    });
  },

  findById(id: string): Promise<EvalTest | null> {
    return prisma.evalTest.findUnique({ where: { id } });
  },

  recordResult(
    id: string,
    result: { generatedOutput: string; score: number; failureReason?: string }
  ): Promise<EvalTest> {
    return prisma.evalTest.update({
      where: { id },
      data: {
        generatedOutput: result.generatedOutput,
        score: result.score,
        failureReason: result.failureReason ?? null,
      },
    });
  },

  update(id: string, raw: UpdateEvalTestInput): Promise<EvalTest> {
    const input = UpdateEvalTestSchema.parse(raw);
    return prisma.evalTest.update({ where: { id }, data: input });
  },
};
