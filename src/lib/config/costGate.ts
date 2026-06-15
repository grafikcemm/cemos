import { getCostLimits } from "@/lib/config/costLimits";
import { usageService } from "@/lib/services/usageService";

/**
 * Hard budget gate for all LLM-backed work (scout, pre-filter, router, council,
 * mining, generation). The in-memory `cost-guard.ts` only counted SocialData
 * tweets and reset on restart; this gate is DB-backed via UsageLog so it
 * survives restarts and covers the whole AI spend for the month.
 */

export class BudgetExceededError extends Error {
  readonly code = "budget";
  constructor(
    public readonly spentUsd: number,
    public readonly limitUsd: number
  ) {
    super(
      `Aylık AI bütçesi aşıldı: $${spentUsd.toFixed(4)} / $${limitUsd.toFixed(2)}`
    );
    this.name = "BudgetExceededError";
  }
}

export type BudgetStatus = {
  allowed: boolean;
  spentUsd: number;
  limitUsd: number;
  remainingUsd: number;
};

export async function getBudgetStatus(): Promise<BudgetStatus> {
  const limitUsd = getCostLimits().monthlyBudgetUsd;
  const spentUsd = await usageService.getMonthlyCost();
  // A non-positive limit means "no AI spend allowed" → always blocked.
  const allowed = limitUsd > 0 && spentUsd < limitUsd;
  return {
    allowed,
    spentUsd,
    limitUsd,
    remainingUsd: Math.max(0, limitUsd - spentUsd),
  };
}

/**
 * Throws BudgetExceededError if the monthly AI budget is spent. Call at the top
 * of every service that is about to make one or more LLM calls.
 */
export async function assertGenerationAllowed(): Promise<void> {
  const status = await getBudgetStatus();
  if (!status.allowed) {
    throw new BudgetExceededError(status.spentUsd, status.limitUsd);
  }
}

/**
 * Separate budget gate for fal.ai image generation. Image spend is tracked on
 * its own line (provider:"fal") so a $10 image budget can't be drained by — or
 * drain — the LLM budget. Call before every fal image request.
 */
export async function getFalBudgetStatus(): Promise<BudgetStatus> {
  const limitUsd = getCostLimits().falMonthlyBudgetUsd;
  const spentUsd = await usageService.getMonthlyFalCost();
  const allowed = limitUsd > 0 && spentUsd < limitUsd;
  return {
    allowed,
    spentUsd,
    limitUsd,
    remainingUsd: Math.max(0, limitUsd - spentUsd),
  };
}
