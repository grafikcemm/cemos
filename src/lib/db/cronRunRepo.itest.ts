/**
 * REAL-Postgres integration test for cron single-flight (`startIfIdle`).
 *
 * Proves the `pg_advisory_xact_lock` + check-inside-lock actually serializes two
 * concurrent cron invocations so only ONE starts the job. A mocked `$transaction`
 * runs the callback inline with no real lock, so both callers see "no running"
 * and both start — the exact double-spend TOCTOU this closes.
 *
 * Gated: skipped unless DB_INTEGRATION=1; refuses a non-ephemeral DATABASE_URL.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { shouldRunDbIntegration, truncate, prisma } from "@/test/integration/guard";
import { cronRunRepo } from "./cronRunRepo";

const RUN = shouldRunDbIntegration();
const KIND = "itest-generate-morning";

describe.skipIf(!RUN)("cronRunRepo.startIfIdle — real Postgres single-flight", () => {
  beforeEach(async () => {
    await truncate(["CronRun"]);
  });

  it("two concurrent startIfIdle: exactly one starts, the other is skipped", async () => {
    const [a, b] = await Promise.all([
      cronRunRepo.startIfIdle(KIND),
      cronRunRepo.startIfIdle(KIND),
    ]);

    const started = [a, b].filter((r) => !r.skipped && r.run);
    const skipped = [a, b].filter((r) => r.skipped);
    expect(started).toHaveLength(1);
    expect(skipped).toHaveLength(1);

    // Ground truth: exactly one CronRun row of this kind exists.
    const rows = await prisma.cronRun.count({ where: { kind: KIND } });
    expect(rows).toBe(1);
  });

  it("a finished run does not block the next start", async () => {
    const first = await cronRunRepo.startIfIdle(KIND);
    expect(first.skipped).toBe(false);
    await cronRunRepo.finish(first.run!.id, { ok: true });

    const second = await cronRunRepo.startIfIdle(KIND);
    expect(second.skipped).toBe(false);
    expect(await prisma.cronRun.count({ where: { kind: KIND } })).toBe(2);
  });

  it("a stale (over-budget) in-flight run does not block a fresh start", async () => {
    // Insert a run that started 20 min ago and never finished (crashed invocation).
    await prisma.cronRun.create({
      data: { kind: KIND, startedAt: new Date(Date.now() - 20 * 60 * 1000) },
    });
    // staleMs default is 10 min → the old run is stale → a new one may start.
    const fresh = await cronRunRepo.startIfIdle(KIND);
    expect(fresh.skipped).toBe(false);
  });

  it("an active recent run blocks a concurrent start", async () => {
    // A fresh in-flight run (just started, not finished) must block startIfIdle.
    await prisma.cronRun.create({ data: { kind: KIND } });
    const blocked = await cronRunRepo.startIfIdle(KIND);
    expect(blocked.skipped).toBe(true);
    expect(blocked.run).toBeNull();
  });
});
