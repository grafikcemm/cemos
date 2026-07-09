import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { pipelineService } from "@/lib/services/pipelineService";
import { cronRunRepo } from "@/lib/db/cronRunRepo";

vi.mock("@/lib/accounts", () => {
  const profiles = {
    grafikcem: { handle: "grafikcem" },
    maskulenkod: { handle: "maskulenkod" }
  };
  return {
    accountProfiles: profiles,
    accountList: Object.values(profiles)
  };
});

vi.mock("@/lib/services/pipelineService", () => ({
  pipelineService: {
    runDailyForAccount: vi.fn(() => Promise.resolve({ created: 1 }))
  }
}));

vi.mock("@/lib/db/cronRunRepo", () => ({
  cronRunRepo: {
    start: vi.fn(() => Promise.resolve({ id: "cr-1" })),
    finish: vi.fn(() => Promise.resolve(null))
  }
}));

// News stages are folded into the daily cron; mock them so this unit test
// never hits the real RSS/HN/GitHub network or the database.
vi.mock("@/lib/news/pipeline", () => ({ runPipelineTick: vi.fn(() => Promise.resolve({ processed: 0 })) }));
vi.mock("@/lib/news/hackernews", () => ({ syncHackerNews: vi.fn(() => Promise.resolve({ fetched: 0 })) }));
vi.mock("@/lib/news/repoRadar", () => ({ syncRepoRadar: vi.fn(() => Promise.resolve({ processed: 0 })) }));
vi.mock("@/lib/news/opportunities", () => ({ generateOpportunities: vi.fn(() => Promise.resolve({ created: 0 })) }));
vi.mock("@/lib/news/digest", () => ({ buildDailyDigest: vi.fn(() => Promise.resolve({ ok: true })) }));
// IG rakip sync (Sprint 4) — cron'a katlandı; testte LLM'siz/DB'siz mock.
vi.mock("@/lib/instagram/competitor/igCompetitorService", () => ({
  syncIgCompetitors: vi.fn(() =>
    Promise.resolve({ accounts: 0, synced: 0, itemsUpserted: 0, outliersScored: 0, errors: [] })
  ),
}));

function makeReq(method: "GET" | "POST", query = "", authHeader?: string) {
  return new NextRequest(`http://localhost:3000/api/cron/daily${query}`, {
    method,
    headers: authHeader ? { authorization: authHeader } : {}
  });
}

describe("/api/cron/daily", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps implementations — re-pin defaults so persistent
    // mockRejectedValue calls from one test never leak into the next.
    vi.mocked(pipelineService.runDailyForAccount).mockResolvedValue({ created: 1 } as never);
    vi.mocked(cronRunRepo.start).mockResolvedValue({ id: "cr-1" } as never);
    vi.mocked(cronRunRepo.finish).mockResolvedValue(null as never);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.CRON_TIME_BUDGET_MS;
  });

  it("GET runs light (mine:false) for all accounts and records a CronRun", async () => {
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(pipelineService.runDailyForAccount).toHaveBeenCalledTimes(2);
    expect(pipelineService.runDailyForAccount).toHaveBeenCalledWith("grafikcem", { mine: false });
    expect(cronRunRepo.start).toHaveBeenCalledWith("daily");
    expect(cronRunRepo.finish).toHaveBeenCalledWith(
      "cr-1",
      expect.objectContaining({ ok: true, partial: false })
    );
  });

  it("writes the CronRun heartbeat BEFORE running the pipeline (heartbeat-first)", async () => {
    await GET(makeReq("GET"));
    const startOrder = vi.mocked(cronRunRepo.start).mock.invocationCallOrder[0];
    const pipelineOrder = vi.mocked(pipelineService.runDailyForAccount).mock.invocationCallOrder[0];
    expect(startOrder).toBeLessThan(pipelineOrder);
  });

  it("POST runs full (mine:true) and honors ?handle=", async () => {
    const res = await POST(makeReq("POST", "?handle=grafikcem"));
    expect(res.status).toBe(200);
    expect(pipelineService.runDailyForAccount).toHaveBeenCalledTimes(1);
    expect(pipelineService.runDailyForAccount).toHaveBeenCalledWith("grafikcem", { mine: true });
  });

  it("keeps going when one account fails and still reports success", async () => {
    vi.mocked(pipelineService.runDailyForAccount)
      .mockRejectedValueOnce(new Error("kaboom"))
      .mockResolvedValue({ created: 1 } as never);

    const res = await GET(makeReq("GET"));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.results).toContainEqual({ handle: "grafikcem", error: "kaboom" });
    expect(cronRunRepo.finish).toHaveBeenCalledWith("cr-1", expect.objectContaining({ ok: true }));
  });

  it("reports ok:false when ALL accounts fail", async () => {
    vi.mocked(pipelineService.runDailyForAccount).mockRejectedValue(new Error("kaboom"));

    const res = await GET(makeReq("GET"));
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(cronRunRepo.finish).toHaveBeenCalledWith("cr-1", expect.objectContaining({ ok: false }));
  });

  it("returns 401 when CRON_SECRET is set and the bearer is missing", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(401);
    expect(pipelineService.runDailyForAccount).not.toHaveBeenCalled();
    expect(cronRunRepo.start).not.toHaveBeenCalled();
  });

  it("accepts the correct bearer when CRON_SECRET is set", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(makeReq("GET", "", "Bearer s3cret"));
    expect(res.status).toBe(200);
  });

  it("skips remaining accounts and marks partial when the time budget is exhausted", async () => {
    process.env.CRON_TIME_BUDGET_MS = "1";
    // Consume the whole 1ms budget before the account loop by delaying the
    // heartbeat write (awaited between t0 and the loop) deterministically.
    vi.mocked(cronRunRepo.start).mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 15));
      return { id: "cr-1" } as never;
    });
    const res = await GET(makeReq("GET"));
    const json = await res.json();
    expect(json.partial).toBe(true);
    expect(pipelineService.runDailyForAccount).not.toHaveBeenCalled();
    expect(json.results).toContainEqual({ handle: "grafikcem", skipped: "time_budget" });
    expect(cronRunRepo.finish).toHaveBeenCalledWith(
      "cr-1",
      expect.objectContaining({ partial: true })
    );
  });
});
