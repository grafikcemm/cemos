import {
  estimateGenerateJsonCeiling,
  generateJson,
  type GenerateJsonResult,
  type JsonSchemaSpec,
} from "@/lib/ai/openrouter";
import {
  assertGenerationAllowed,
  inferAiBudgetClass,
  type AiBudgetClass,
} from "@/lib/config/costGate";
import { usageService } from "@/lib/services/usageService";
import type { ModelRole } from "@/lib/ai/model-config";
import { resolvePreset, type PresetName } from "@/lib/ai/presets";

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
 *
 * Preset katmanı: `preset` verildiğinde model/fallback/structured/cache/provider
 * ayarları `presets.ts` sözleşmesinden gelir; `role` preset'ten türetilir.
 * Preset'siz çağrılar eski rol yolundan aynen çalışır (additive rollback).
 */
export type GenerateGatedOptions = {
  /** Preset adı (örn. "cemos-writer"). Verilirse role zorunlu değil. */
  preset?: PresetName;
  role?: ModelRole;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  deadlineMs?: number;
  /** structured === "json_schema" preset'lerinde istek şeması. */
  jsonSchema?: JsonSchemaSpec;
  /** Cost attribution. `purpose` lands in UsageLog.meta for per-feature spend.
   *  Preset verilip purpose verilmezse `{purposePrefix}unlabeled` yazılır. */
  purpose?: string;
  accountId?: string;
  platform?: string;
  /** Extra fields merged into UsageLog.meta alongside { purpose }. */
  meta?: Record<string, unknown>;
  /** Explicit override for eval scripts and unusual interactive paths. */
  budgetClass?: AiBudgetClass;
};

export async function generateJsonGated<T>(
  opts: GenerateGatedOptions,
): Promise<GenerateJsonResult<T>> {
  const preset = opts.preset ? resolvePreset(opts.preset) : undefined;
  const role = preset?.role ?? opts.role;
  if (!role) {
    throw new Error("generateJsonGated: preset veya role zorunlu.");
  }
  const purpose =
    opts.purpose ?? (preset ? `${preset.purposePrefix}unlabeled` : undefined);
  if (!purpose) {
    throw new Error("generateJsonGated: purpose zorunlu (UsageLog attribution).");
  }
  const budgetClass = opts.budgetClass ?? inferAiBudgetClass(purpose);
  const model = preset?.primary;
  const fallbacks = preset?.fallbacks;
  const requestedCeilingUsd = estimateGenerateJsonCeiling({
    role,
    system: opts.system,
    user: opts.user,
    maxTokens: opts.maxTokens,
    model,
    fallbacks,
  });

  await assertGenerationAllowed({ budgetClass, estimatedCostUsd: requestedCeilingUsd });

  let res: GenerateJsonResult<T>;
  try {
    res = await generateJson<T>({
      role,
      system: opts.system,
      user: opts.user,
      temperature: opts.temperature ?? preset?.temperature,
      maxTokens: opts.maxTokens,
      deadlineMs: opts.deadlineMs,
      ...(preset
        ? {
            model: preset.primary,
            fallbacks: preset.fallbacks,
            structured: preset.structured,
            jsonSchema: opts.jsonSchema,
            cacheControl: preset.cache === "anthropic-breakpoint",
            providerOrder: preset.providerOrder,
            sort: preset.sort,
            maxPrice: preset.maxPrice,
            dataCollection: preset.dataCollection,
            reasoning: preset.reasoning === "none" ? undefined : preset.reasoning,
            timeoutMs: preset.timeoutMs,
          }
        : {}),
    });
  } catch (error) {
    const errorRecord = typeof error === "object" && error !== null ? error : null;
    const billedCostUsd =
      errorRecord &&
      "actualCostUsd" in errorRecord &&
      typeof errorRecord.actualCostUsd === "number"
        ? errorRecord.actualCostUsd
        : 0;
    if (billedCostUsd > 0) {
      const billedModel =
        errorRecord && "model" in errorRecord && typeof errorRecord.model === "string"
          ? errorRecord.model
          : model;
      try {
        await usageService.recordOpenRouter({
          accountId: opts.accountId,
          estimatedCostUsd: billedCostUsd,
          model: billedModel,
          meta: {
            purpose,
            budgetClass,
            failed: true,
            ...(preset ? { preset: preset.name } : {}),
            ...opts.meta,
          },
          platform: opts.platform,
        });
      } catch {
        // Preserve the generation failure; the provider key cap remains the
        // final hard stop if the local ledger is temporarily unavailable.
      }
    }
    throw error;
  }

  await usageService.recordOpenRouter({
    accountId: opts.accountId,
    estimatedCostUsd: res.actualCostUsd,
    model: res.model,
    meta: {
      purpose,
      budgetClass,
      ...(preset ? { preset: preset.name } : {}),
      ...opts.meta,
    },
    platform: opts.platform,
  });

  return res;
}
