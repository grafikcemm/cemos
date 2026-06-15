export type CostLimits = {
  dailyTweetBudget: number;
  maxTweetsPerSource: number;
  maxSourcesPerAccount: number;
  monthlyBudgetUsd: number;
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
  return {
    dailyTweetBudget: Number(process.env.SOCIALDATA_DAILY_TWEET_BUDGET ?? 150),
    maxTweetsPerSource: Number(process.env.SCAN_MAX_TWEETS_PER_SOURCE ?? 5),
    maxSourcesPerAccount: Number(process.env.SCAN_MAX_SOURCES_PER_ACCOUNT ?? 5),
    monthlyBudgetUsd: Number(process.env.MONTHLY_AI_BUDGET_USD ?? 10),
    costPerItem: 0.0002,
    costPerGeneration: 0.0003,
    falMonthlyBudgetUsd: Number(process.env.FAL_MONTHLY_BUDGET_USD ?? 10),
    falImageModel: process.env.FAL_IMAGE_MODEL ?? "fal-ai/nano-banana-pro",
    falImageCostUsd: Number(process.env.FAL_IMAGE_COST_USD ?? 0.15),
  };
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
