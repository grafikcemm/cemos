export type CostLimits = {
  dailyTweetBudget: number;
  maxTweetsPerSource: number;
  maxSourcesPerAccount: number;
  monthlyBudgetUsd: number;
  /** Monthly budget kept away from background work for core/manual generation. */
  monthlyReserveUsd: number;
  /** Maximum share of the monthly LLM budget available to background work. */
  backgroundBudgetRatio: number;
  /** Explicit, opt-in monthly allowance for live eval runs. */
  evalMonthlyBudgetUsd: number;
  /** Production defaults to false so test suites cannot silently consume credits. */
  evalSpendEnabled: boolean;
  /** Spread automated spend across the month instead of allowing an early burn. */
  pacingEnabled: boolean;
  costPerItem: number;
  costPerGeneration: number;
  /** Separate monthly budget for fal.ai image generation (independent of the LLM budget). */
  falMonthlyBudgetUsd: number;
  /** fal.ai model slug. Default = Nano Banana Pro (NB2). NB1 = fal-ai/gemini-25-flash-image. */
  falImageModel: string;
  /** Per-image cost estimate. NB2 std = $0.15, NB2 4K = $0.30, NB1 = $0.039. */
  falImageCostUsd: number;
};

export function getCostLimits(): CostLimits {
  const monthlyBudgetUsd = nonNegativeNumber(process.env.MONTHLY_AI_BUDGET_USD, 10);
  return {
    dailyTweetBudget: Number(process.env.SOCIALDATA_DAILY_TWEET_BUDGET ?? 150),
    maxTweetsPerSource: Number(process.env.SCAN_MAX_TWEETS_PER_SOURCE ?? 5),
    maxSourcesPerAccount: Number(process.env.SCAN_MAX_SOURCES_PER_ACCOUNT ?? 5),
    monthlyBudgetUsd,
    monthlyReserveUsd: Math.min(
      monthlyBudgetUsd,
      nonNegativeNumber(process.env.AI_MONTHLY_RESERVE_USD, 1),
    ),
    backgroundBudgetRatio: boundedNumber(
      process.env.AI_BACKGROUND_BUDGET_RATIO,
      0.3,
      0,
      1,
    ),
    evalMonthlyBudgetUsd: Math.min(
      monthlyBudgetUsd,
      nonNegativeNumber(process.env.AI_EVAL_MONTHLY_BUDGET_USD, 0.5),
    ),
    evalSpendEnabled: process.env.AI_EVAL_SPEND_ENABLED === "true",
    pacingEnabled: process.env.AI_BUDGET_PACING_ENABLED !== "false",
    costPerItem: 0.0002,
    costPerGeneration: 0.0003,
    falMonthlyBudgetUsd: Number(process.env.FAL_MONTHLY_BUDGET_USD ?? 10),
    falImageModel: process.env.FAL_IMAGE_MODEL ?? "fal-ai/nano-banana-pro",
    falImageCostUsd: Number(process.env.FAL_IMAGE_COST_USD ?? 0.15),
  };
}

function nonNegativeNumber(raw: string | undefined, fallback: number): number {
  const value = raw == null || raw.trim() === "" ? fallback : Number(raw);
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function boundedNumber(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, nonNegativeNumber(raw, fallback)));
}

/**
 * Hesap-bazlı kaynak tarama cap'i. Env ile override edilebilir:
 *   SCAN_MAX_SOURCES_GRAFIKCEM, SCAN_MAX_SOURCES_MASKULENKOD
 * Aksi halde global SCAN_MAX_SOURCES_PER_ACCOUNT (varsayılan 5) kullanılır.
 */
const DEFAULT_SOURCE_CAPS: Record<string, number> = {
  grafikcem: 6,
  maskulenkod: 6,
};

export function getMaxSourcesForAccount(handle: string): number {
  const key = handle.toLowerCase();
  const envKey = `SCAN_MAX_SOURCES_${key.toUpperCase()}`;
  const envVal = process.env[envKey];
  if (envVal != null && Number.isFinite(Number(envVal))) {
    return Number(envVal);
  }
  return DEFAULT_SOURCE_CAPS[key] ?? getCostLimits().maxSourcesPerAccount;
}
