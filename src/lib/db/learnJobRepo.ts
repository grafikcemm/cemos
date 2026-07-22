import { prisma } from "@/lib/db/client";
import type { LearnProcessingJob } from "@/generated/prisma/client";

export type UpdateJobInput = Partial<{
  currentStage: string;
  status: string;
  attempts: number;
  lastError: string | null;
  stageStateJson: string;
  startedAt: Date;
  finishedAt: Date | null;
  heartbeatAt: Date | null;
}>;

export const learnJobRepo = {
  /** Kaynak+versiyon başına tek job (idempotent). Varsa mevcut döner. */
  upsert(input: {
    sourceId: string;
    pipelineVersion: string;
  }): Promise<LearnProcessingJob> {
    return prisma.learnProcessingJob.upsert({
      where: {
        sourceId_pipelineVersion: {
          sourceId: input.sourceId,
          pipelineVersion: input.pipelineVersion,
        },
      },
      update: {},
      create: {
        sourceId: input.sourceId,
        pipelineVersion: input.pipelineVersion,
      },
    });
  },

  getById(id: string): Promise<LearnProcessingJob | null> {
    return prisma.learnProcessingJob.findUnique({ where: { id } });
  },

  getBySource(sourceId: string): Promise<LearnProcessingJob | null> {
    return prisma.learnProcessingJob.findFirst({
      where: { sourceId },
      orderBy: { createdAt: "desc" },
    });
  },

  update(id: string, data: UpdateJobInput): Promise<LearnProcessingJob> {
    return prisma.learnProcessingJob.update({ where: { id }, data });
  },

  /**
   * Atomik lease (compare-and-set): job'ı yalnız sahipsizken (pending/failed, ya da
   * lease bayat/null) "running"a çevirir. count===0 → başka worker TAZE lease tutuyor,
   * çağıran no-op döner. client advance + cron sweep'in aynı job'ı çift-işlemesini
   * (çift LLM harcaması) engeller.
   */
  async claim(jobId: string, staleBefore: Date, startedAt: Date): Promise<number> {
    const r = await prisma.learnProcessingJob.updateMany({
      where: {
        id: jobId,
        status: { not: "done" },
        OR: [
          { status: { in: ["pending", "failed"] } },
          { heartbeatAt: null },
          { heartbeatAt: { lt: staleBefore } },
        ],
      },
      data: { status: "running", heartbeatAt: new Date(), startedAt },
    });
    return r.count;
  },

  /**
   * Cron sweep adayları: ilerlemekte olup bitmemiş, ama client'ı kopmuş job'lar.
   * pending → hemen alınabilir; running → yalnız heartbeatAt bayatsa (lease).
   */
  findSweepable(staleBefore: Date, limit = 5): Promise<LearnProcessingJob[]> {
    return prisma.learnProcessingJob.findMany({
      where: {
        status: { in: ["pending", "running"] },
        OR: [
          { status: "pending" },
          { heartbeatAt: { lt: staleBefore } },
          { heartbeatAt: null },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: Math.min(Math.max(limit, 1), 50),
    });
  },
};
