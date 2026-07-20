import { prisma } from "@/lib/db/client";
import type { CronRun } from "@/generated/prisma/client";
import { safeJsonStringify } from "@/lib/growth-engine/types";
import { redactError } from "@/lib/utils/redactSecrets";

const DEFAULT_RUNNING_STALE_MS = 10 * 60 * 1000; // a scan/cron should never exceed 10 min

export type FinishCronRunInput = {
  ok: boolean;
  partial?: boolean;
  result?: unknown;
  error?: string;
};

/**
 * Serverless cron heartbeat + result log. `start()` is written heartbeat-FIRST
 * so even a timed-out Vercel invocation leaves proof the cron fired; healthService
 * reads the latest row as the primary automation-freshness signal. `hasRunning()`
 * doubles as the advisory lock that replaces the filesystem scan.lock on Vercel.
 */
export const cronRunRepo = {
  start(kind: string): Promise<CronRun> {
    return prisma.cronRun.create({ data: { kind } });
  },

  /** Best-effort: a CronRun bookkeeping failure must never mask the real result. */
  async finish(id: string, input: FinishCronRunInput): Promise<CronRun | null> {
    try {
      return await prisma.cronRun.update({
        where: { id },
        data: {
          finishedAt: new Date(),
          ok: input.ok,
          partial: input.partial ?? false,
          ...(input.result !== undefined ? { resultJson: safeJsonStringify(input.result) } : {}),
          ...(input.error !== undefined ? { error: input.error } : {}),
        },
      });
    } catch (err) {
      console.error("CronRun finish yazılırken hata oluştu:", redactError(err));
      return null;
    }
  },

  latest(): Promise<CronRun | null> {
    return prisma.cronRun.findFirst({ orderBy: { startedAt: "desc" } });
  },

  latestByKind(kind: string): Promise<CronRun | null> {
    return prisma.cronRun.findFirst({ where: { kind }, orderBy: { startedAt: "desc" } });
  },

  /** Fails open (false) on DB errors so a flaky connection never blocks scans. */
  async hasRunning(kind: string, staleMs = DEFAULT_RUNNING_STALE_MS): Promise<boolean> {
    try {
      const running = await prisma.cronRun.findFirst({
        where: {
          kind,
          finishedAt: null,
          startedAt: { gt: new Date(Date.now() - staleMs) },
        },
      });
      return Boolean(running);
    } catch (err) {
      console.error("CronRun lock kontrolünde hata oluştu:", redactError(err));
      return false;
    }
  },

  /**
   * ATOMIC single-flight start. Takes a per-kind advisory lock, then starts a run
   * only if no non-stale run of that kind is already in flight — closing the
   * `hasRunning()→start()` TOCTOU so a Vercel retry or a manual recovery
   * overlapping the cron cannot BOTH begin the same job (double LLM spend +
   * duplicate writes). `{ skipped: true }` means "already running, do nothing".
   * Fails OPEN on a DB/lock error: it proceeds (best-effort plain start) rather
   * than blocking the cron, matching the pre-existing start() error behavior.
   */
  async startIfIdle(
    kind: string,
    staleMs = DEFAULT_RUNNING_STALE_MS,
  ): Promise<{ run: CronRun | null; skipped: boolean }> {
    try {
      const run = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cronrun:${kind}`}))`;
        const running = await tx.cronRun.findFirst({
          where: { kind, finishedAt: null, startedAt: { gt: new Date(Date.now() - staleMs) } },
        });
        if (running) return null;
        return await tx.cronRun.create({ data: { kind } });
      });
      return run === null ? { run: null, skipped: true } : { run, skipped: false };
    } catch (err) {
      console.error("CronRun startIfIdle hata oluştu:", redactError(err));
      const run = await prisma.cronRun.create({ data: { kind } }).catch(() => null);
      return { run, skipped: false };
    }
  },

  pruneOlderThan(days = 60): Promise<{ count: number }> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return prisma.cronRun.deleteMany({ where: { startedAt: { lt: cutoff } } });
  },
};
