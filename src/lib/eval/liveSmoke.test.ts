import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Canlı smoke güvenlik davranışı (ADR-034 §J): kapılar eksikken HİÇBİR
 * OpenRouter/pipeline çağrısı yapılmaz; blocked_external EvalRun dürüstçe
 * kaydedilir. Thread smoke NO-PERSIST: queue create ASLA çağrılmaz.
 */

const createRun = vi.fn();
const finishRun = vi.fn();
const recordCase = vi.fn();
vi.mock("@/lib/db/evalRunRepo", () => ({
  evalRunRepo: {
    createRun: (i: unknown) => createRun(i),
    finishRun: (id: string, i: unknown) => finishRun(id, i),
    recordCase: (i: unknown) => recordCase(i),
  },
}));

const pipelineSpy = vi.fn();
vi.mock("@/lib/ai/draft-pipeline", () => ({
  runDraftPipeline: (...a: unknown[]) => {
    pipelineSpy(...a);
    throw new Error("kapılar kapalıyken pipeline çağrısı YASAK");
  },
}));

const queueCreateSpy = vi.fn();
vi.mock("@/lib/db/queueRepo", () => ({
  queueRepo: {
    create: (...a: unknown[]) => {
      queueCreateSpy(...a);
      throw new Error("thread smoke NO-PERSIST: queue create YASAK");
    },
  },
}));

const budgetSpy = vi.fn().mockResolvedValue({ allowed: true });
vi.mock("@/lib/config/costGate", () => ({
  getBudgetStatus: (...a: unknown[]) => budgetSpy(...a),
}));

import { runLiveEvalSmoke, liveSmokePreflight } from "./liveSmoke";

const KEYS = [
  "OPENROUTER_KEY_ROTATED_AT",
  "AI_EVAL_SPEND_ENABLED",
  "PHASE2E_LIVE_EVAL_APPROVED",
  "PHASE2E_LIVE_MAX_USD",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  createRun.mockImplementation(async (i: { kind: string }) => ({ id: `run-${i.kind}` }));
  finishRun.mockResolvedValue({});
  recordCase.mockResolvedValue({});
  budgetSpy.mockResolvedValue({ allowed: true });
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("liveSmoke güvenlik kapıları (ADR-034 §J)", () => {
  it("kapılar eksik → blocked_external; pipeline/queue ASLA çağrılmaz", async () => {
    const res = await runLiveEvalSmoke("manual");
    expect(res.status).toBe("blocked_external");
    expect(res.missing).toContain("OPENROUTER_KEY_ROTATED_AT");
    expect(res.totalCostUsd).toBe(0);
    expect(pipelineSpy).not.toHaveBeenCalled();
    expect(queueCreateSpy).not.toHaveBeenCalled();
    // Dürüst kayıt: iki kind için blocked_external EvalRun.
    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({ kind: "curator_live", mode: "live" }));
    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({ kind: "thread_smoke", mode: "live" }));
    const statuses = finishRun.mock.calls.map((c) => c[1].status);
    expect(statuses).toEqual(["blocked_external", "blocked_external"]);
  });

  it("preflight: kapılar eksikken bütçe okuması bile yapılmaz (ağ-öncesi kısa devre)", async () => {
    const pre = await liveSmokePreflight();
    expect(pre.allowed).toBe(false);
    expect(budgetSpy).not.toHaveBeenCalled();
  });

  it("kapılar açık ama evaluation bütçesi reddediyor → preflight KAPALI", async () => {
    process.env.OPENROUTER_KEY_ROTATED_AT = "2026-07-17";
    process.env.AI_EVAL_SPEND_ENABLED = "true";
    process.env.PHASE2E_LIVE_EVAL_APPROVED = "true";
    process.env.PHASE2E_LIVE_MAX_USD = "0.25";
    budgetSpy.mockResolvedValue({ allowed: false, reason: "evaluation_disabled" });
    const pre = await liveSmokePreflight();
    expect(pre.allowed).toBe(false);
    expect(pre.missing.some((m) => m.startsWith("budget:"))).toBe(true);
  });

  it("blocked kayıt yazımı düşse bile durum BLOCKED kalır (DB hatası sahte başarı üretmez)", async () => {
    createRun.mockRejectedValue(new Error("db down"));
    const res = await runLiveEvalSmoke("manual");
    expect(res.status).toBe("blocked_external");
    expect(res.curatorRunId).toBeNull();
    expect(res.notes.some((n) => n.includes("yazılamadı"))).toBe(true);
  });
});
