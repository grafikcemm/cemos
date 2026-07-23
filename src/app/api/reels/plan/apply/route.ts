import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import { applyPlan, resolveSeriesForPlan } from "@/lib/reels/planReconcileService";
import { PlanValidationError } from "@/lib/reels/plan-assembler";

export const dynamic = "force-dynamic";

/**
 * Aylık plan UYGULA (Phase 3E, ADR-039 §7B) — tek transaction + advisory-lock +
 * optimistic concurrency (expectedUpdatedAt) + preview fingerprint + idempotent
 * no-op. NON-DESTRUCTIVE: obsolete "planned" slotlar skipped'e geçer, korunanlar
 * (drafted/done/dossier/handoff) dokunulmaz. Apply otomatik ACTIVE yapmaz.
 */

const PlanConfigSchema = z.object({
  pillars: z.array(z.string().min(1).max(60)).min(3).max(5),
  postDays: z.array(z.number().int().min(1).max(31)).min(1).max(31),
  series: z
    .array(
      z.object({
        seriesKey: z.string().min(1).max(60),
        pillar: z.string().min(1).max(60),
        episodesPerMonth: z.number().int().min(1).max(31),
      })
    )
    .max(8)
    .optional(),
  seasonalTopics: z.array(z.string().max(200)).max(31).optional(),
});

const BodySchema = z.object({
  accountId: z.string().min(1).max(64),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  plan: PlanConfigSchema,
  fingerprint: z.string().min(1).max(64),
  expectedUpdatedAt: z.string().min(1).max(40).nullable(),
});

const STATUS_BY_CODE: Record<string, number> = {
  stale: 409,
  fingerprint_mismatch: 409,
  hard_blocked: 422,
  archived_plan: 409,
  series_invalid: 422,
};

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400, { code: "invalid_input" });
  const { accountId, month, plan, fingerprint, expectedUpdatedAt } = parsed.data;

  try {
    const series = await resolveSeriesForPlan(accountId, plan.pillars, plan.series ?? []);
    if (!series.ok) {
      return fail(series.message, STATUS_BY_CODE.series_invalid, { code: series.code, invalid: series.invalid });
    }
    const result = await applyPlan({
      accountId,
      month,
      plan: {
        pillars: plan.pillars,
        postDays: plan.postDays,
        series: series.series,
        seasonalTopics: plan.seasonalTopics,
        pastTopics: series.pastTopics,
        bannedRepetition: series.bannedRepetition,
      },
      fingerprint,
      expectedUpdatedAt,
      nowIso: new Date().toISOString(),
      source: "operator_apply",
    });
    if (!result.ok) {
      return fail(result.message, STATUS_BY_CODE[result.code] ?? 422, {
        code: result.code,
        ...(result.hardBlockers ? { hardBlockers: result.hardBlockers } : {}),
      });
    }
    return ok({
      planId: result.planId,
      revision: result.revision,
      idempotent: result.idempotent,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      updatedAt: result.updatedAt,
      warnings: result.warnings,
    });
  } catch (err) {
    if (err instanceof PlanValidationError) return fail(err.message, 422, { code: "plan_invalid" });
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Plan uygulanamadı", 500);
  }
}
