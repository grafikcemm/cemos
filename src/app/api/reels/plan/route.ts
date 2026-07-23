import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import { staleDossierFlags, PlanValidationError } from "@/lib/reels/plan-assembler";
import {
  computePlanPreview,
  applyPlan,
  resolveSeriesForPlan,
} from "@/lib/reels/planReconcileService";
import { parsePlanNotes } from "@/lib/reels/planNotes";

/**
 * Aylık Reels planı (Sprint 6 → Phase 3E). GET: plan + slotlar + bayat-kanıt
 * bayrakları + notesJson zarfı (legacy string[] okunur) + plan status.
 * POST (legacy convenience): NON-DESTRUCTIVE reconcile'a delege eder — eski
 * destructive `deleteMany` KALDIRILDI (handoff slotları artık orphan olmaz).
 * Zengin preview→apply→lifecycle akışı ayrı route'lardadır
 * (/preview, /apply, /lifecycle).
 */

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
    const month = req.nextUrl.searchParams.get("month") ?? "";
    if (!accountId || !/^\d{4}-\d{2}$/.test(month)) {
      return fail("accountId ve month (YYYY-MM) zorunlu", 400);
    }
    const plan = await prisma.reelPlan.findUnique({
      where: { accountId_month: { accountId, month } },
      include: { slots: { orderBy: { dayOfMonth: "asc" } } },
    });
    if (!plan) return ok({ plan: null, staleFlags: [] });

    // Staleness: slotlara bağlı dossier'lerin kanıt expiry kontrolü (§6).
    const dossierIds = plan.slots.map((s) => s.dossierId).filter((x): x is string => Boolean(x));
    const dossiers = dossierIds.length
      ? await prisma.reelDossier.findMany({
          where: { id: { in: dossierIds } },
          select: { id: true, title: true, expiry: true },
        })
      : [];
    const staleFlags = staleDossierFlags(dossiers, Date.now());
    const notes = parsePlanNotes(plan.notesJson);
    return ok({
      plan,
      staleFlags,
      planStatus: plan.status,
      notes: { warnings: notes.warnings, revision: notes.envelope?.revision ?? null, legacy: notes.legacy },
    });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Plan alınamadı", 500);
  }
}

const CreateSchema = z.object({
  accountId: z.string().min(1).max(64),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  postDays: z.array(z.number().int().min(1).max(31)).min(1).max(31),
  pillars: z.array(z.string().min(1).max(60)).min(3).max(5),
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

/**
 * Legacy convenience: assembler + NON-DESTRUCTIVE reconcile. Server tarafında
 * preview (fingerprint + expectedUpdatedAt) türetir, apply'a delege eder.
 * deleteMany YOK → handoff/işlenmiş slotlar korunur. Zengin akış /apply'da.
 */
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = CreateSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);
  const { accountId, month, postDays, pillars, series, seasonalTopics } = parsed.data;

  try {
    const resolved = await resolveSeriesForPlan(accountId, pillars, series ?? []);
    if (!resolved.ok) return fail(resolved.message, 422, { code: resolved.code, invalid: resolved.invalid });
    const planInput = {
      pillars,
      postDays,
      series: resolved.series,
      seasonalTopics,
      pastTopics: resolved.pastTopics,
      bannedRepetition: resolved.bannedRepetition,
    };

    // Server-side preview → fingerprint + beklenen updatedAt (legacy caller vermiyor).
    const preview = await computePlanPreview({ accountId, month, plan: planInput });
    const result = await applyPlan({
      accountId,
      month,
      plan: planInput,
      fingerprint: preview.fingerprint,
      expectedUpdatedAt: preview.expectedUpdatedAt,
      nowIso: new Date().toISOString(),
      source: "legacy_apply",
    });
    if (!result.ok) {
      const status = result.code === "hard_blocked" ? 422 : 409;
      return fail(result.message, status, {
        code: result.code,
        ...(result.hardBlockers ? { hardBlockers: result.hardBlockers } : {}),
      });
    }
    return ok({
      planId: result.planId,
      mix: preview.mix,
      warnings: result.warnings,
      slotCount: result.created + result.updated + preview.slotsUnchanged.length,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
    });
  } catch (err) {
    if (err instanceof PlanValidationError) return fail(err.message, 400);
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Plan oluşturulamadı", 500);
  }
}
