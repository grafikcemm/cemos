import { AGENT_EVAL_FIXTURES, type AgentEvalFixture } from "@/lib/agents/registry/fixtures";
import { hermeticAdapterFor } from "@/lib/agents/registry/hermeticAdapters";
import { executeAgent } from "@/lib/agents/registry/executor";
import {
  evalRunRepo,
  type EvalCaseStatus,
  type EvalRunStatus,
  type EvalRunTrigger,
} from "@/lib/db/evalRunRepo";

/**
 * Registry contract eval runner (ADR-034 §C) — DETERMINISTIC mod.
 *
 * Hermetic sözleşme: network/social-sync/memory-write/publish/üretim-DB
 * mutasyonu YOK. Yan etkili adapter'lar hermeticAdapters mock'larıyla değişir;
 * yalnız saf yollar gerçek koşar. Ücret 0 (LLM çağrısı yok).
 *
 * Runner'ın KENDİ kayıtları (EvalRun/EvalCaseResult + best-effort
 * PipelineTrace) bilinçli DB yazımlarıdır — bunlar gözlemlenebilirlik
 * defteridir, üretim verisi mutasyonu değildir.
 *
 * DÜRÜSTLÜK: bu koşunun geçmesi "production agent canlı doğrulandı" DEMEK
 * DEĞİLDİR; sonuç her zaman mode=deterministic olarak etiketlenir.
 */

export const REGISTRY_CONTRACT_POLICY_VERSION = "2E-1";
const PER_CASE_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 4;

export type ContractCaseOutcome = {
  caseKey: string;
  fixtureId: string;
  agentId: string;
  status: EvalCaseStatus;
  outcome: string;
  latencyMs: number;
  traceStatus: string;
  violations: string[];
};

export type RegistryContractRunResult = {
  runId: string | null;
  status: EvalRunStatus;
  mode: "deterministic";
  passed: number;
  failed: number;
  skipped: number;
  totalCostUsd: 0;
  cases: ContractCaseOutcome[];
  dryRun: boolean;
};

export type RegistryContractRunOptions = {
  trigger: EvalRunTrigger;
  maxCases?: number;
  dryRun?: boolean;
  concurrency?: number;
  /** Test enjeksiyonu: fixture listesi override. */
  fixturesOverride?: AgentEvalFixture[];
};

class CaseTimeoutError extends Error {
  constructor(ms: number) {
    super(`Eval case zaman aşımı: ${ms}ms`);
    this.name = "CaseTimeoutError";
  }
}

async function withCaseTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CaseTimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Truncate'li, secret'sız hata sınıfı çıkarımı. */
function errClass(e: unknown): string {
  return e instanceof Error ? e.name : "unknown";
}

async function runSingleCase(fixture: AgentEvalFixture): Promise<ContractCaseOutcome> {
  const startedAt = Date.now();
  const base = {
    caseKey: fixture.id,
    fixtureId: fixture.id,
    agentId: fixture.agentId,
    totalCost: 0,
  };
  const adapter = hermeticAdapterFor(fixture.agentId);
  if (!adapter) {
    return {
      ...base,
      status: "failed",
      outcome: "no_hermetic_adapter",
      latencyMs: Date.now() - startedAt,
      traceStatus: "not_applicable",
      violations: [`hermetic adapter yok: ${fixture.agentId}`],
    };
  }
  try {
    const exec = () =>
      executeAgent(fixture.agentId, fixture.input, {
        subjectType: "eval_fixture",
        subjectId: fixture.id,
        adapterOverride: adapter,
      });
    const result = await withCaseTimeout(exec(), PER_CASE_TIMEOUT_MS);

    const violations: string[] = [];
    if (!fixture.contract.expectedOutcomes.includes(result.status)) {
      violations.push(
        `beklenen outcome ${fixture.contract.expectedOutcomes.join("|")}, gelen ${result.status}` +
          (result.errorMessage ? ` (${result.errorMessage.slice(0, 160)})` : "")
      );
    }
    if (violations.length === 0 && fixture.contract.assertOutput) {
      violations.push(...fixture.contract.assertOutput(result.output));
    }
    if (violations.length === 0 && fixture.contract.deterministic) {
      // Deterministik beklenti: ikinci koşu aynı çıktıyı üretmeli.
      const second = await withCaseTimeout(exec(), PER_CASE_TIMEOUT_MS);
      if (JSON.stringify(second.output) !== JSON.stringify(result.output)) {
        violations.push("deterministik beklenti ihlali: iki koşu farklı çıktı üretti");
      }
    }
    return {
      ...base,
      status: violations.length === 0 ? "passed" : "failed",
      outcome: result.status,
      latencyMs: Date.now() - startedAt,
      traceStatus: result.traceStatus,
      violations,
    };
  } catch (e) {
    return {
      ...base,
      status: "failed",
      outcome: e instanceof CaseTimeoutError ? "case_timeout" : "runner_error",
      latencyMs: Date.now() - startedAt,
      traceStatus: "not_applicable",
      violations: [`${errClass(e)}: ${e instanceof Error ? e.message.slice(0, 160) : "?"}`],
    };
  }
}

/** Bounded concurrency havuzu (basit worker döngüsü). */
async function runPool<T, R>(items: T[], worker: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(lanes);
  return results;
}

export async function runRegistryContractEval(
  opts: RegistryContractRunOptions
): Promise<RegistryContractRunResult> {
  const all = opts.fixturesOverride ?? AGENT_EVAL_FIXTURES;
  const fixtures = typeof opts.maxCases === "number" ? all.slice(0, Math.max(0, opts.maxCases)) : all;

  if (opts.dryRun) {
    return {
      runId: null,
      status: "passed",
      mode: "deterministic",
      passed: 0,
      failed: 0,
      skipped: fixtures.length,
      totalCostUsd: 0,
      cases: fixtures.map((f) => ({
        caseKey: f.id,
        fixtureId: f.id,
        agentId: f.agentId,
        status: "skipped" as const,
        outcome: "dry_run",
        latencyMs: 0,
        traceStatus: "not_applicable",
        violations: [],
      })),
      dryRun: true,
    };
  }

  // Crash artığı "running" koşuları önce uzlaştır (best-effort).
  await evalRunRepo.reconcileStaleRunning().catch(() => 0);

  const run = await evalRunRepo.createRun({
    kind: "registry_contract",
    mode: "deterministic",
    trigger: opts.trigger,
    policyVersion: REGISTRY_CONTRACT_POLICY_VERSION,
  });

  const cases = await runPool(fixtures, runSingleCase, opts.concurrency ?? DEFAULT_CONCURRENCY);

  // Case kayıtları — best-effort ama kaydedilemeyen case koşuyu partial yapar.
  let persistFailures = 0;
  for (const c of cases) {
    try {
      await evalRunRepo.recordCase({
        runId: run.id,
        caseKey: c.caseKey,
        fixtureId: c.fixtureId,
        agentId: c.agentId,
        status: c.status,
        latencyMs: c.latencyMs,
        costUsd: 0,
        traceStatus: c.traceStatus as "persisted" | "failed" | "skipped_policy" | "not_applicable",
        details: { outcome: c.outcome, violations: c.violations.slice(0, 10) },
      });
    } catch {
      persistFailures += 1;
    }
  }

  const passed = cases.filter((c) => c.status === "passed").length;
  const failed = cases.filter((c) => c.status === "failed").length;
  const skipped = cases.filter((c) => c.status === "skipped").length;
  const status: EvalRunStatus =
    failed === 0 && persistFailures === 0 ? "passed" : failed === cases.length ? "failed" : "partial";

  await evalRunRepo.finishRun(run.id, {
    status,
    passedCount: passed,
    failedCount: failed,
    skippedCount: skipped,
    totalCostUsd: 0,
    summary: {
      fixtures: fixtures.length,
      persistFailures,
      failedCases: cases.filter((c) => c.status === "failed").map((c) => c.caseKey),
    },
    errorClass: persistFailures > 0 ? "case_persist_failed" : null,
  });

  return {
    runId: run.id,
    status,
    mode: "deterministic",
    passed,
    failed,
    skipped,
    totalCostUsd: 0,
    cases,
    dryRun: false,
  };
}
