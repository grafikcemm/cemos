import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { miningService } from "@/lib/services/miningService";
import { engagementLearningService } from "@/lib/services/engagementLearningService";
import { cronRunRepo } from "@/lib/db/cronRunRepo";
import { getBudgetStatus } from "@/lib/config/costGate";
import { generateWeeklyLearningReport } from "@/lib/growth-engine/weekly-learning-report";

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
    syncForAccount: vi.fn(() => Promise.resolve({ matched: 0, reason: "no_candidates" })),
    syncInstagram: vi.fn(() => Promise.resolve({ reason: "no_snapshot", highs: 0, lows: 0 }))
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

vi.mock("@/lib/growth-engine/weekly-learning-report", () => ({
  generateWeeklyLearningReport: vi.fn(() => Promise.resolve({ summary: "ok" }))
}));

// News catch-up stage is folded into the learn cron; mock it (no network/DB).
vi.mock("@/lib/news/pipeline", () => ({
  runPipelineTick: vi.fn(() => Promise.resolve({ processed: 0 }))
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    sourcePost: { deleteMany: vi.fn(() => Promise.resolve({ count: 2 })) },
    scanRun: { deleteMany: vi.fn(() => Promise.resolve({ count: 1 })) },
    generationRun: { deleteMany: vi.fn(() => Promise.resolve({ count: 1 })) },
    newsItem: { deleteMany: vi.fn(() => Promise.resolve({ count: 0 })) },
    pipelineTrace: { deleteMany: vi.fn(() => Promise.resolve({ count: 0 })) }
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
    expect(engagementLearningService.syncInstagram).toHaveBeenCalledTimes(1);
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

  it("generates the weekly report on Istanbul Mondays", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-08T19:00:00.000Z")); // Monday evening Istanbul

    await GET(makeReq());

    expect(generateWeeklyLearningReport).toHaveBeenCalledWith({
      accountHandle: "all",
      dateRange: "last_7_days"
    });
  });

  it("does NOT generate the weekly report on other days", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-09T19:00:00.000Z")); // Tuesday

    await GET(makeReq());

    expect(generateWeeklyLearningReport).not.toHaveBeenCalled();
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

  it("runs retention pruning and reports the deleted counts", async () => {
    const res = await GET(makeReq());
    const json = await res.json();
    expect(json.pruned).toEqual({ sourcePosts: 2, scanRuns: 1, generationRuns: 1, cronRuns: 0, newsItems: 0, pipelineTraces: 0 });
  });
});
