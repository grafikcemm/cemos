import {
  classifyOpenRouterError,
  estimateGenerateJsonCeiling,
  generateJson,
  type GenerateJsonResult,
  type JsonSchemaSpec,
} from "@/lib/ai/openrouter";
import {
  inferAiBudgetClass,
  type AiBudgetClass,
} from "@/lib/config/costGate";
import { usageService } from "@/lib/services/usageService";
import type { ModelRole } from "@/lib/ai/model-config";
import { resolvePreset, type PresetName } from "@/lib/ai/presets";
import { getModelProfile } from "@/lib/services/settingsService";
import {
  reserveAiSpend,
  settleAiSpend,
  releaseAiSpend,
} from "@/lib/services/aiSpendReservationService";

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
  // Cold-start durable-profile hydration (Phase 5F §6 / closure B). The legacy
  // role path resolves the model from `process.env.MODEL_PROFILE` SYNCHRONOUSLY
  // (`model-config.resolveModel`), and BOTH the cost estimate below and the
  // actual call go through it. `getModelProfile()` reads the durable
  // `OperatorSetting` row and converges `process.env.MODEL_PROFILE`, so the very
  // first paid call on a cold serverless instance honors the operator's saved
  // choice WITHOUT requiring a prior `/api/settings` visit. Fail-open + 30s
  // cache → at most one cached DB read per instance per 30s. Presets pin their
  // own model and are unaffected either way.
  await getModelProfile();
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

  // Closure C: atomically RESERVE the estimated spend (advisory-locked) instead
  // of a racy check-then-spend — concurrent essential calls can't both pass the
  // check and overshoot the cap. Fails open to the base cap check on a missing
  // table / transient fault, so generation is never blocked by a reservation bug.
  const reservation = await reserveAiSpend({
    budgetClass,
    estimatedCostUsd: requestedCeilingUsd,
    purpose,
    model,
  });

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
    // Free the reservation — any real billed cost is recorded below and captured
    // by UsageLog, so releasing keeps the budget correct without double-counting.
    await releaseAiSpend(reservation);
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
        // Non-sensitive error category (DH-014) so provider liveness (§13/BUG-05)
        // can surface WHY the last call failed (e.g. provider_credit = 402) without
        // leaking the raw provider body.
        const errorClass = classifyOpenRouterError(
          error instanceof Error ? error.message : String(error),
        );
        await usageService.recordOpenRouter({
          accountId: opts.accountId,
          estimatedCostUsd: billedCostUsd,
          model: billedModel,
          meta: {
            purpose,
            budgetClass,
            failed: true,
            errorClass,
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

  // Settle the reservation to the real cost (UsageLog below stays the source of
  // truth for actual spend; the settled reservation stops counting as in-flight).
  await settleAiSpend(reservation, res.actualCostUsd);

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
