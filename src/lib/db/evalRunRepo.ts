import { prisma } from "@/lib/db/client";
import type { EvalRun, EvalCaseResult } from "@/generated/prisma/client";

/**
 * Kalıcı eval koşu geçmişi (ADR-034, Faz 2E). EvalTest'in son-sonuç
 * overwrite'ı tek audit kaynağı olmaktan çıkar: her koşu tarihsel olarak
 * adreslenebilir, her case sonucu ayrı satırdır.
 *
 * Gizlilik sözleşmesi: summaryJson/detailsJson BOUNDED tutulur — raw secret,
 * tam prompt veya hassas dış platform payload'u YAZILMAZ. Çağıran sanitize
 * eder; repo ek olarak boyut tavanı uygular (fail-closed truncate + işaret).
 */

export type EvalRunKind = "registry_contract" | "golden_live" | "curator_live" | "thread_smoke";
export type EvalRunMode = "deterministic" | "live";
export type EvalRunTrigger = "manual" | "cron";
export type EvalRunStatus = "running" | "passed" | "partial" | "failed" | "blocked_external";
export type EvalCaseStatus = "passed" | "failed" | "skipped" | "blocked_external";
export type EvalTraceStatus = "persisted" | "failed" | "skipped_policy" | "not_applicable";

const MAX_JSON_CHARS = 8_000;

function boundedJson(value: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(value ?? {});
  } catch {
    return '{"truncated":true,"reason":"unserializable"}';
  }
  if (s.length <= MAX_JSON_CHARS) return s;
  return JSON.stringify({ truncated: true, reason: "size_cap", originalChars: s.length });
}

export type CreateEvalRunInput = {
  kind: EvalRunKind;
  mode: EvalRunMode;
  trigger: EvalRunTrigger;
  policyVersion: string;
  model?: string | null;
  preset?: string | null;
};

export type FinishEvalRunInput = {
  status: EvalRunStatus;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  totalCostUsd: number;
  summary?: unknown;
  errorClass?: string | null;
};

export type RecordEvalCaseInput = {
  runId: string;
  caseKey: string;
  fixtureId?: string | null;
  agentId?: string | null;
  status: EvalCaseStatus;
  score?: number | null;
  latencyMs?: number | null;
  costUsd?: number;
  traceStatus?: EvalTraceStatus;
  details?: unknown;
};

export const evalRunRepo = {
  async createRun(input: CreateEvalRunInput): Promise<EvalRun> {
    return prisma.evalRun.create({
      data: {
        kind: input.kind,
        mode: input.mode,
        trigger: input.trigger,
        policyVersion: input.policyVersion,
        model: input.model ?? null,
        preset: input.preset ?? null,
      },
    });
  },

  async finishRun(runId: string, input: FinishEvalRunInput): Promise<EvalRun> {
    return prisma.evalRun.update({
      where: { id: runId },
      data: {
        status: input.status,
        finishedAt: new Date(),
        passedCount: input.passedCount,
        failedCount: input.failedCount,
        skippedCount: input.skippedCount,
        totalCostUsd: input.totalCostUsd,
        summaryJson: boundedJson(input.summary),
        errorClass: input.errorClass ?? null,
      },
    });
  },

  async recordCase(input: RecordEvalCaseInput): Promise<EvalCaseResult> {
    return prisma.evalCaseResult.upsert({
      where: { runId_caseKey: { runId: input.runId, caseKey: input.caseKey } },
      create: {
        runId: input.runId,
        caseKey: input.caseKey,
        fixtureId: input.fixtureId ?? null,
        agentId: input.agentId ?? null,
        status: input.status,
        score: input.score ?? null,
        latencyMs: input.latencyMs ?? null,
        costUsd: input.costUsd ?? 0,
        traceStatus: input.traceStatus ?? "not_applicable",
        detailsJson: boundedJson(input.details),
      },
      update: {
        status: input.status,
        score: input.score ?? null,
        latencyMs: input.latencyMs ?? null,
        costUsd: input.costUsd ?? 0,
        traceStatus: input.traceStatus ?? "not_applicable",
        detailsJson: boundedJson(input.details),
      },
    });
  },

  async listRecentRuns(limit = 10, kind?: EvalRunKind): Promise<EvalRun[]> {
    const take = Math.max(1, Math.min(limit, 50));
    return prisma.evalRun.findMany({
      where: kind ? { kind } : undefined,
      orderBy: { startedAt: "desc" },
      take,
    });
  },

  async latestRunByKind(kind: EvalRunKind): Promise<EvalRun | null> {
    return prisma.evalRun.findFirst({ where: { kind }, orderBy: { startedAt: "desc" } });
  },

  async casesForRun(runId: string, limit = 100): Promise<EvalCaseResult[]> {
    const take = Math.max(1, Math.min(limit, 500));
    return prisma.evalCaseResult.findMany({ where: { runId }, orderBy: { createdAt: "asc" }, take });
  },

  /**
   * Process crash sonrası "running" kalmış koşuları partial'a uzlaştırır
   * (stale eşiği aşılmışsa). Dönen sayı = uzlaştırılan koşu adedi.
   */
  async reconcileStaleRunning(staleMs = 30 * 60_000): Promise<number> {
    const cutoff = new Date(Date.now() - staleMs);
    const res = await prisma.evalRun.updateMany({
      where: { status: "running", startedAt: { lt: cutoff } },
      data: { status: "partial", errorClass: "stale_running_reconciled", finishedAt: new Date() },
    });
    return res.count;
  },

  /**
   * Son N koşu için gözlenen trace kapsaması (ADR-034 dürüst sınırlama:
   * bu, eval koşularında GÖZLENEN trace sonuçlarıdır — evrensel/durable
   * "kayıp trace sayacı" değildir).
   */
  async observedTraceCoverage(lastNRuns = 5): Promise<{
    runsConsidered: number;
    expected: number;
    persisted: number;
    failed: number;
    skipped: number;
    coveragePct: number | null;
  }> {
    const runs = await prisma.evalRun.findMany({
      where: { status: { not: "running" } },
      orderBy: { startedAt: "desc" },
      take: Math.max(1, Math.min(lastNRuns, 20)),
      select: { id: true },
    });
    if (runs.length === 0) {
      return { runsConsidered: 0, expected: 0, persisted: 0, failed: 0, skipped: 0, coveragePct: null };
    }
    const groups = await prisma.evalCaseResult.groupBy({
      by: ["traceStatus"],
      where: { runId: { in: runs.map((r) => r.id) } },
      _count: { _all: true },
    });
    const count = (s: string) => groups.find((g) => g.traceStatus === s)?._count._all ?? 0;
    const persisted = count("persisted");
    const failed = count("failed");
    const skipped = count("skipped_policy");
    const expected = persisted + failed; // skipped_policy bilinçli atlanır, "beklenen" sayılmaz
    return {
      runsConsidered: runs.length,
      expected,
      persisted,
      failed,
      skipped,
      coveragePct: expected > 0 ? Math.round((persisted / expected) * 100) : null,
    };
  },
};
