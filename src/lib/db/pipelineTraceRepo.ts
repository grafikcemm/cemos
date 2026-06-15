import { prisma } from "@/lib/db/client";
import type { PipelineTrace } from "@/generated/prisma/client";

export type PipelineTraceStage = {
  stage: string;
  role: string;
  model: string;
  ok: boolean;
  failOpenUsed: boolean;
  ms: number;
  costUsd: number;
  score?: number;
};

export type CreatePipelineTraceInput = {
  platform: string;
  pipelineId: string;
  subjectType: string;
  subjectId: string;
  stages: PipelineTraceStage[];
  totalCostUsd: number;
};

export type PipelineTraceWithParsed = Omit<PipelineTrace, "stagesJson"> & {
  stages: PipelineTraceStage[];
};

function parse(t: PipelineTrace): PipelineTraceWithParsed {
  let stages: PipelineTraceStage[] = [];
  try {
    stages = JSON.parse(t.stagesJson) as PipelineTraceStage[];
  } catch {
    stages = [];
  }
  return { ...t, stages };
}

export const pipelineTraceRepo = {
  create(input: CreatePipelineTraceInput): Promise<PipelineTrace> {
    return prisma.pipelineTrace.create({
      data: {
        platform: input.platform,
        pipelineId: input.pipelineId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        stagesJson: JSON.stringify(input.stages),
        totalCostUsd: input.totalCostUsd,
      },
    });
  },

  async listBySubject(subjectType: string, subjectId: string, limit = 20): Promise<PipelineTraceWithParsed[]> {
    const rows = await prisma.pipelineTrace.findMany({
      where: { subjectType, subjectId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map(parse);
  },

  pruneOlderThan(days: number): Promise<{ count: number }> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return prisma.pipelineTrace.deleteMany({ where: { createdAt: { lt: cutoff } } });
  },
};
