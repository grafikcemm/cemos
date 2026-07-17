import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Registry contract eval runner (ADR-034 §C) — hermetic sözleşme testleri.
 * Ağ/gerçek-DB/ücret YOK: trace repo + evalRunRepo mock; adapter'lar hermetic.
 */

const traceCreate = vi.fn().mockResolvedValue({ id: "trace-1" });
vi.mock("@/lib/db/pipelineTraceRepo", () => ({
  pipelineTraceRepo: { create: (i: unknown) => traceCreate(i) },
}));

const createRun = vi.fn();
const finishRun = vi.fn();
const recordCase = vi.fn();
const reconcileStaleRunning = vi.fn();
vi.mock("@/lib/db/evalRunRepo", () => ({
  evalRunRepo: {
    createRun: (i: unknown) => createRun(i),
    finishRun: (id: string, i: unknown) => finishRun(id, i),
    recordCase: (i: unknown) => recordCase(i),
    reconcileStaleRunning: () => reconcileStaleRunning(),
  },
}));

// generateJsonGated hiçbir hermetic yolda ÇAĞRILMAMALI — çağrılırsa test düşer.
const gatedSpy = vi.fn();
vi.mock("@/lib/ai/generateGated", () => ({
  generateJsonGated: (...a: unknown[]) => {
    gatedSpy(...a);
    throw new Error("hermetic koşuda LLM çağrısı YASAK");
  },
}));

import { runRegistryContractEval } from "./registryContractRunner";
import { AGENT_EVAL_FIXTURES, type AgentEvalFixture } from "@/lib/agents/registry/fixtures";
import { AGENT_DEFINITIONS } from "@/lib/agents/registry/definitions";

beforeEach(() => {
  vi.clearAllMocks();
  createRun.mockResolvedValue({ id: "run-1" });
  finishRun.mockResolvedValue({ id: "run-1" });
  recordCase.mockResolvedValue({ id: "case-1" });
  reconcileStaleRunning.mockResolvedValue(0);
  traceCreate.mockResolvedValue({ id: "trace-1" });
  delete process.env.ENABLE_AGENT_CURATION;
});

describe("registry contract eval runner (ADR-034 §C)", () => {
  it("enabled her agent için ≥1 contract fixture var", () => {
    for (const def of AGENT_DEFINITIONS.filter((d) => d.status === "enabled")) {
      const fixtures = AGENT_EVAL_FIXTURES.filter((f) => f.agentId === def.id);
      expect(fixtures.length, def.id).toBeGreaterThanOrEqual(1);
      for (const f of fixtures) expect(f.contract, f.id).toBeDefined();
    }
  });

  it("live allowlist yalnız opportunity-curator + content-creator", () => {
    const allowed = new Set(
      AGENT_EVAL_FIXTURES.filter((f) => f.contract.liveAllowlisted).map((f) => f.agentId)
    );
    expect([...allowed].sort()).toEqual(["content-creator", "opportunity-curator"]);
  });

  it("tam deterministik koşu: tüm fixture'lar geçer, maliyet 0, LLM çağrısı YOK", async () => {
    const res = await runRegistryContractEval({ trigger: "manual" });
    expect(res.status).toBe("passed");
    expect(res.failed).toBe(0);
    expect(res.passed).toBe(AGENT_EVAL_FIXTURES.length);
    expect(res.totalCostUsd).toBe(0);
    expect(gatedSpy).not.toHaveBeenCalled();
    // Koşu + her case kaydedildi; stale reconciliation önce koştu.
    expect(reconcileStaleRunning).toHaveBeenCalled();
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "registry_contract", mode: "deterministic", trigger: "manual" })
    );
    expect(recordCase).toHaveBeenCalledTimes(AGENT_EVAL_FIXTURES.length);
    expect(finishRun).toHaveBeenCalledWith("run-1", expect.objectContaining({ status: "passed" }));
  });

  it("dry-run: hiçbir DB yazımı olmadan case listesi döner", async () => {
    const res = await runRegistryContractEval({ trigger: "manual", dryRun: true });
    expect(res.runId).toBeNull();
    expect(res.skipped).toBe(AGENT_EVAL_FIXTURES.length);
    expect(createRun).not.toHaveBeenCalled();
    expect(recordCase).not.toHaveBeenCalled();
  });

  it("--max-cases fixture listesini sınırlar", async () => {
    const res = await runRegistryContractEval({ trigger: "manual", maxCases: 3 });
    expect(res.cases).toHaveLength(3);
  });

  it("beklenen outcome ihlali case'i failed yapar → koşu partial", async () => {
    const bad: AgentEvalFixture = {
      ...AGENT_EVAL_FIXTURES[0],
      id: "expect-mismatch",
      contract: { expectedOutcomes: ["blocked_external"], deterministic: false, liveAllowlisted: false },
    };
    const res = await runRegistryContractEval({
      trigger: "manual",
      fixturesOverride: [AGENT_EVAL_FIXTURES.find((f) => f.id === "originality-basic")!, bad],
    });
    expect(res.passed).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.status).toBe("partial");
    const failedCase = res.cases.find((c) => c.caseKey === "expect-mismatch")!;
    expect(failedCase.violations[0]).toContain("beklenen outcome");
  });

  it("assertOutput ihlali failed sayılır (curation binding gerçek yoldan doğrulanır)", async () => {
    const curation = AGENT_EVAL_FIXTURES.find((f) => f.id === "curation-basic")!;
    const tampered: AgentEvalFixture = {
      ...curation,
      id: "curation-tampered-assert",
      contract: {
        ...curation.contract,
        assertOutput: () => ["kasıtlı ihlal"],
      },
    };
    const res = await runRegistryContractEval({ trigger: "manual", fixturesOverride: [tampered] });
    expect(res.failed).toBe(1);
    expect(res.cases[0].violations).toContain("kasıtlı ihlal");
  });

  it("hermetic adapter'ı olmayan agent fail-closed no_hermetic_adapter", async () => {
    const unknownAgent: AgentEvalFixture = {
      id: "ghost-fixture",
      agentId: "ghost-agent",
      description: "hermetic adapter yok",
      input: {},
      contract: { expectedOutcomes: ["succeeded"], deterministic: false, liveAllowlisted: false },
    };
    const res = await runRegistryContractEval({ trigger: "manual", fixturesOverride: [unknownAgent] });
    expect(res.cases[0].outcome).toBe("no_hermetic_adapter");
    expect(res.status).toBe("failed");
  });

  it("case persist hatası koşuyu partial + case_persist_failed yapar (sessiz kayıp yok)", async () => {
    recordCase.mockRejectedValue(new Error("db down"));
    const res = await runRegistryContractEval({
      trigger: "manual",
      fixturesOverride: [AGENT_EVAL_FIXTURES.find((f) => f.id === "originality-basic")!],
    });
    expect(res.status).toBe("partial");
    expect(finishRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ errorClass: "case_persist_failed" })
    );
  });

  it("traceStatus case kaydına taşınır (persisted | skipped_policy gözlemi)", async () => {
    await runRegistryContractEval({
      trigger: "manual",
      fixturesOverride: [
        AGENT_EVAL_FIXTURES.find((f) => f.id === "curation-basic")!, // tracePolicy always → persisted
        AGENT_EVAL_FIXTURES.find((f) => f.id === "originality-basic")!, // on_llm+deterministic+success → skipped_policy
      ],
    });
    const byKey = new Map(recordCase.mock.calls.map((c) => [c[0].caseKey, c[0]]));
    expect(byKey.get("curation-basic")!.traceStatus).toBe("persisted");
    expect(byKey.get("originality-basic")!.traceStatus).toBe("skipped_policy");
  });

  it("trace yazımı düşerse traceStatus=failed gözlenir (koşu yine değerlendirilir)", async () => {
    traceCreate.mockRejectedValue(new Error("trace db down"));
    const res = await runRegistryContractEval({
      trigger: "manual",
      fixturesOverride: [AGENT_EVAL_FIXTURES.find((f) => f.id === "curation-basic")!],
    });
    expect(res.cases[0].status).toBe("passed"); // sözleşme geçti; trace kaybı ayrı gözlem
    expect(res.cases[0].traceStatus).toBe("failed");
  });

  it("hermetic curation gerçek deterministik yolu koşar: method=deterministic, kaynak bağlaması sağlam", async () => {
    const res = await runRegistryContractEval({
      trigger: "manual",
      fixturesOverride: AGENT_EVAL_FIXTURES.filter((f) => f.agentId === "opportunity-curator"),
    });
    expect(res.failed).toBe(0);
    // Deterministik beklenti aktif: aynı girdi iki koşuda aynı çıktı (runner içinde doğrulandı).
    for (const c of res.cases) expect(c.outcome).toBe("succeeded");
  });
});
