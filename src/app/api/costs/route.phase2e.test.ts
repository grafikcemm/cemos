import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/costs evaluation bloğu (ADR-034 §I): evaluation harcaması
 * (budgetClass=evaluation VEYA eval_ prefix) production curation
 * harcamasından AYRI sınıflanır.
 */

const findMany = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: { usageLog: { findMany: (a: unknown) => findMany(a) } },
}));

vi.mock("@/lib/config/costLimits", () => ({
  getCostLimits: () => ({
    dailyTweetBudget: 100,
    maxSourcesPerAccount: 3,
    maxTweetsPerSource: 10,
    monthlyBudgetUsd: 10,
    costPerItem: 0.01,
    costPerGeneration: 0.02,
    evalMonthlyBudgetUsd: 0.5,
    evalSpendEnabled: false,
  }),
}));

vi.mock("@/lib/config/costGate", () => ({
  getBudgetStatus: vi.fn(() =>
    Promise.resolve({ allowed: true, spentUsd: 0, limitUsd: 10, remainingUsd: 10, providerUsageMonthlyUsd: null }),
  ),
}));

import { GET } from "./route";

const today = new Date().toISOString().slice(0, 10);

function row(over: Record<string, unknown>) {
  return {
    date: today,
    type: "openrouter",
    tweetCount: null,
    estimatedCostUsd: 0.01,
    provider: "openrouter",
    model: "m",
    meta: "{}",
    ...over,
  };
}

function sameOriginReq() {
  return new NextRequest("http://localhost:3000/api/costs", {
    headers: { "Sec-Fetch-Site": "same-origin" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/costs evaluation bloğu (ADR-034 §I)", () => {
  it("evaluation spend = budgetClass evaluation + eval_ prefix; curation AYRI", async () => {
    findMany.mockResolvedValue([
      row({ meta: JSON.stringify({ purpose: "writer_x_draft", budgetClass: "essential" }), estimatedCostUsd: 0.1 }),
      row({ meta: JSON.stringify({ purpose: "writer_x_draft", budgetClass: "evaluation" }), estimatedCostUsd: 0.02 }),
      row({ meta: JSON.stringify({ purpose: "eval_thread_smoke" }), estimatedCostUsd: 0.03 }),
      row({ meta: JSON.stringify({ purpose: "research_opportunity_curation", budgetClass: "background" }), estimatedCostUsd: 0.04 }),
    ]);
    const res = await GET(sameOriginReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.evaluation).toMatchObject({
      enabled: false,
      monthlyBudgetUsd: 0.5,
      monthSpendUsd: 0.05, // 0.02 + 0.03 — curation (0.04) ve essential (0.1) DAHİL DEĞİL
      curationMonthSpendUsd: 0.04,
    });
  });

  it("guard: same-origin dışı 403", async () => {
    const res = await GET(new NextRequest("http://localhost:3000/api/costs"));
    expect(res.status).toBe(403);
  });
});
