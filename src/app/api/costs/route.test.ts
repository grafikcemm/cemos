import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { prisma } from "@/lib/db/client";
import { getBudgetStatus } from "@/lib/config/costGate";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { __resetDbCircuitForTests } from "@/lib/db/dbCircuit";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    usageLog: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/config/costGate", () => ({
  getBudgetStatus: vi.fn(),
}));
vi.mock("@/lib/config/costLimits", () => ({
  getCostLimits: () => ({
    monthlyBudgetUsd: 10,
    dailyTweetBudget: 100,
    maxSourcesPerAccount: 5,
    maxTweetsPerSource: 10,
    costPerItem: 0.0002,
    costPerGeneration: 0.01,
    evalSpendEnabled: false,
    evalMonthlyBudgetUsd: 2,
  }),
}));
vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

const makeReq = (qs = "") =>
  new NextRequest(`http://localhost:3000/api/costs${qs}`);

const todayStr = new Date().toISOString().slice(0, 10);

describe("GET /api/costs — WP-02d groupBy/aggregate ay görünümü", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDbCircuitForTests();
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
    vi.mocked(getBudgetStatus).mockResolvedValue({
      allowed: true,
      spentUsd: 1.5,
      providerUsageMonthlyUsd: null,
    } as never);
  });

  it("scope=today fast-path: single aggregate, no groupBy/findMany", async () => {
    vi.mocked(prisma.usageLog.aggregate).mockResolvedValue({
      _sum: { estimatedCostUsd: 0.1234 },
    } as never);
    const res = await GET(makeReq("?scope=today"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ today: { totalUsd: 0.1234 } });
    expect(prisma.usageLog.groupBy).not.toHaveBeenCalled();
    expect(prisma.usageLog.findMany).not.toHaveBeenCalled();
  });

  it("month view: NO full-row findMany — 2 groupBy + narrow meta-only select", async () => {
    vi.mocked(prisma.usageLog.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.usageLog.findMany).mockResolvedValue([] as never);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(prisma.usageLog.groupBy).toHaveBeenCalledTimes(2);
    expect(prisma.usageLog.findMany).toHaveBeenCalledTimes(1);
    const findManyArg = vi.mocked(prisma.usageLog.findMany).mock.calls[0][0] as {
      where: { meta?: unknown };
      select?: Record<string, boolean>;
    };
    // Yalnız meta'lı satırlar + dar kolon seti (tam gövde taşınmaz).
    expect(findManyArg.where.meta).toEqual({ not: null });
    expect(findManyArg.select).toEqual({
      meta: true,
      estimatedCostUsd: true,
      provider: true,
      type: true,
    });
  });

  it("reconstructs the full contract from grouped rows with line-item reconciliation", async () => {
    const groups = [
      // openrouter generation (meta'lı kısmı aşağıda metaRows'ta)
      {
        date: todayStr,
        provider: "openrouter",
        type: "generation",
        model: "anthropic/claude-sonnet-5",
        _sum: { estimatedCostUsd: 0.5, tweetCount: null },
        _count: { _all: 3 },
      },
      // socialdata scan
      {
        date: todayStr,
        provider: "socialdata",
        type: "scan",
        model: null,
        _sum: { estimatedCostUsd: 0.2, tweetCount: 1000 },
        _count: { _all: 2 },
      },
      // fal image
      {
        date: todayStr,
        provider: "fal",
        type: "image",
        model: null,
        _sum: { estimatedCostUsd: 0.1, tweetCount: null },
        _count: { _all: 1 },
      },
      // transcript
      {
        date: todayStr,
        provider: "gemini",
        type: "transcript",
        model: null,
        _sum: { estimatedCostUsd: 0.05, tweetCount: null },
        _count: { _all: 1 },
      },
    ];
    // meta'sız OR satırları: 1 generation (0.2, 1 çağrı) → draft_generation/(rol yolu)
    const nullMetaGroups = [
      {
        type: "generation",
        provider: "openrouter",
        _sum: { estimatedCostUsd: 0.2 },
        _count: { _all: 1 },
      },
      // OR olmayan meta'sız satır purpose'a KARIŞMAZ
      { type: "scan", provider: "socialdata", _sum: { estimatedCostUsd: 0.2 }, _count: { _all: 2 } },
    ];
    const metaRows = [
      {
        meta: JSON.stringify({ purpose: "draft_generation", preset: "creativeWriter" }),
        estimatedCostUsd: 0.25,
        provider: "openrouter",
        type: "generation",
      },
      {
        meta: JSON.stringify({ budgetClass: "evaluation", purpose: "eval_run" }),
        estimatedCostUsd: 0.05,
        provider: "openrouter",
        type: "generation",
      },
      {
        meta: JSON.stringify({ purpose: "research_opportunity_curation" }),
        estimatedCostUsd: 0.0,
        provider: "openrouter",
        type: "generation",
      },
    ];
    vi.mocked(prisma.usageLog.groupBy)
      .mockResolvedValueOnce(groups as never)
      .mockResolvedValueOnce(nullMetaGroups as never);
    vi.mocked(prisma.usageLog.findMany).mockResolvedValue(metaRows as never);

    const res = await GET(makeReq());
    const json = await res.json();

    // Toplamlar grouped satırlardan.
    expect(json.month.totalUsd).toBe(0.85);
    expect(json.today.totalUsd).toBe(0.85);
    expect(json.today.socialDataTweets).toBe(1000);
    // Satır kalemleri: Σ(lineItems) = ay toplamı (uzlaşma korunur).
    expect(json.lineItems.socialData).toMatchObject({ tweets: 1000, costUsd: 0.2 });
    expect(json.lineItems.openRouter.costUsd).toBe(0.5);
    expect(json.lineItems.fal).toMatchObject({ images: 1, costUsd: 0.1 });
    expect(json.lineItems.transcript).toMatchObject({ count: 1, costUsd: 0.05 });
    expect(
      json.lineItems.socialData.costUsd +
        json.lineItems.openRouter.costUsd +
        json.lineItems.fal.costUsd +
        json.lineItems.transcript.costUsd,
    ).toBeCloseTo(json.month.totalUsd, 5);
    // byModel grouped'dan birebir (calls = _count).
    expect(json.lineItems.openRouter.byModel).toEqual([
      { model: "anthropic/claude-sonnet-5", costUsd: 0.5, calls: 3 },
    ]);
    // byPurpose: meta'lı 0.25+0.05+0.0 + meta'sız fallback 0.2 → draft_generation
    // 0.45 (meta 0.25 + null 0.2), eval_run yok (purpose eval_run 0.05), curation 0.
    const purposes = Object.fromEntries(
      json.lineItems.openRouter.byPurpose.map((p: { purpose: string; costUsd: number; calls: number }) => [
        p.purpose,
        p,
      ]),
    );
    expect(purposes.draft_generation).toMatchObject({ costUsd: 0.45, calls: 2 });
    expect(purposes.eval_run).toMatchObject({ costUsd: 0.05, calls: 1 });
    expect(purposes.research_opportunity_curation).toMatchObject({ calls: 1 });
    // byPreset: creativeWriter 0.25; "(rol yolu)" = meta'sız 0.2 + preset'siz meta'lı 0.05+0.0.
    const presets = Object.fromEntries(
      json.lineItems.openRouter.byPreset.map((p: { preset: string; costUsd: number }) => [p.preset, p.costUsd]),
    );
    expect(presets["creativeWriter"]).toBe(0.25);
    expect(presets["(rol yolu)"]).toBeCloseTo(0.25, 5);
    // Evaluation ayrımı (yalnız meta'dan) + curation.
    expect(json.evaluation.monthSpendUsd).toBe(0.05);
    expect(json.evaluation.curationMonthSpendUsd).toBe(0);
    // dailySeries bugünkü bucket'ı doldurur.
    const todayBucket = json.dailySeries.find((d: { date: string }) => d.date === todayStr);
    expect(todayBucket).toMatchObject({ totalUsd: 0.85, socialDataUsd: 0.2, openRouterUsd: 0.5 });
    // Bütçe uygulama gerçeği.
    expect(json.month.openRouterEnforcedUsd).toBe(1.5);
  });

  it("403 when unauthorized", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it("DB-unavailable → structured 503 db_unavailable (both paths)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const prismaInit = Object.assign(new Error("Can't reach database server at `ep-x:5432`"), {
      name: "PrismaClientInitializationError",
    });
    vi.mocked(prisma.usageLog.aggregate).mockRejectedValue(prismaInit);
    const fast = await GET(makeReq("?scope=today"));
    expect(fast.status).toBe(503);
    expect(((await fast.json()) as { code?: string }).code).toBe("db_unavailable");

    vi.mocked(prisma.usageLog.groupBy).mockRejectedValue(prismaInit);
    const main = await GET(makeReq());
    expect(main.status).toBe(503);
    expect(((await main.json()) as { code?: string }).code).toBe("db_unavailable");
    vi.restoreAllMocks();
  });
});
