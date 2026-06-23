import { generateJson, type GenerateJsonResult } from "@/lib/ai/openrouter";
import { assertGenerationAllowed } from "@/lib/config/costGate";
import { usageService } from "@/lib/services/usageService";
import type { ModelRole } from "@/lib/ai/model-config";

/**
 * Budget-gated wrapper around `generateJson`.
 *
 * Enforces the hard invariant "every AI call is budget-checked AND writes a
 * UsageLog row" in one place, so callers can't forget either half:
 *   1. `assertGenerationAllowed()` — throws BudgetExceededError if the monthly
 *      AI budget is spent (before any spend).
 *   2. `generateJson(...)` — the actual LLM call (kept pure / unaware of cost
 *      accounting, avoiding an openrouter → usageService → db import cycle).
 *   3. `usageService.recordOpenRouter(...)` — logs the real cost exactly once.
 *
 * Prefer this over calling `generateJson` directly anywhere outside benchmarks.
 */
export type GenerateGatedOptions = {
  role: ModelRole;
  system: string;
  user: string;
  temperature?: number;
  /** Cost attribution. `purpose` lands in UsageLog.meta for per-feature spend. */
  purpose: string;
  accountId?: string;
  platform?: string;
  /** Extra fields merged into UsageLog.meta alongside { purpose }. */
  meta?: Record<string, unknown>;
};

export async function generateJsonGated<T>(
  opts: GenerateGatedOptions,
): Promise<GenerateJsonResult<T>> {
  await assertGenerationAllowed();

  const res = await generateJson<T>({
    role: opts.role,
    system: opts.system,
    user: opts.user,
    temperature: opts.temperature,
  });

  await usageService.recordOpenRouter({
    accountId: opts.accountId,
    estimatedCostUsd: res.actualCostUsd,
    model: res.model,
    meta: { purpose: opts.purpose, ...opts.meta },
    platform: opts.platform,
  });

  return res;
}
