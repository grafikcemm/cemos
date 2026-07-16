import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * Registry + executor sözleşme testleri (ADR-027 §12 matrisi).
 * Tamamen deterministik — ağ/DB/ücret YOK (trace repo + gated primitive mock).
 */

const traceCreate = vi.fn().mockResolvedValue({ id: "trace-1" });
vi.mock("@/lib/db/pipelineTraceRepo", () => ({
  pipelineTraceRepo: {
    create: (input: unknown) => traceCreate(input),
  },
}));

const gatedCalls: unknown[] = [];
const usageLogWrites: unknown[] = [];
vi.mock("@/lib/ai/generateGated", () => ({
  generateJsonGated: vi.fn(async (opts: unknown) => {
    gatedCalls.push(opts);
    // Gerçek invariant'ın simülasyonu: gated primitive TEK UsageLog yazar.
    usageLogWrites.push({ purpose: (opts as { purpose?: string }).purpose });
    return {
      data: {
        selections: [
          {
            sourceId: "news-1",
            score: 90,
            reasons: {
              personaFit: "uyumlu",
              freshness: "taze",
              sourceDiversity: "çeşitli",
              concreteness: "somut",
              risk: "düşük",
            },
          },
        ],
      },
      model: "mock/model",
      actualCostUsd: 0.001,
    };
  }),
}));

import {
  AGENT_ADAPTERS,
  AGENT_DEFINITIONS,
  AGENT_ROLE_IDS,
  AgentBlockedError,
  collectRegistryProblems,
  executeAgent,
  fixtureById,
  getLostTraceCount,
  type AgentAdapter,
  type AgentDefinition,
} from "./index";

const PRODUCT_ROLES = [
  "cem-orchestrator",
  "trend-scout",
  "account-strategist",
  "content-creator",
  "viral-editor",
  "brand-guardian",
  "fact-checker",
  "originality-critic",
  "competitor-analyst",
  "reels-planner",
  "performance-learner",
  "knowledge-curator",
];

function defOf(id: string): AgentDefinition {
  const d = AGENT_DEFINITIONS.find((x) => x.id === id);
  if (!d) throw new Error(`tanım yok: ${id}`);
  return d;
}

function cloneDef(id: string, over: Partial<AgentDefinition>): AgentDefinition {
  return { ...defOf(id), ...over };
}

const CTX = { subjectType: "test", subjectId: "t-1" };

beforeEach(() => {
  traceCreate.mockClear();
  gatedCalls.length = 0;
  usageLogWrites.length = 0;
  delete process.env.ENABLE_AGENT_CURATION;
});

describe("registry doğrulaması (fail-fast)", () => {
  it("12 ürün rolünün tamamı registry'de", () => {
    for (const role of PRODUCT_ROLES) {
      expect(AGENT_ROLE_IDS, `${role} eksik`).toContain(role);
    }
    expect(AGENT_ROLE_IDS).toContain("opportunity-curator");
  });

  it("gerçek registry sıfır sorunla doğrulanır", () => {
    expect(collectRegistryProblems(AGENT_DEFINITIONS, AGENT_ADAPTERS)).toEqual([]);
  });

  it("duplicate id reddedilir", () => {
    const dup = [...AGENT_DEFINITIONS, cloneDef("fact-checker", {})];
    const problems = collectRegistryProblems(dup, AGENT_ADAPTERS);
    expect(problems.some((p) => p.includes("duplicate id"))).toBe(true);
  });

  it("adapter'sız aktif entry reddedilir", () => {
    const defs = [cloneDef("fact-checker", { adapterId: "yok-boyle-adapter" })];
    const problems = collectRegistryProblems(defs, AGENT_ADAPTERS);
    expect(problems.some((p) => p.includes("adapter'ı yok"))).toBe(true);
  });

  it("şemasız entry reddedilir", () => {
    const defs = [cloneDef("fact-checker", { inputSchema: null as never })];
    const problems = collectRegistryProblems(defs, AGENT_ADAPTERS);
    expect(problems.some((p) => p.includes("inputSchema"))).toBe(true);
  });

  it("LLM entry'si geçersiz preset ile reddedilir", () => {
    const defs = [cloneDef("account-strategist", { preset: "olmayan-preset" as never })];
    const problems = collectRegistryProblems(defs, AGENT_ADAPTERS);
    expect(problems.some((p) => p.includes("geçerli preset"))).toBe(true);
  });

  it("timeout ve retry sınırları zorlanır", () => {
    const defs = [
      cloneDef("fact-checker", { timeoutMs: 10 }),
      cloneDef("originality-critic", { retry: { maxAttempts: 9 } }),
    ];
    const problems = collectRegistryProblems(defs, AGENT_ADAPTERS);
    expect(problems.some((p) => p.includes("timeoutMs"))).toBe(true);
    expect(problems.some((p) => p.includes("retry.maxAttempts"))).toBe(true);
  });

  it("tanımsız capability reddedilir", () => {
    const defs = [cloneDef("fact-checker", { allowedCapabilities: ["hacker:mode" as never] })];
    const problems = collectRegistryProblems(defs, AGENT_ADAPTERS);
    expect(problems.some((p) => p.includes("tanımsız capability"))).toBe(true);
  });

  it("external provenance identity/memory YAZAMAZ", () => {
    const defs = [
      cloneDef("fact-checker", { provenance: "external", memoryWriteScopes: ["identity"] }),
    ];
    const problems = collectRegistryProblems(defs, AGENT_ADAPTERS);
    expect(problems.some((p) => p.includes("external provenance"))).toBe(true);
  });

  it("aktif entry fixture'sız reddedilir + fixture inputSchema'dan geçmeli", () => {
    const noFix = collectRegistryProblems([cloneDef("fact-checker", { evalFixtureIds: [] })], AGENT_ADAPTERS);
    expect(noFix.some((p) => p.includes("fixture gerektirir"))).toBe(true);
    // Şema uyuşmazlığı: strategist fixture'ını url-şemalı entry'e bağla.
    const badFix = collectRegistryProblems(
      [cloneDef("fact-checker", { evalFixtureIds: ["strategist-basic"] })],
      AGENT_ADAPTERS
    );
    expect(badFix.some((p) => p.includes("başka agent'a ait"))).toBe(true);
  });

  it("her aktif entry'nin fixture'ları kendi inputSchema'sından geçer", () => {
    for (const def of AGENT_DEFINITIONS.filter((d) => d.status === "enabled")) {
      for (const fid of def.evalFixtureIds) {
        const fx = fixtureById(fid);
        expect(fx, `${def.id}/${fid}`).toBeTruthy();
        expect(def.inputSchema.safeParse(fx!.input).success, `${def.id}/${fid} şemadan geçmeli`).toBe(true);
      }
    }
  });
});

describe("executor sözleşmesi", () => {
  it("capability allowlist dışı adapter koşusu reddedilir", async () => {
    const rogue: AgentAdapter = {
      id: "rogue",
      capabilitiesUsed: ["memory:write:identity"],
      memoryWritesUsed: [],
      run: async () => ({ output: {}, costUsd: 0 }),
    };
    const r = await executeAgent("fact-checker", { url: "https://example.com" }, { ...CTX, adapterOverride: rogue });
    expect(r.status).toBe("failed_execution");
    expect(r.errorMessage).toContain("Capability ihlali");
  });

  it("izin verilmeyen memory-write reddedilir", async () => {
    const rogue: AgentAdapter = {
      id: "rogue-mem",
      capabilitiesUsed: [],
      memoryWritesUsed: ["identity"],
      run: async () => ({ output: {}, costUsd: 0 }),
    };
    const r = await executeAgent("fact-checker", { url: "https://example.com" }, { ...CTX, adapterOverride: rogue });
    expect(r.status).toBe("failed_execution");
    expect(r.errorMessage).toContain("Memory-write ihlali");
  });

  it("girdi şema ihlali fail-closed (adapter hiç koşmaz)", async () => {
    const spy = vi.fn(async () => ({ output: {}, costUsd: 0 }));
    const adapter: AgentAdapter = { id: "spy", capabilitiesUsed: [], memoryWritesUsed: [], run: spy };
    const r = await executeAgent("fact-checker", { url: "geçersiz-url" }, { ...CTX, adapterOverride: adapter });
    expect(r.status).toBe("failed_validation");
    expect(spy).not.toHaveBeenCalled();
    expect(r.costUsd).toBe(0);
  });

  it("çıktı şema ihlali fail-closed; fallback yoksa failed_validation", async () => {
    const adapter: AgentAdapter = {
      id: "bad-out",
      capabilitiesUsed: [],
      memoryWritesUsed: [],
      run: async () => ({ output: { nearDuplicate: "evet-string" }, costUsd: 0 }),
    };
    const r = await executeAgent(
      "originality-critic",
      { text: "abc", corpus: [] },
      { ...CTX, adapterOverride: adapter }
    );
    expect(r.status).toBe("failed_validation");
    expect(r.output).toBeNull();
  });

  it("LLM blocked (bütçe/kredi) → deterministik fallback AÇIKÇA işaretlenir, ağ çağrısı YOK", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fixture = fixtureById("curation-basic")!;
    const r = await executeAgent("opportunity-curator", fixture.input, CTX);
    expect(r.status).toBe("deterministic_fallback");
    expect(r.fallbackUsed).toBe(true);
    expect(r.blockedReason).toBe("curation_agent_disabled");
    expect(r.costUsd).toBe(0);
    expect((r.output as { method: string }).method).toBe("deterministic");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(gatedCalls.length).toBe(0);
    fetchSpy.mockRestore();
  });

  it("timeout → timed_out", async () => {
    const never: AgentAdapter = {
      id: "never",
      capabilitiesUsed: [],
      memoryWritesUsed: [],
      run: () => new Promise(() => undefined),
    };
    const defs = [cloneDef("fact-checker", { timeoutMs: 1_000 })];
    const r = await executeAgent(
      "fact-checker",
      { url: "https://example.com" },
      { ...CTX, adapterOverride: never, definitionsOverride: defs }
    );
    expect(r.status).toBe("timed_out");
  }, 10_000);

  it("retry politikası: failed_execution retry edilir, sınırı aşınca hata döner", async () => {
    let calls = 0;
    const flaky: AgentAdapter = {
      id: "flaky",
      capabilitiesUsed: [],
      memoryWritesUsed: [],
      run: async () => {
        calls++;
        if (calls < 2) throw new Error("geçici hata");
        return { output: { nearDuplicate: false, matchedIndex: null }, costUsd: 0 };
      },
    };
    const defs = [cloneDef("originality-critic", { retry: { maxAttempts: 1 } })];
    const r = await executeAgent(
      "originality-critic",
      { text: "abc", corpus: [] },
      { ...CTX, adapterOverride: flaky, definitionsOverride: defs }
    );
    expect(r.status).toBe("succeeded");
    expect(r.retryCount).toBe(1);
    expect(calls).toBe(2);

    // Sınır aşımı: hep düşen adapter maxAttempts sonunda failed_execution.
    const alwaysFail: AgentAdapter = {
      id: "always-fail",
      capabilitiesUsed: [],
      memoryWritesUsed: [],
      run: async () => {
        throw new Error("kalıcı hata");
      },
    };
    const r2 = await executeAgent(
      "originality-critic",
      { text: "abc", corpus: [] },
      { ...CTX, adapterOverride: alwaysFail, definitionsOverride: defs }
    );
    expect(r2.status).toBe("failed_execution");
    expect(r2.errorMessage).toContain("kalıcı hata");
  });

  it("trace metadata tam: agentId/version/adapter/outcome/fallback/policyVersion", async () => {
    const fixture = fixtureById("curation-basic")!;
    await executeAgent("opportunity-curator", fixture.input, { ...CTX, platform: "x" });
    expect(traceCreate).toHaveBeenCalledTimes(1);
    const arg = traceCreate.mock.calls[0][0] as {
      pipelineId: string;
      stages: Array<Record<string, unknown>>;
    };
    expect(arg.pipelineId).toBe("agent_registry");
    const stage = arg.stages[0];
    expect(stage.agentId).toBe("opportunity-curator");
    expect(stage.agentVersion).toBe("1.0.0");
    expect(stage.adapterId).toBe("opportunity-curate");
    expect(stage.executionMode).toBe("hybrid");
    expect(stage.outcome).toBe("deterministic_fallback");
    expect(stage.fallbackUsed).toBe(true);
    expect(stage.blockedReason).toBe("curation_agent_disabled");
    expect(stage.policyVersion).toBe("2A");
    expect(typeof stage.ms).toBe("number");
  });

  it("trace yazımı düşerse üretim bloklanmaz ama kayıp ölçülür", async () => {
    traceCreate.mockRejectedValueOnce(new Error("db down"));
    const before = getLostTraceCount();
    const fixture = fixtureById("curation-basic")!;
    const r = await executeAgent("opportunity-curator", fixture.input, CTX);
    expect(r.status).toBe("deterministic_fallback");
    expect(getLostTraceCount()).toBe(before + 1);
  });

  it("tek model çağrısı tek UsageLog (gated primitive sahipliği; executor ikinci kez yazmaz)", async () => {
    process.env.ENABLE_AGENT_CURATION = "1";
    const fixture = fixtureById("curation-basic")!;
    const r = await executeAgent("opportunity-curator", fixture.input, CTX);
    expect(r.status).toBe("succeeded");
    expect(gatedCalls.length).toBe(1);
    expect(usageLogWrites.length).toBe(1); // gated primitive'in yazdığı TEK kayıt
    expect(r.fallbackUsed).toBe(false);
    expect((r.output as { method: string }).method).toBe("agent");
  });

  it("blocked-external entry adapter'a hiç inmez", async () => {
    const spy = vi.fn(async () => ({ output: {}, costUsd: 0 }));
    const defs = [cloneDef("fact-checker", { status: "blocked_external" })];
    const r = await executeAgent(
      "fact-checker",
      { url: "https://example.com" },
      { ...CTX, adapterOverride: { id: "spy", capabilitiesUsed: [], memoryWritesUsed: [], run: spy }, definitionsOverride: defs }
    );
    expect(r.status).toBe("blocked_external");
    expect(spy).not.toHaveBeenCalled();
    expect(r.costUsd).toBe(0);
  });

  it("AgentBlockedError blockedExternal işaretini taşır", () => {
    const e = new AgentBlockedError("test_reason");
    expect(e.blockedExternal).toBe(true);
    expect(e.reason).toBe("test_reason");
  });
});
