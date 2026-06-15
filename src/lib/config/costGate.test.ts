import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/usageService", () => ({
  usageService: { getMonthlyCost: vi.fn() },
}));

import { getBudgetStatus, assertGenerationAllowed, BudgetExceededError } from "./costGate";
import { usageService } from "@/lib/services/usageService";

describe("costGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MONTHLY_AI_BUDGET_USD = "5";
  });

  it("allows generation when monthly spend is below the limit", async () => {
    vi.mocked(usageService.getMonthlyCost).mockResolvedValue(1);
    const status = await getBudgetStatus();
    expect(status.allowed).toBe(true);
    expect(status.remainingUsd).toBeCloseTo(4);
    await expect(assertGenerationAllowed()).resolves.toBeUndefined();
  });

  it("blocks and throws BudgetExceededError when spend reaches the limit", async () => {
    vi.mocked(usageService.getMonthlyCost).mockResolvedValue(5);
    const status = await getBudgetStatus();
    expect(status.allowed).toBe(false);
    expect(status.remainingUsd).toBe(0);
    await expect(assertGenerationAllowed()).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("blocks when the budget limit is zero (no AI spend allowed)", async () => {
    process.env.MONTHLY_AI_BUDGET_USD = "0";
    vi.mocked(usageService.getMonthlyCost).mockResolvedValue(0);
    const status = await getBudgetStatus();
    expect(status.allowed).toBe(false);
  });
});
