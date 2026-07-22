import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/usageService", () => ({
  usageService: {
    getMonthlyOpenRouterCost: vi.fn(),
    getMonthlySpendByBudgetClass: vi.fn(),
  },
}));

vi.mock("@/lib/ai/openrouter-key-status", () => ({
  getOpenRouterKeyStatus: vi.fn(),
}));

import { getOpenRouterKeyStatus } from "@/lib/ai/openrouter-key-status";
import { usageService } from "@/lib/services/usageService";
import {
  assertGenerationAllowed,
  BudgetExceededError,
  getBudgetStatus,
  inferAiBudgetClass,
} from "./costGate";

describe("costGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MONTHLY_AI_BUDGET_USD = "10";
    process.env.AI_BUDGET_PACING_ENABLED = "false";
    process.env.AI_MONTHLY_RESERVE_USD = "1";
    process.env.AI_BACKGROUND_BUDGET_RATIO = "0.3";
    delete process.env.AI_EVAL_SPEND_ENABLED;
    process.env.AI_EVAL_MONTHLY_BUDGET_USD = "0.5";
    vi.mocked(usageService.getMonthlyOpenRouterCost).mockResolvedValue(1);
    vi.mocked(usageService.getMonthlySpendByBudgetClass).mockResolvedValue(0);
    vi.mocked(getOpenRouterKeyStatus).mockResolvedValue(null);
  });

  it("allows a request whose estimated ceiling fits the hard limit", async () => {
    const status = await getBudgetStatus({ estimatedCostUsd: 0.25 });
    expect(status.allowed).toBe(true);
    expect(status.remainingUsd).toBeCloseTo(9);
    await expect(assertGenerationAllowed({ estimatedCostUsd: 0.25 })).resolves.toBeUndefined();
  });

  it("blocks before the request ceiling can cross the monthly limit", async () => {
    vi.mocked(usageService.getMonthlyOpenRouterCost).mockResolvedValue(9.9);
    const status = await getBudgetStatus({ estimatedCostUsd: 0.2 });
    expect(status.reason).toBe("monthly_limit");
    await expect(assertGenerationAllowed({ estimatedCostUsd: 0.2 })).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
  });

  it("uses the larger provider usage when the local ledger missed spend", async () => {
    vi.mocked(getOpenRouterKeyStatus).mockResolvedValue({
      limitUsd: 5,
      limitRemainingUsd: 4,
      limitReset: "monthly",
      usageMonthlyUsd: 2,
      checkedAt: "2026-07-10T00:00:00.000Z",
    });
    const status = await getBudgetStatus();
    expect(status.spentUsd).toBe(2);
    expect(status.providerLimitUsd).toBe(5);
  });

  it("blocks when the OpenRouter key has no room for the request", async () => {
    vi.mocked(getOpenRouterKeyStatus).mockResolvedValue({
      limitUsd: 5,
      limitRemainingUsd: 0.01,
      limitReset: "monthly",
      usageMonthlyUsd: 1,
      checkedAt: "2026-07-10T00:00:00.000Z",
    });
    const status = await getBudgetStatus({ estimatedCostUsd: 0.02 });
    expect(status.reason).toBe("provider_key_limit");
  });

  it("paces normal spend across the UTC month", async () => {
    process.env.AI_BUDGET_PACING_ENABLED = "true";
    vi.mocked(usageService.getMonthlyOpenRouterCost).mockResolvedValue(3.3);
    const status = await getBudgetStatus({
      estimatedCostUsd: 0.01,
      now: new Date("2026-07-10T12:00:00.000Z"),
    });
    expect(status.pacedLimitUsd).toBeCloseTo((10 * 10) / 31);
    expect(status.reason).toBe("monthly_pacing");
  });

  it("keeps live eval spend opt-in", async () => {
    const blocked = await getBudgetStatus({ budgetClass: "evaluation", estimatedCostUsd: 0.01 });
    expect(blocked.reason).toBe("evaluation_disabled");

    process.env.AI_EVAL_SPEND_ENABLED = "true";
    const allowed = await getBudgetStatus({ budgetClass: "evaluation", estimatedCostUsd: 0.01 });
    expect(allowed.allowed).toBe(true);
  });

  it("classifies core production purposes separately from background work", () => {
    expect(inferAiBudgetClass("writer_x_draft")).toBe("essential");
    expect(inferAiBudgetClass("judge_x_critique")).toBe("essential");
    expect(inferAiBudgetClass("news_translate")).toBe("background");
    expect(inferAiBudgetClass("eval_regression")).toBe("evaluation");
  });
});
