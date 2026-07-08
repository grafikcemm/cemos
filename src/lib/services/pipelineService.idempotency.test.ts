import { describe, it, expect, vi, beforeEach } from "vitest";
import { pipelineService } from "./pipelineService";
import { prisma } from "@/lib/db/client";
import { draftService } from "@/lib/services/draftService";
import { discoveryService } from "@/lib/services/discoveryService";
import { miningService } from "@/lib/services/miningService";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: { findUnique: vi.fn() },
    queueItem: { count: vi.fn(), findMany: vi.fn() },
    sourcePost: { findMany: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/services/draftService", () => ({
  draftService: { generateDraft: vi.fn() },
}));
vi.mock("@/lib/services/discoveryService", () => ({
  discoveryService: { discoverForAccount: vi.fn() },
}));
vi.mock("@/lib/services/miningService", () => ({
  miningService: { mineTopItems: vi.fn() },
}));

/**
 * FIRST-SPRINT item 17 — idempotency: `generate-morning:{date}:{account}`.
 * Aynı gün+hesap için ikinci çağrı LLM'e ulaşmadan erken döner:
 * 0 yeni QueueItem, 0 UsageLog, 0 discovery/mining.
 */
describe("pipelineService — generate-morning idempotency (item 17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      id: "acc-1",
      handle: "grafikcem",
      schedule: { dailyMaxPosts: 3 },
    } as never);
  });

  it("bugün taslak varsa: erken dönüş — LLM/draft/discovery HİÇ çağrılmaz", async () => {
    vi.mocked(prisma.queueItem.count).mockResolvedValue(2 as never);

    const summary = await pipelineService.runDailyForAccount("grafikcem", {
      discover: false,
      mine: false,
      idempotent: true,
    });

    expect(summary.reason).toMatch(/^idempotent_skip:generate-morning:\d{4}-\d{2}-\d{2}:grafikcem$/);
    expect(summary.created).toBe(0);
    expect(summary.attempts).toBe(0);
    expect(summary.todayDrafts).toBe(2);
    // Sıfır yeni harcama kanıtı: draft üretimi ve keşif hiç tetiklenmedi.
    expect(draftService.generateDraft).not.toHaveBeenCalled();
    expect(discoveryService.discoverForAccount).not.toHaveBeenCalled();
    expect(miningService.mineTopItems).not.toHaveBeenCalled();
  });

  it("bugün taslak yoksa: normal akış devam eder (idempotent guard engellemez)", async () => {
    vi.mocked(prisma.queueItem.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([] as never);

    const summary = await pipelineService.runDailyForAccount("grafikcem", {
      discover: false,
      mine: false,
      idempotent: true,
    });

    expect(summary.reason).toBe("no_usable_candidates");
  });

  it("idempotent verilmezse eski davranış aynen korunur (quota top-up)", async () => {
    vi.mocked(prisma.queueItem.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([] as never);

    const summary = await pipelineService.runDailyForAccount("grafikcem", {
      discover: false,
      mine: false,
    });

    // Guard atlanır; kota bazlı hedef hesabı çalışır (3-1=2 hedef, aday yok).
    expect(summary.reason).toBe("no_usable_candidates");
    expect(summary.target).toBe(2);
  });
});
