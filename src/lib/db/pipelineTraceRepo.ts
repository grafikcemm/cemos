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
  // ── Additive registry metadata (ADR-027, Faz 2A) ─────────────────────────
  // Eski stage kayıtları bu alanları taşımaz — hepsi opsiyonel; parse
  // değişmeden okunmaya devam eder. Yeni alan eklemek OK, alan silmek YASAK.
  agentId?: string;
  agentVersion?: string;
  adapterId?: string;
  executionMode?: string;
  preset?: string;
  /** Typed executor sonucu (succeeded/deterministic_fallback/blocked_external/...). */
  outcome?: string;
  fallbackUsed?: boolean;
  blockedReason?: string;
  retryCount?: number;
  estimatedCostUsd?: number;
  inputSchemaVersion?: string;
  outputSchemaVersion?: string;
  policyVersion?: string;
  // ── Additive generation provenance (ADR-036, Faz 3B) ─────────────────────
  // ReelDossier'a kolon EKLEMEDEN üretim provenance'ı taşır (migration'sız;
  // detay route'u listBySubject ile okur). Hepsi opsiyonel — eski kayıtlar
  // değişmeden parse edilir.
  seriesKey?: string;
  seriesVersion?: number;
  promptVersion?: string;
  sourceHandoffId?: string;
  /** Üretim anındaki canonical içerik hash'i (operatör edit tespiti için). */
  contentHash?: string;
  accountId?: string;
  accountHandle?: string;
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

  /**
   * Faz 2E (ADR-034 §G): bounded, indeks-dostu aggregate — pipelineId+zaman
   * penceresi ([pipelineId, createdAt] indeksi). Gün tavanı 90 (retention 30g
   * zaten pruning'de; tavan sorguyu sınırlar).
   */
  countByPipelineSince(pipelineId: string, sinceDays: number): Promise<number> {
    const days = Math.min(Math.max(sinceDays, 1), 90);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return prisma.pipelineTrace.count({ where: { pipelineId, createdAt: { gte: cutoff } } });
  },
};
