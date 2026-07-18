import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { computePlanPreview, resolveSeriesForPlan } from "@/lib/reels/planReconcileService";
import { PlanValidationError } from "@/lib/reels/plan-assembler";

export const dynamic = "force-dynamic";

/**
 * Aylık plan ÖNİZLEME (Phase 3E, ADR-039 §7A) — SIFIR DB write. Assembler +
 * non-destructive reconcile önizlemesi: eklenecek/güncellenecek/korunacak/
 * skipped slotlar, çakışmalar, tekrar histogramı, uyarılar, hard blocker'lar,
 * fingerprint, beklenen updatedAt. Seri seçimi DB'ye karşı doğrulanır.
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
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400, { code: "invalid_input" });
  const { accountId, month, plan } = parsed.data;

  try {
    const series = await resolveSeriesForPlan(accountId, plan.pillars, plan.series ?? []);
    if (!series.ok) {
      return fail(series.message, 422, { code: series.code, invalid: series.invalid });
    }
    const preview = await computePlanPreview({
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
    });
    return ok({ preview });
  } catch (err) {
    if (err instanceof PlanValidationError) return fail(err.message, 422, { code: "plan_invalid" });
    return fail(err instanceof Error ? err.message : "Önizleme oluşturulamadı", 500);
  }
}
