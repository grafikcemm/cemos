import { describe, it, expect, vi, beforeEach } from "vitest";
import { operatorReadinessService } from "./operatorReadinessService";
import { prisma } from "@/lib/db/client";
import { healthService } from "@/lib/services/healthService";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: {
      findMany: vi.fn()
    },
    queueItem: {
      count: vi.fn()
    },
    usageLog: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/services/healthService", () => ({
  healthService: {
    getHealth: vi.fn()
  }
}));

describe("operatorReadinessService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("taslak yoksa NOT ready döner; worker/otomasyon/cadence sapmaları uyarıdır (bloklamaz)", async () => {
    vi.mocked(healthService.getHealth).mockResolvedValue({
      openrouter: { ok: true },
      socialdata: { ok: true },
      database: { ok: true },
      worker: { inferredStatus: "stale" }
    } as any);

    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: "acc-1", handle: "grafikcem", schedule: { automationEnabled: false, cadence: "daily", dailyMaxPosts: 1 } },
      { id: "acc-2", handle: "maskulenkod", schedule: { automationEnabled: true, cadence: "monday", dailyMaxPosts: 2 } }
    ] as any);

    vi.mocked(prisma.queueItem.count).mockResolvedValue(0);
    vi.mocked(prisma.usageLog.findMany).mockResolvedValue([]);

    const res = await operatorReadinessService.getReadiness();

    // Tek gerçek blocker = taslak yokluğu.
    expect(res.ready).toBe(false);
    expect(res.checks.workerRecent).toBe(false);
    expect(res.checks.automationEnabled).toBe(false);
    expect(res.checks.cadenceDaily).toBe(false);
    expect(res.checks.dailyMaxPostsOne).toBe(false);
    expect(res.checks.todayItemsPerfect).toBe(false);
    // Worker / otomasyon / cadence → uyarı.
    expect(res.warnings).toContain(
      "Worker çalışmıyor veya güncel değil (stale) — yarının otomatik üretimi için worker'ı çalıştırın."
    );
    expect(res.warnings).toContain("grafikcem otomasyonu kapalı — otomatik üretim için Ayarlar'dan açın.");
    expect(res.warnings).toContain("maskulenkod günlük tarama modunda değil.");
    // Taslak yokluğu → blocker (issue).
    expect(res.issues).toContain("grafikcem için bugün taslak yok.");
    expect(res.issues).toContain("maskulenkod için bugün taslak yok.");
  });

  it("should return ready if all conditions are met perfectly", async () => {
    vi.mocked(healthService.getHealth).mockResolvedValue({
      openrouter: { ok: true },
      socialdata: { ok: true },
      database: { ok: true },
      worker: { inferredStatus: "recent_tick" }
    } as any);

    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: "acc-1", handle: "grafikcem", schedule: { automationEnabled: true, cadence: "daily", dailyMaxPosts: 1 } },
      { id: "acc-2", handle: "maskulenkod", schedule: { automationEnabled: true, cadence: "daily", dailyMaxPosts: 1 } }
    ] as any);

    vi.mocked(prisma.queueItem.count).mockResolvedValue(1);
    vi.mocked(prisma.usageLog.findMany).mockResolvedValue([]);

    const res = await operatorReadinessService.getReadiness();

    expect(res.ready).toBe(true);
    expect(res.readyWithWarning).toBe(false);
    expect(res.checks.workerRecent).toBe(true);
    expect(res.checks.automationEnabled).toBe(true);
    expect(res.checks.cadenceDaily).toBe(true);
    expect(res.checks.dailyMaxPostsOne).toBe(true);
    expect(res.checks.todayItemsPerfect).toBe(true);
    expect(res.issues.length).toBe(0);
  });

  it("should return ready with warning if worker is stale but all other critical conditions are met perfectly", async () => {
    vi.mocked(healthService.getHealth).mockResolvedValue({
      openrouter: { ok: true },
      socialdata: { ok: true },
      database: { ok: true },
      worker: { inferredStatus: "stale" }
    } as any);

    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: "acc-1", handle: "grafikcem", schedule: { automationEnabled: true, cadence: "daily", dailyMaxPosts: 1 } },
      { id: "acc-2", handle: "maskulenkod", schedule: { automationEnabled: true, cadence: "daily", dailyMaxPosts: 1 } }
    ] as any);

    vi.mocked(prisma.queueItem.count).mockResolvedValue(1);
    vi.mocked(prisma.usageLog.findMany).mockResolvedValue([]);

    const res = await operatorReadinessService.getReadiness();

    expect(res.ready).toBe(true);
    expect(res.readyWithWarning).toBe(true);
    expect(res.checks.workerRecent).toBe(false);
    expect(res.warnings).toContain(
      "Worker çalışmıyor veya güncel değil (stale) — yarının otomatik üretimi için worker'ı çalıştırın."
    );
    expect(res.issues.length).toBe(0);
  });
});
