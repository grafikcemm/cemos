import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EvalRun/EvalCaseResult repo sözleşmesi (ADR-034 §B) — prisma mock'lu,
 * tamamen deterministik. Gizlilik: bounded JSON tavanı + truncate işareti.
 */

const createRun = vi.fn();
const updateRun = vi.fn();
const updateMany = vi.fn();
const findMany = vi.fn();
const findFirst = vi.fn();
const upsertCase = vi.fn();
const caseFindMany = vi.fn();
const groupBy = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    evalRun: {
      create: (a: unknown) => createRun(a),
      update: (a: unknown) => updateRun(a),
      updateMany: (a: unknown) => updateMany(a),
      findMany: (a: unknown) => findMany(a),
      findFirst: (a: unknown) => findFirst(a),
    },
    evalCaseResult: {
      upsert: (a: unknown) => upsertCase(a),
      findMany: (a: unknown) => caseFindMany(a),
      groupBy: (a: unknown) => groupBy(a),
    },
  },
}));

import { evalRunRepo } from "./evalRunRepo";

beforeEach(() => {
  vi.clearAllMocks();
  createRun.mockResolvedValue({ id: "run-1" });
  updateRun.mockResolvedValue({ id: "run-1" });
  updateMany.mockResolvedValue({ count: 0 });
  findMany.mockResolvedValue([]);
  findFirst.mockResolvedValue(null);
  upsertCase.mockResolvedValue({ id: "case-1" });
  groupBy.mockResolvedValue([]);
});

describe("evalRunRepo (ADR-034 §B)", () => {
  it("createRun kind/mode/trigger/policyVersion yazar", async () => {
    await evalRunRepo.createRun({
      kind: "registry_contract",
      mode: "deterministic",
      trigger: "cron",
      policyVersion: "2E-1",
    });
    expect(createRun).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "registry_contract",
        mode: "deterministic",
        trigger: "cron",
        policyVersion: "2E-1",
      }),
    });
  });

  it("finishRun summary'yi bounded JSON'a çevirir (boyut tavanı → truncate işareti)", async () => {
    await evalRunRepo.finishRun("run-1", {
      status: "passed",
      passedCount: 5,
      failedCount: 0,
      skippedCount: 0,
      totalCostUsd: 0,
      summary: { big: "x".repeat(20_000) },
    });
    const data = updateRun.mock.calls[0][0].data;
    expect(data.summaryJson.length).toBeLessThan(9_000);
    expect(JSON.parse(data.summaryJson)).toMatchObject({ truncated: true, reason: "size_cap" });
  });

  it("recordCase unique(runId,caseKey) üzerinden upsert eder — tekrar koşum güvenli", async () => {
    await evalRunRepo.recordCase({
      runId: "run-1",
      caseKey: "curation-basic",
      status: "passed",
      traceStatus: "persisted",
    });
    expect(upsertCase).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId_caseKey: { runId: "run-1", caseKey: "curation-basic" } },
      })
    );
  });

  it("reconcileStaleRunning yalnız eşiği aşan running koşuları partial'a çeker", async () => {
    updateMany.mockResolvedValue({ count: 2 });
    const n = await evalRunRepo.reconcileStaleRunning(60_000);
    expect(n).toBe(2);
    const where = updateMany.mock.calls[0][0].where;
    expect(where.status).toBe("running");
    expect(where.startedAt.lt).toBeInstanceOf(Date);
    expect(updateMany.mock.calls[0][0].data).toMatchObject({
      status: "partial",
      errorClass: "stale_running_reconciled",
    });
  });

  it("listRecentRuns limit'i 50 ile sınırlar (bounded query)", async () => {
    await evalRunRepo.listRecentRuns(500);
    expect(findMany.mock.calls[0][0].take).toBe(50);
  });

  it("observedTraceCoverage: skipped_policy 'beklenen' sayılmaz; coverage = persisted/(persisted+failed)", async () => {
    findMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
    groupBy.mockResolvedValue([
      { traceStatus: "persisted", _count: { _all: 8 } },
      { traceStatus: "failed", _count: { _all: 2 } },
      { traceStatus: "skipped_policy", _count: { _all: 5 } },
    ]);
    const cov = await evalRunRepo.observedTraceCoverage(5);
    expect(cov).toMatchObject({ expected: 10, persisted: 8, failed: 2, skipped: 5, coveragePct: 80 });
  });

  it("observedTraceCoverage: hiç koşu yoksa coveragePct null (sahte %100 yok)", async () => {
    findMany.mockResolvedValue([]);
    const cov = await evalRunRepo.observedTraceCoverage(5);
    expect(cov.coveragePct).toBeNull();
    expect(cov.runsConsidered).toBe(0);
  });
});
