import { describe, it, expect, vi, beforeEach } from "vitest";
import { pipelineService } from "./pipelineService";
import { prisma } from "@/lib/db/client";
import { draftService } from "@/lib/services/draftService";
import { discoveryService } from "@/lib/services/discoveryService";
import { miningService } from "@/lib/services/miningService";
import { routeItem } from "@/lib/agents/router";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: { findUnique: vi.fn() },
    queueItem: { count: vi.fn(), findMany: vi.fn() },
    sourcePost: { findMany: vi.fn(), update: vi.fn() },
    newsItem: { findMany: vi.fn(), update: vi.fn() },
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
vi.mock("@/lib/agents/router", () => ({
  routeItem: vi.fn(() => Promise.resolve({ best: null, fits: [], usedLlm: false })),
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
    vi.mocked(prisma.newsItem.findMany).mockResolvedValue([] as never);
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

/**
 * VISION #8 köprüsü — SourcePost adayları kotayı dolduramazsa sabah üretimi
 * günlük haber havuzundan (NewsItem, analyzed + isUsed=false) tamamlanır.
 */
describe("pipelineService — NewsItem→taslak köprüsü (haber fallback)", () => {
  const newsRow = {
    id: "news-1",
    newsSourceId: "src-tc",
    url: "https://example.com/haber",
    originalTitle: "Original",
    trTitle: "Türkçe başlık",
    originalSummary: null,
    trSummary: "Türkçe özet",
    whyPeopleCare: "Önemli çünkü",
    tweetAngle: "Açı budur",
    suggestedFormat: "punch",
    imageUrl: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      id: "acc-1",
      handle: "grafikcem",
      schedule: { dailyMaxPosts: 1 },
    } as never);
    vi.mocked(prisma.queueItem.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([] as never);
    // clearAllMocks impl'i silmez; testler arası sızıntıyı önlemek için default'a sabitle.
    vi.mocked(routeItem).mockResolvedValue({ best: null, fits: [], usedLlm: false } as never);
  });

  it("SourcePost yoksa analyzed haberden taslak üretir ve isUsed=true işaretler", async () => {
    vi.mocked(prisma.newsItem.findMany).mockResolvedValue([newsRow] as never);
    vi.mocked(draftService.generateDraft).mockResolvedValue({ blocked: false } as never);

    const summary = await pipelineService.runDailyForAccount("grafikcem", {
      discover: false,
      mine: false,
    });

    expect(summary.created).toBe(1);
    expect(summary.newsCreated).toBe(1);
    expect(summary.reason).toBe("generated");
    // Grounding manuel köprüyle aynı kompozisyondan geçer; newsItemId bağlanır.
    expect(draftService.generateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        accountHandle: "grafikcem",
        newsItemId: "news-1",
        mode: "punch",
        sourceTweet: expect.stringContaining("Türkçe başlık"),
      })
    );
    expect(prisma.newsItem.update).toHaveBeenCalledWith({
      where: { id: "news-1" },
      data: { isUsed: true },
    });
    // Sorgu filtresi: yalnız analyzed + kullanılmamış + bu hesap için taslaklanmamış.
    expect(prisma.newsItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          processingStatus: "analyzed",
          isUsed: false,
          queueItems: { none: { accountId: "acc-1" } },
        }),
      })
    );
  });

  it("kota SourcePost ile dolduysa haber havuzuna HİÇ inilmez", async () => {
    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "sp-1" },
    ] as never);
    vi.mocked(draftService.generateDraft).mockResolvedValue({ blocked: false } as never);

    const summary = await pipelineService.runDailyForAccount("grafikcem", {
      discover: false,
      mine: false,
    });

    expect(summary.created).toBe(1);
    expect(summary.newsCreated).toBe(0);
    expect(prisma.newsItem.findMany).not.toHaveBeenCalled();
  });

  it("router haberi BAŞKA hesaba yönlendirirse bu hesap haberi atlar (LLM'e gitmez)", async () => {
    vi.mocked(prisma.newsItem.findMany).mockResolvedValue([newsRow] as never);
    vi.mocked(routeItem).mockResolvedValue({
      best: "maskulenkod",
      fits: [],
      usedLlm: true,
    } as never);

    const summary = await pipelineService.runDailyForAccount("grafikcem", {
      discover: false,
      mine: false,
    });

    expect(summary.newsCreated).toBe(0);
    expect(draftService.generateDraft).not.toHaveBeenCalled();
    expect(summary.reason).toBe("no_usable_candidates");
  });

  it("bütçe engeli haber döngüsünü de durdurur; haber isUsed kalmaz", async () => {
    vi.mocked(prisma.newsItem.findMany).mockResolvedValue([newsRow] as never);
    vi.mocked(draftService.generateDraft).mockResolvedValue({
      blocked: true,
      reason: "budget",
    } as never);

    const summary = await pipelineService.runDailyForAccount("grafikcem", {
      discover: false,
      mine: false,
    });

    expect(summary.created).toBe(0);
    expect(summary.reason).toBe("budget_exhausted");
    expect(prisma.newsItem.update).not.toHaveBeenCalled();
  });
});
