import { getOpenRouterKeyStatus } from "@/lib/ai/openrouter-key-status";
import { getCostLimits } from "@/lib/config/costLimits";
import { usageService } from "@/lib/services/usageService";

export type AiBudgetClass = "essential" | "background" | "evaluation";

export type BudgetBlockReason =
  | "monthly_limit"
  | "monthly_pacing"
  | "class_limit"
  | "evaluation_disabled"
  | "provider_key_limit";

export class BudgetExceededError extends Error {
  readonly code = "budget";

  constructor(
    public readonly spentUsd: number,
    public readonly limitUsd: number,
    public readonly reason: BudgetBlockReason = "monthly_limit",
  ) {
    super(
      `Aylik AI butcesi cagriyi durdurdu: $${spentUsd.toFixed(4)} / $${limitUsd.toFixed(2)} (${reason})`,
    );
    this.name = "BudgetExceededError";
  }
}

export type BudgetStatus = {
  allowed: boolean;
  spentUsd: number;
  limitUsd: number;
  remainingUsd: number;
  budgetClass?: AiBudgetClass;
  classSpentUsd?: number;
  classLimitUsd?: number;
  pacedLimitUsd?: number;
  requestedCeilingUsd?: number;
  providerUsageMonthlyUsd?: number | null;
  providerRemainingUsd?: number | null;
  providerLimitUsd?: number | null;
  providerLimitReset?: string | null;
  reason?: BudgetBlockReason;
};

export type BudgetCheckOptions = {
  budgetClass?: AiBudgetClass;
  estimatedCostUsd?: number;
  now?: Date;
};

const ESSENTIAL_PURPOSES = [
  "writer_",
  "judge_x_critique",
  "judge_final_polish",
  "ig_dm_draft",
  "ig_reply",
];

export function inferAiBudgetClass(purpose: string): AiBudgetClass {
  if (purpose.startsWith("eval_")) return "evaluation";
  if (ESSENTIAL_PURPOSES.some((prefix) => purpose.startsWith(prefix))) return "essential";
  return "background";
}

function monthProgressUtc(now: Date): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return now.getUTCDate() / daysInMonth;
}

function nonNegative(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export async function getBudgetStatus(
  options: BudgetCheckOptions = {},
): Promise<BudgetStatus> {
  const limits = getCostLimits();
  const limitUsd = limits.monthlyBudgetUsd;
  const budgetClass = options.budgetClass ?? "essential";
  const requestedCeilingUsd = nonNegative(options.estimatedCostUsd);
  const now = options.now ?? new Date();

  const [localSpendUsd, classSpentUsd, provider] = await Promise.all([
    usageService.getMonthlyOpenRouterCost(),
    budgetClass === "essential"
      ? Promise.resolve(0)
      : usageService.getMonthlySpendByBudgetClass(budgetClass),
    getOpenRouterKeyStatus(),
  ]);

  // Provider usage is authoritative when older calls were not written locally.
  // Local usage stays authoritative when multiple keys/environments share a DB.
  const providerUsageMonthlyUsd = provider?.usageMonthlyUsd ?? null;
  const spentUsd = Math.max(localSpendUsd, providerUsageMonthlyUsd ?? 0);
  const remainingUsd = Math.max(0, limitUsd - spentUsd);
  const progress = limits.pacingEnabled ? monthProgressUtc(now) : 1;
  const pacedLimitUsd = limitUsd * progress;
  const operatingBudgetUsd = Math.max(0, limitUsd - limits.monthlyReserveUsd);

  let classLimitUsd = pacedLimitUsd;
  if (budgetClass === "background") {
    classLimitUsd = operatingBudgetUsd * limits.backgroundBudgetRatio * progress;
  } else if (budgetClass === "evaluation") {
    classLimitUsd = limits.evalSpendEnabled ? limits.evalMonthlyBudgetUsd : 0;
  }

  let reason: BudgetBlockReason | undefined;
  if (
    limitUsd <= 0 ||
    spentUsd >= limitUsd ||
    spentUsd + requestedCeilingUsd > limitUsd
  ) {
    reason = "monthly_limit";
  } else if (
    provider?.limitRemainingUsd != null &&
    (provider.limitRemainingUsd <= 0 || requestedCeilingUsd > provider.limitRemainingUsd)
  ) {
    reason = "provider_key_limit";
  } else if (budgetClass === "evaluation" && !limits.evalSpendEnabled) {
    reason = "evaluation_disabled";
  } else if (
    budgetClass !== "evaluation" &&
    (spentUsd >= pacedLimitUsd || spentUsd + requestedCeilingUsd > pacedLimitUsd)
  ) {
    reason = "monthly_pacing";
  } else if (
    budgetClass !== "essential" &&
    (classSpentUsd >= classLimitUsd || classSpentUsd + requestedCeilingUsd > classLimitUsd)
  ) {
    reason = "class_limit";
  }

  return {
    allowed: reason == null,
    spentUsd,
    limitUsd,
    remainingUsd,
    budgetClass,
    classSpentUsd,
    classLimitUsd,
    pacedLimitUsd,
    requestedCeilingUsd,
    providerUsageMonthlyUsd,
    providerRemainingUsd: provider?.limitRemainingUsd ?? null,
    providerLimitUsd: provider?.limitUsd ?? null,
    providerLimitReset: provider?.limitReset ?? null,
    reason,
  };
}

/** Throws before a request whose estimated ceiling does not fit its budget. */
export async function assertGenerationAllowed(
  options: BudgetCheckOptions = {},
): Promise<void> {
  const status = await getBudgetStatus(options);
  if (!status.allowed) {
    throw new BudgetExceededError(
      status.spentUsd,
      status.limitUsd,
      status.reason ?? "monthly_limit",
    );
  }
}

/** Separate budget gate for fal.ai image generation. */
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
