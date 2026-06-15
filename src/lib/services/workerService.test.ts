import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { workerService } from "./workerService";
import { prisma } from "@/lib/db/client";
import { scanService } from "@/lib/services/scanService";
import { draftService } from "@/lib/services/draftService";
import { cronRunRepo } from "@/lib/db/cronRunRepo";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    usageLog: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { tweetCount: 0 } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    sourcePost: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    queueItem: {
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
    schedule: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/services/scanService", () => ({
  scanService: {
    scanAccount: vi.fn(),
  },
}));

vi.mock("@/lib/services/draftService", () => ({
  draftService: {
    generateDraft: vi.fn(),
  },
}));

vi.mock("@/lib/db/cronRunRepo", () => ({
  cronRunRepo: {
    start: vi.fn(() => Promise.resolve({ id: "cr-1" })),
    finish: vi.fn(() => Promise.resolve(null)),
    hasRunning: vi.fn(() => Promise.resolve(false)),
  },
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

describe("workerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("scanTick", () => {
    it("should scan and draft for enabled accounts", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "acc_1",
          handle: "test",
          schedule: {
            automationEnabled: true,
            lastScanAt: null,
            dailyMaxPosts: 3,
          },
        },
         
      ] as any);
      vi.mocked(prisma.queueItem.count).mockResolvedValue(0);
      vi.mocked(scanService.scanAccount).mockResolvedValue({
        posts: [
          { id: "post_1", opportunityScore: 100 },
          { id: "post_2", opportunityScore: 90 },
        ]
         
      } as any);
      vi.mocked(prisma.queueItem.findFirst).mockResolvedValue(null);
       
      vi.mocked(draftService.generateDraft).mockResolvedValue({ blocked: false } as any);

      await workerService.scanTick();

      expect(scanService.scanAccount).toHaveBeenCalledWith("test", expect.any(Number));
      expect(draftService.generateDraft).toHaveBeenCalledTimes(2);
      expect(prisma.schedule.update).toHaveBeenCalled();
    });

    it("should skip if daily cap is reached", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "acc_1",
          handle: "test",
          schedule: {
            automationEnabled: true,
            lastScanAt: null,
            dailyMaxPosts: 3,
          },
        },
         
      ] as any);
      vi.mocked(prisma.queueItem.count).mockResolvedValue(3);

      await workerService.scanTick();

      expect(scanService.scanAccount).not.toHaveBeenCalled();
    });
    
    it("should skip recently scanned accounts", async () => {
      const recentDate = new Date();
      recentDate.setHours(recentDate.getHours() - 5);
      
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "acc_1",
          handle: "test",
          schedule: {
            automationEnabled: true,
            lastScanAt: recentDate,
            dailyMaxPosts: 3,
          },
        },
         
      ] as any);

      await workerService.scanTick();

      expect(scanService.scanAccount).not.toHaveBeenCalled();
    });

    it("should bypass recently scanned filter when force is true", async () => {
      const recentDate = new Date();
      recentDate.setHours(recentDate.getHours() - 5);
      
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "acc_1",
          handle: "test",
          schedule: {
            automationEnabled: true,
            lastScanAt: recentDate,
            dailyMaxPosts: 1,
          },
        },
      ] as any);
      vi.mocked(prisma.queueItem.count).mockResolvedValue(0);
      vi.mocked(scanService.scanAccount).mockResolvedValue({
        posts: [{ id: "post_1", opportunityScore: 100 }]
      } as any);
      vi.mocked(prisma.queueItem.findFirst).mockResolvedValue(null);
      vi.mocked(draftService.generateDraft).mockResolvedValue({ blocked: false } as any);

      await workerService.scanTick(new Date(), { force: true });

      expect(scanService.scanAccount).toHaveBeenCalledWith("test", expect.any(Number));
      expect(draftService.generateDraft).toHaveBeenCalledTimes(1);
    });

    it("should respect dailyMaxPosts: 1 limit when force is true", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "acc_1",
          handle: "test",
          schedule: {
            automationEnabled: true,
            lastScanAt: null,
            dailyMaxPosts: 1,
          },
        },
      ] as any);
      vi.mocked(prisma.queueItem.count).mockResolvedValue(0);
      vi.mocked(scanService.scanAccount).mockResolvedValue({
        posts: [
          { id: "post_1", opportunityScore: 100 },
          { id: "post_2", opportunityScore: 90 },
        ]
      } as any);
      vi.mocked(prisma.queueItem.findFirst).mockResolvedValue(null);
      vi.mocked(draftService.generateDraft).mockResolvedValue({ blocked: false } as any);

      const res = await workerService.scanTick(new Date(), { force: true });

      expect(scanService.scanAccount).toHaveBeenCalledWith("test", expect.any(Number));
      expect(draftService.generateDraft).toHaveBeenCalledTimes(1);
      expect(res.results![0].draftsCreated).toBe(1);
    });

    it("should prioritize backlog posts and avoid scan if draft is successfully created", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "acc_1",
          handle: "test",
          schedule: {
            automationEnabled: true,
            lastScanAt: null,
            dailyMaxPosts: 1,
          },
        },
      ] as any);
      vi.mocked(prisma.queueItem.count).mockResolvedValue(0);
      vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
        { id: "post_backlog", opportunityScore: 100 }
      ] as any);
      vi.mocked(prisma.queueItem.findMany).mockResolvedValue([]);
      vi.mocked(draftService.generateDraft).mockResolvedValue({ blocked: false } as any);

      const res = await workerService.scanTick(new Date(), { force: true });

      expect(scanService.scanAccount).not.toHaveBeenCalled();
      expect(draftService.generateDraft).toHaveBeenCalledTimes(1);
      expect(res.results![0].draftsCreated).toBe(1);
      expect(res.results![0].reason).toBe("existing_source_posts_used");
      expect(prisma.sourcePost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "post_backlog" },
          data: { status: "used" }
        })
      );
    });

    it("should try next backlog candidate if the first candidate is blocked by linting", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "acc_1",
          handle: "test",
          schedule: {
            automationEnabled: true,
            lastScanAt: null,
            dailyMaxPosts: 1,
          },
        },
      ] as any);
      vi.mocked(prisma.queueItem.count).mockResolvedValue(0);
      vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
        { id: "post_blocked", opportunityScore: 100 },
        { id: "post_good", opportunityScore: 90 }
      ] as any);
      vi.mocked(prisma.queueItem.findMany).mockResolvedValue([]);
      
      vi.mocked(draftService.generateDraft)
        .mockResolvedValueOnce({ blocked: true } as any)
        .mockResolvedValueOnce({ blocked: false } as any);

      const res = await workerService.scanTick(new Date(), { force: true });

      expect(draftService.generateDraft).toHaveBeenCalledTimes(2);
      expect(res.results![0].draftsCreated).toBe(1);
      expect(res.results![0].draftsBlocked).toBe(1);
      
      expect(prisma.sourcePost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "post_blocked" },
          data: { status: "blocked" }
        })
      );
      expect(prisma.sourcePost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "post_good" },
          data: { status: "used" }
        })
      );
    });
  });

  describe("scanTick on serverless (Vercel)", () => {
    beforeEach(() => {
      process.env.VERCEL = "1";
    });

    afterEach(() => {
      delete process.env.VERCEL;
    });

    it("never touches the filesystem and records a CronRun heartbeat", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([] as any);

      const res = await workerService.scanTick(new Date(), { force: true });

      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(cronRunRepo.start).toHaveBeenCalledWith("manual_scan");
      expect(cronRunRepo.finish).toHaveBeenCalledWith("cr-1", expect.objectContaining({ ok: true }));
      expect(res.success).toBe(true);
    });

    it("returns locked when another serverless scan is running", async () => {
      vi.mocked(cronRunRepo.hasRunning).mockResolvedValueOnce(true);

      const res = await workerService.scanTick(new Date(), { force: true });

      expect(res).toEqual({ success: false, reason: "locked" });
      expect(cronRunRepo.start).not.toHaveBeenCalled();
    });

    it("finishes the CronRun with ok:false when the scan throws", async () => {
      vi.mocked(prisma.account.findMany).mockRejectedValueOnce(new Error("db boom"));

      await expect(workerService.scanTick(new Date(), { force: true })).rejects.toThrow("db boom");

      expect(cronRunRepo.finish).toHaveBeenCalledWith(
        "cr-1",
        expect.objectContaining({ ok: false, error: expect.stringContaining("db boom") })
      );
    });

    it("still scans when CronRun heartbeat writes fail (best-effort)", async () => {
      vi.mocked(cronRunRepo.start).mockRejectedValueOnce(new Error("db down"));
      vi.mocked(prisma.account.findMany).mockResolvedValue([] as any);

      const res = await workerService.scanTick(new Date(), { force: true });

      expect(res.success).toBe(true);
      expect(cronRunRepo.finish).not.toHaveBeenCalled();
    });
  });
});
