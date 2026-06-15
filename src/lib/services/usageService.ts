import { usageLogRepo } from "@/lib/db/usageLogRepo";
import { getCostLimits } from "@/lib/config/costLimits";


function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export const usageService = {
  async recordScan(opts: {
    accountId?: string;
    tweetCount: number;
    estimatedCostUsd: number;
    platform?: string;
  }): Promise<void> {
    await usageLogRepo.create({
      accountId: opts.accountId,
      type: "scan",
      tweetCount: opts.tweetCount,
      estimatedCostUsd: opts.estimatedCostUsd,
      date: todayDate(),
      platform: opts.platform,
    });
  },

  async recordGeneration(opts: {
    accountId?: string;
    estimatedCostUsd: number;
    platform?: string;
  }): Promise<void> {
    await usageLogRepo.create({
      accountId: opts.accountId,
      type: "generation",
      estimatedCostUsd: opts.estimatedCostUsd,
      date: todayDate(),
      platform: opts.platform,
    });
  },

  /**
   * Log a real OpenRouter spend (news translate/score/digest, repo enrich).
   * provider is always "openrouter"; meta carries { purpose } for cost attribution.
   */
  async recordOpenRouter(opts: {
    accountId?: string;
    estimatedCostUsd: number;
    model?: string;
    meta?: Record<string, unknown>;
    platform?: string;
  }): Promise<void> {
    await usageLogRepo.create({
      accountId: opts.accountId,
      type: "openrouter",
      estimatedCostUsd: opts.estimatedCostUsd,
      date: todayDate(),
      provider: "openrouter",
      model: opts.model,
      // Meta her zaman JSON.stringify ile yazılır — getMonthlySpendByPurpose'un
      // '"purpose":"' contains ön-filtresi bu varsayıma dayanır.
      meta: opts.meta ? JSON.stringify(opts.meta) : undefined,
      platform: opts.platform,
    });
  },

  async getRemainingDailyTweets(): Promise<number> {
    const dailyBudget = getCostLimits().dailyTweetBudget;
    const used = await usageLogRepo.sumTweetsByDate(todayDate());
    return Math.max(0, dailyBudget - used);
  },

  async getTodayCost(): Promise<number> {
    return usageLogRepo.sumCostByDate(todayDate());
  },

  async getMonthlyCost(): Promise<number> {
    const yearMonth = new Date().toISOString().slice(0, 7);
    return usageLogRepo.sumCostByMonth(yearMonth);
  },

  /**
   * Log a real fal.ai image-generation spend. provider:"fal" keeps it on its own
   * budget line, separate from the LLM (OpenRouter) spend.
   */
  async recordImage(opts: {
    accountId?: string;
    estimatedCostUsd: number;
    model?: string;
    meta?: Record<string, unknown>;
    platform?: string;
  }): Promise<void> {
    await usageLogRepo.create({
      accountId: opts.accountId,
      type: "image",
      estimatedCostUsd: opts.estimatedCostUsd,
      date: todayDate(),
      provider: "fal",
      model: opts.model,
      meta: opts.meta ? JSON.stringify(opts.meta) : undefined,
      platform: opts.platform,
    });
  },

  /** This month's fal.ai image spend — drives the separate fal budget gate. */
  async getMonthlyFalCost(): Promise<number> {
    const yearMonth = new Date().toISOString().slice(0, 7);
    return usageLogRepo.sumCostByProviderMonth(yearMonth, "fal");
  },

  /**
   * Bu ay, meta.purpose'u verilen prefix ile başlayan harcamaların toplamı.
   * Gelecek fazların purpose-bazlı bütçe gate'leri için (örn. "yt_" → tüm YouTube
   * harcaması). purpose'suz eski satırlar bilinçli kapsam dışı.
   */
  async getMonthlySpendByPurpose(prefix: string): Promise<number> {
    const yearMonth = new Date().toISOString().slice(0, 7);
    const rows = await usageLogRepo.findMonthRowsWithPurpose(yearMonth);
    let total = 0;
    for (const row of rows) {
      try {
        const meta = JSON.parse(row.meta) as { purpose?: unknown };
        if (typeof meta.purpose === "string" && meta.purpose.startsWith(prefix)) {
          total += row.estimatedCostUsd;
        }
      } catch {
        // bozuk meta satırı atlanır — bütçe hesabı fail-open kalır
      }
    }
    return total;
  },
};
