import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { miningService } from "@/lib/services/miningService";
import { engagementLearningService } from "@/lib/services/engagementLearningService";
import { cronRunRepo } from "@/lib/db/cronRunRepo";
import { getBudgetStatus } from "@/lib/config/costGate";

vi.mock("@/lib/accounts/profileRepository", () =>
  import("@/lib/accounts/profileRepository.testDouble").then((m) =>
    m.createProfileRepositoryTestDouble()
  )
);

vi.mock("@/lib/accounts", () => {
  const profiles = {
    grafikcem: { handle: "grafikcem" },
    maskulenkod: { handle: "maskulenkod" }
  };
  return { accountProfiles: profiles, accountList: Object.values(profiles) };
});

vi.mock("@/lib/services/miningService", () => ({
  miningService: { mineTopItems: vi.fn(() => Promise.resolve({ mined: 1 })) }
}));

vi.mock("@/lib/services/engagementLearningService", () => ({
  engagementLearningService: {
    syncForAccount: vi.fn(() => Promise.resolve({ matched: 0, reason: "no_candidates" }))
  }
}));

vi.mock("@/lib/db/cronRunRepo", () => ({
  cronRunRepo: {
    start: vi.fn(() => Promise.resolve({ id: "cr-learn-1" })),
    finish: vi.fn(() => Promise.resolve(null)),
    pruneOlderThan: vi.fn(() => Promise.resolve({ count: 0 }))
  }
}));

vi.mock("@/lib/config/costGate", () => ({
  getBudgetStatus: vi.fn(() =>
    Promise.resolve({ allowed: true, spentUsd: 1, limitUsd: 7, remainingUsd: 6 })
  )
}));

// News catch-up stage is folded into the learn cron; mock it (no network/DB).
vi.mock("@/lib/news/pipeline", () => ({
  runPipelineTick: vi.fn(() => Promise.resolve({ processed: 0 }))
}));

// Memory consolidation (Pazartesi bloğu) — mock: LLM/DB yok.
vi.mock("@/lib/memory/consolidation", () => ({
  runMemoryConsolidation: vi.fn(() =>
    Promise.resolve({ ran: true, extraction: [], decayRecomputed: 0, staleRejected: 0, contradictions: [] })
  )
}));

// Faz 2E (ADR-034 §H): registry eval blogu — dynamic import mock'lari.
const latestRunByKind = vi.fn((_k: string) => Promise.resolve(null as unknown));
vi.mock("@/lib/db/evalRunRepo", () => ({
  evalRunRepo: { latestRunByKind: (k: string) => latestRunByKind(k) }
}));
const runRegistryContractEval = vi.fn((_o: unknown) =>
  Promise.resolve({ runId: "run-weekly", status: "passed", passed: 16, failed: 0 })
);
vi.mock("@/lib/eval/registryContractRunner", () => ({
  runRegistryContractEval: (o: unknown) => runRegistryContractEval(o)
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    sourcePost: { deleteMany: vi.fn(() => Promise.resolve({ count: 2 })) },
    scanRun: { deleteMany: vi.fn(() => Promise.resolve({ count: 1 })) },
    generationRun: { deleteMany: vi.fn(() => Promise.resolve({ count: 1 })) },
    newsItem: { deleteMany: vi.fn(() => Promise.resolve({ count: 0 })) },
    pipelineTrace: { deleteMany: vi.fn(() => Promise.resolve({ count: 0 })) },
    learnProcessingJob: { deleteMany: vi.fn(() => Promise.resolve({ count: 0 })) }
  }
}));

function makeReq(query = "", authHeader?: string) {
  return new NextRequest(`http://localhost:3000/api/cron/learn${query}`, {
    method: "GET",
    headers: authHeader ? { authorization: authHeader } : {}
  });
}

describe("/api/cron/learn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(miningService.mineTopItems).mockResolvedValue({ mined: 1 } as never);
    vi.mocked(engagementLearningService.syncForAccount).mockResolvedValue({
      matched: 0,
      reason: "no_candidates"
    } as never);
    vi.mocked(cronRunRepo.start).mockResolvedValue({ id: "cr-learn-1" } as never);
    vi.mocked(getBudgetStatus).mockResolvedValue({
      allowed: true,
      spentUsd: 1,
      limitUsd: 7,
      remainingUsd: 6
    } as never);
    latestRunByKind.mockResolvedValue(null as never);
    runRegistryContractEval.mockResolvedValue({
      runId: "run-weekly",
      status: "passed",
      passed: 16,
      failed: 0
    } as never);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.CRON_TIME_BUDGET_MS;
    delete process.env.MINING_DAILY_LIMIT;
    vi.useRealTimers();
  });

  it("mines + engagement-syncs all accounts and records a learn CronRun", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(miningService.mineTopItems).toHaveBeenCalledTimes(2);
    expect(miningService.mineTopItems).toHaveBeenCalledWith("grafikcem", 2);
    expect(engagementLearningService.syncForAccount).toHaveBeenCalledTimes(2);
    expect(cronRunRepo.start).toHaveBeenCalledWith("learn");
    expect(cronRunRepo.finish).toHaveBeenCalledWith(
      "cr-learn-1",
      expect.objectContaining({ ok: true })
    );
  });

  it("writes the heartbeat BEFORE mining (heartbeat-first)", async () => {
    await GET(makeReq());
    const startOrder = vi.mocked(cronRunRepo.start).mock.invocationCallOrder[0];
    const mineOrder = vi.mocked(miningService.mineTopItems).mock.invocationCallOrder[0];
    expect(startOrder).toBeLessThan(mineOrder);
  });

  it("skips mining when the budget is exhausted but STILL runs engagement sync", async () => {
    vi.mocked(getBudgetStatus).mockResolvedValue({
      allowed: false,
      spentUsd: 7,
      limitUsd: 7,
      remainingUsd: 0
    } as never);

    const res = await GET(makeReq());
    const json = await res.json();
    expect(miningService.mineTopItems).not.toHaveBeenCalled();
    expect(engagementLearningService.syncForAccount).toHaveBeenCalledTimes(2);
    expect(json.results[0].mining).toEqual({ skipped: "budget_exhausted" });
  });

  it("MINING_DAILY_LIMIT=0 acts as a mining kill switch", async () => {
    process.env.MINING_DAILY_LIMIT = "0";
    const res = await GET(makeReq());
    const json = await res.json();
    expect(miningService.mineTopItems).not.toHaveBeenCalled();
    expect(json.results[0].mining).toEqual({ skipped: "mining_disabled" });
  });

  it("returns 401 without the bearer when CRON_SECRET is set", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(cronRunRepo.start).not.toHaveBeenCalled();
  });

  it("marks partial and skips accounts when the time budget is exhausted", async () => {
    process.env.CRON_TIME_BUDGET_MS = "1";
    vi.mocked(getBudgetStatus).mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 15));
      return { allowed: true, spentUsd: 1, limitUsd: 7, remainingUsd: 6 };
    });

    const res = await GET(makeReq());
    const json = await res.json();
    expect(json.partial).toBe(true);
    expect(miningService.mineTopItems).not.toHaveBeenCalled();
    expect(json.results).toContainEqual({ handle: "grafikcem", skipped: "time_budget" });
  });

  // ── Faz 2E (ADR-034 §H): haftalik registry contract eval ────────────────────
  describe("weekly registry contract eval", () => {
    const MONDAY = new Date("2026-07-20T18:00:00Z"); // Istanbul Pazartesi 21:00
    const THURSDAY = new Date("2026-07-16T18:00:00Z");

    it("Pazartesi + bu hafta kosu yok → deterministic eval cron trigger'iyla kosar", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(MONDAY);
      const res = await GET(makeReq());
      const json = await res.json();
      expect(runRegistryContractEval).toHaveBeenCalledWith(
        expect.objectContaining({ trigger: "cron" })
      );
      expect(json.registryEval).toMatchObject({ runId: "run-weekly", status: "passed" });
    });

    it("ayni hafta ikinci kosu idempotent atlanir", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(MONDAY);
      latestRunByKind.mockResolvedValue({
        id: "run-prev",
        trigger: "cron",
        startedAt: new Date(MONDAY.getTime() - 60 * 60 * 1000)
      } as never);
      const res = await GET(makeReq());
      const json = await res.json();
      expect(runRegistryContractEval).not.toHaveBeenCalled();
      expect(json.registryEval).toMatchObject({ skipped: "already_ran_this_week", runId: "run-prev" });
    });

    it("eval hatasi learn ingestion'i BOZMAZ (fail-open, partial degil hata alani)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(MONDAY);
      runRegistryContractEval.mockRejectedValue(new Error("runner exploded") as never);
      const res = await GET(makeReq());
      const json = await res.json();
      expect(json.success).toBe(true); // ana ingestion yasiyor
      expect(json.registryEval).toMatchObject({ error: "runner exploded" });
      expect(engagementLearningService.syncForAccount).toHaveBeenCalledTimes(2);
    });

    it("Pazartesi degilse eval hic kosmaz (canli/ucretli eval cron'dan default KOSMAZ)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(THURSDAY);
      const res = await GET(makeReq());
      const json = await res.json();
      expect(runRegistryContractEval).not.toHaveBeenCalled();
      expect(json.registryEval).toBeNull();
    });
  });

  it("runs retention pruning and reports the deleted counts", async () => {
    const res = await GET(makeReq());
    const json = await res.json();
    expect(json.pruned).toEqual({ sourcePosts: 2, scanRuns: 1, generationRuns: 1, cronRuns: 0, newsItems: 0, pipelineTraces: 0, learnJobs: 0 });
  });
});
