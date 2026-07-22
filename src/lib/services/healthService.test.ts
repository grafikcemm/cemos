import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { healthService } from "./healthService";
import { prisma } from "@/lib/db/client";
import { getDigestForDate } from "@/lib/news/digest";
import * as fs from "fs";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: {
      count: vi.fn(),
    },
    cronRun: {
      findFirst: vi.fn(),
    },
    schedule: {
      findFirst: vi.fn(),
    },
    queueItem: {
      findFirst: vi.fn(),
    },
    newsItem: {
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/news/digest", () => ({
  getDigestForDate: vi.fn(),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe("healthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.SOCIALDATA_API_KEY;
    // newsPipeline defaults: empty pool, no digest (fail-open keeps older tests green)
    vi.mocked(prisma.newsItem.count).mockResolvedValue(0);
    vi.mocked(getDigestForDate).mockResolvedValue(null as never);
  });

  it("should return correct configuration statuses when environment variables are missing", async () => {
    vi.mocked(prisma.account.count).mockResolvedValue(3);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const health = await healthService.getHealth();

    expect(health.openrouter.configured).toBe(false);
    expect(health.openrouter.ok).toBe(false);
    expect(health.socialdata.configured).toBe(false);
    expect(health.socialdata.ok).toBe(false);
    expect(health.database.ok).toBe(true);
    expect(health.worker.inferredStatus).toBe("unknown");
  });

  it("should return ok if api keys are fully configured and work", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-...";
    process.env.SOCIALDATA_API_KEY = "sd-...";

    vi.mocked(prisma.account.count).mockResolvedValue(3);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ lastTickAt: new Date().toISOString() })
    );

    const health = await healthService.getHealth();

    expect(health.openrouter.configured).toBe(true);
    expect(health.openrouter.ok).toBe(true);
    expect(health.socialdata.configured).toBe(true);
    expect(health.socialdata.ok).toBe(true);
    expect(health.database.ok).toBe(true);
    expect(health.worker.inferredStatus).toBe("recent_tick");
  });

  it("should return stale if worker heartbeat exists but is too old", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-...";
    process.env.SOCIALDATA_API_KEY = "sd-...";

    vi.mocked(prisma.account.count).mockResolvedValue(3);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    
    const staleTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 mins ago
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ lastTickAt: staleTime })
    );

    const health = await healthService.getHealth();
    expect(health.worker.inferredStatus).toBe("stale");
  });

  describe("serverless (Vercel) cron freshness via CronRun", () => {
    beforeEach(() => {
      process.env.VERCEL = "1";
      vi.mocked(prisma.account.count).mockResolvedValue(3);
      vi.mocked(prisma.schedule.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.queueItem.findFirst).mockResolvedValue(null);
    });

    afterEach(() => {
      delete process.env.VERCEL;
    });

    const makeCronRun = (overrides: Record<string, unknown> = {}) => ({
      id: "cr-1",
      kind: "daily",
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
      finishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 30_000),
      ok: true,
      partial: false,
      resultJson: "{}",
      error: null,
      ...overrides,
    });

    it("reports recent_tick from a fresh CronRun and exposes lastCronRun", async () => {
      vi.mocked(prisma.cronRun.findFirst).mockResolvedValue(makeCronRun() as never);

      const health = await healthService.getHealth();

      expect(health.worker.mode).toBe("cron");
      expect(health.worker.inferredStatus).toBe("recent_tick");
      expect(health.worker.lastCronRun).toMatchObject({ kind: "daily", ok: true });
    });

    it("reports stale with the cron-check recommendation when CronRun is too old", async () => {
      vi.mocked(prisma.cronRun.findFirst).mockResolvedValue(
        makeCronRun({ startedAt: new Date(Date.now() - 30 * 60 * 60 * 1000) }) as never
      );

      const health = await healthService.getHealth();

      expect(health.worker.inferredStatus).toBe("stale");
      expect(health.worker.recommendation).toContain("saat önce");
    });

    it("says the cron RAN but errored when the latest run finished with ok:false", async () => {
      vi.mocked(prisma.cronRun.findFirst).mockResolvedValue(
        makeCronRun({ ok: false, error: "budget_exhausted" }) as never
      );

      const health = await healthService.getHealth();

      expect(health.worker.recommendation).toContain("Son cron çalıştı fakat hata verdi");
      expect(health.worker.recommendation).toContain("budget_exhausted");
    });

    it("falls back to schedule/queueItem inference when no CronRun rows exist", async () => {
      vi.mocked(prisma.cronRun.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
        lastScanAt: new Date(Date.now() - 60 * 60 * 1000),
      } as never);

      const health = await healthService.getHealth();

      expect(health.worker.inferredStatus).toBe("recent_tick");
      expect(health.worker.lastCronRun).toBeUndefined();
    });
  });

  describe("newsPipeline result-level health", () => {
    beforeEach(() => {
      vi.mocked(prisma.account.count).mockResolvedValue(2);
      vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    const okCronRun = {
      id: "cr-news",
      kind: "news_run",
      startedAt: new Date(),
      finishedAt: new Date(),
      ok: true,
      partial: false,
      resultJson: "{}",
      error: null,
    };

    it("reports RED when the last news run is ok but nothing got analyzed", async () => {
      // call order: rawBacklog, translatedLast24h, analyzedLast24h, failedBacklog
      vi.mocked(prisma.newsItem.count)
        .mockResolvedValueOnce(96) // rawBacklog
        .mockResolvedValueOnce(0) // translatedLast24h
        .mockResolvedValueOnce(0) // analyzedLast24h
        .mockResolvedValueOnce(0); // failedBacklog
      vi.mocked(prisma.cronRun.findFirst).mockResolvedValue(okCronRun as never);
      vi.mocked(getDigestForDate).mockResolvedValue(null as never);

      const health = await healthService.getHealth();

      expect(health.newsPipeline.status).toBe("red");
      expect(health.newsPipeline).toMatchObject({ rawBacklog: 96, analyzedLast24h: 0 });
    });

    it("reports GREEN when news got analyzed and the digest exists", async () => {
      vi.mocked(prisma.newsItem.count)
        .mockResolvedValueOnce(3) // rawBacklog
        .mockResolvedValueOnce(12) // translatedLast24h
        .mockResolvedValueOnce(9) // analyzedLast24h
        .mockResolvedValueOnce(1); // failedBacklog
      vi.mocked(prisma.cronRun.findFirst).mockResolvedValue(okCronRun as never);
      vi.mocked(getDigestForDate).mockResolvedValue({
        id: "d1",
        date: "2026-06-11",
        newsSummary: "Bugün öne çıkan haberler...",
        repoSummary: "Trend repolar...",
        aiTips: "3 ipucu",
      } as never);

      const health = await healthService.getHealth();

      expect(health.newsPipeline.status).toBe("green");
      expect(health.newsPipeline).toMatchObject({ analyzedLast24h: 9, digestToday: true });
    });

    it("treats an EMPTY digest row as no-digest (yellow), not a false green", async () => {
      // rawBacklog 3 (<30), analyzed 9 → not red/backlog; a content-less digest
      // row must fall to the !digestToday yellow branch, not read as green.
      vi.mocked(prisma.newsItem.count)
        .mockResolvedValueOnce(3) // rawBacklog
        .mockResolvedValueOnce(12) // translatedLast24h
        .mockResolvedValueOnce(9) // analyzedLast24h
        .mockResolvedValueOnce(0); // failedBacklog
      vi.mocked(prisma.cronRun.findFirst).mockResolvedValue(okCronRun as never);
      vi.mocked(getDigestForDate).mockResolvedValue({
        id: "d-empty",
        date: "2026-06-11",
        newsSummary: "",
        repoSummary: "",
        aiTips: "",
      } as never);

      const health = await healthService.getHealth();

      expect(health.newsPipeline).toMatchObject({ digestToday: false, status: "yellow" });
    });

    it("reports YELLOW when the raw backlog piles up", async () => {
      vi.mocked(prisma.newsItem.count)
        .mockResolvedValueOnce(45) // rawBacklog
        .mockResolvedValueOnce(5) // translatedLast24h
        .mockResolvedValueOnce(5) // analyzedLast24h
        .mockResolvedValueOnce(0); // failedBacklog
      vi.mocked(prisma.cronRun.findFirst).mockResolvedValue(okCronRun as never);
      vi.mocked(getDigestForDate).mockResolvedValue({ id: "d1", date: "2026-06-11" } as never);

      const health = await healthService.getHealth();

      expect(health.newsPipeline.status).toBe("yellow");
    });
  });
});
