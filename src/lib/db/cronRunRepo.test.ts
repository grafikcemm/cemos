import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRun = {
  id: "cr-1",
  kind: "daily",
  startedAt: new Date("2026-06-09T06:00:00.000Z"),
  finishedAt: null,
  ok: false,
  partial: false,
  resultJson: "{}",
  error: null,
};

vi.mock("@/lib/db/client", () => ({
  prisma: {
    cronRun: {
      create: vi.fn(() => Promise.resolve(mockRun)),
      update: vi.fn(() => Promise.resolve({ ...mockRun, ok: true })),
      findFirst: vi.fn(() => Promise.resolve(mockRun)),
      deleteMany: vi.fn(() => Promise.resolve({ count: 3 })),
    },
  },
}));

import { prisma } from "@/lib/db/client";
import { cronRunRepo } from "./cronRunRepo";

describe("cronRunRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("start creates a heartbeat row with the given kind", async () => {
    const run = await cronRunRepo.start("daily");
    expect(prisma.cronRun.create).toHaveBeenCalledWith({ data: { kind: "daily" } });
    expect(run).toEqual(mockRun);
  });

  it("finish sets finishedAt, ok and serialized resultJson", async () => {
    await cronRunRepo.finish("cr-1", { ok: true, partial: true, result: { results: [1, 2] } });
    expect(prisma.cronRun.update).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(prisma.cronRun.update).mock.calls[0][0];
    expect(arg.where).toEqual({ id: "cr-1" });
    expect(arg.data.ok).toBe(true);
    expect(arg.data.partial).toBe(true);
    expect(arg.data.finishedAt).toBeInstanceOf(Date);
    expect(arg.data.resultJson).toBe(JSON.stringify({ results: [1, 2] }));
  });

  it("finish records the error message when given", async () => {
    await cronRunRepo.finish("cr-1", { ok: false, error: "boom" });
    const arg = vi.mocked(prisma.cronRun.update).mock.calls[0][0];
    expect(arg.data.ok).toBe(false);
    expect(arg.data.error).toBe("boom");
  });

  it("finish never throws on DB failure (best-effort)", async () => {
    vi.mocked(prisma.cronRun.update).mockRejectedValueOnce(new Error("db down"));
    await expect(cronRunRepo.finish("cr-1", { ok: true })).resolves.toBeNull();
  });

  it("latest returns the most recent run by startedAt", async () => {
    await cronRunRepo.latest();
    expect(prisma.cronRun.findFirst).toHaveBeenCalledWith({
      orderBy: { startedAt: "desc" },
    });
  });

  it("latestByKind filters on kind", async () => {
    await cronRunRepo.latestByKind("learn");
    expect(prisma.cronRun.findFirst).toHaveBeenCalledWith({
      where: { kind: "learn" },
      orderBy: { startedAt: "desc" },
    });
  });

  it("hasRunning returns true when an unfinished recent run exists", async () => {
    const result = await cronRunRepo.hasRunning("manual_scan");
    expect(result).toBe(true);
    const arg = vi.mocked(prisma.cronRun.findFirst).mock.calls[0]?.[0] as {
      where: { kind: string; finishedAt: Date | null; startedAt: { gt: Date } };
    };
    expect(arg.where.kind).toBe("manual_scan");
    expect(arg.where.finishedAt).toBeNull();
    expect(arg.where.startedAt.gt).toBeInstanceOf(Date);
  });

  it("hasRunning returns false when no unfinished run exists", async () => {
    vi.mocked(prisma.cronRun.findFirst).mockResolvedValueOnce(null);
    const result = await cronRunRepo.hasRunning("manual_scan");
    expect(result).toBe(false);
  });

  it("hasRunning fails open (false) on DB error so scans are never blocked", async () => {
    vi.mocked(prisma.cronRun.findFirst).mockRejectedValueOnce(new Error("db down"));
    const result = await cronRunRepo.hasRunning("manual_scan");
    expect(result).toBe(false);
  });

  it("pruneOlderThan deletes runs older than the cutoff", async () => {
    await cronRunRepo.pruneOlderThan(60);
    const arg = vi.mocked(prisma.cronRun.deleteMany).mock.calls[0]?.[0] as {
      where: { startedAt: { lt: Date } };
    };
    expect(arg.where.startedAt.lt).toBeInstanceOf(Date);
    const cutoff = arg.where.startedAt.lt as Date;
    const expectedMs = Date.now() - 60 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expectedMs)).toBeLessThan(5000);
  });
});
