import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import {
  assembleMonthlyPlan,
  staleDossierFlags,
  PlanValidationError,
} from "@/lib/reels/plan-assembler";

/**
 * Aylık Reels planı (Sprint 6 — CONTENT-ENGINE §6). POST: deterministik
 * montaj + persist (accountId+month upsert; yeniden montaj eski slotları
 * değiştirir — plan taslak evresinde). GET: plan + slotlar + bayat-kanıt
 * bayrakları. Ay grid UI'ı Instagram alan ekranıyla gelir (C6/D1: önce
 * dossier listesi).
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
    return ok({ plan, staleFlags });
  } catch (err) {
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
    .optional(),
  seasonalTopics: z.array(z.string().max(200)).max(31).optional(),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = CreateSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);

  try {
    const assembled = assembleMonthlyPlan(parsed.data);

    const plan = await prisma.reelPlan.upsert({
      where: { accountId_month: { accountId: parsed.data.accountId, month: parsed.data.month } },
      create: {
        accountId: parsed.data.accountId,
        month: parsed.data.month,
        mixJson: JSON.stringify(assembled.mix),
        notesJson: JSON.stringify(assembled.warnings),
      },
      update: {
        mixJson: JSON.stringify(assembled.mix),
        notesJson: JSON.stringify(assembled.warnings),
      },
    });
    // Taslak evresinde yeniden montaj = slotları yenile (drafted/done korunmaz
    // varsayımı YOK: yalnız planned slotlar silinir, işlenmişler kalır).
    await prisma.reelPlanSlot.deleteMany({ where: { planId: plan.id, status: "planned" } });
    await prisma.reelPlanSlot.createMany({
      data: assembled.slots.map((s) => ({
        planId: plan.id,
        dayOfMonth: s.dayOfMonth,
        pillar: s.pillar,
        mixBucket: s.mixBucket,
        seriesKey: s.seriesKey,
        topicHint: s.topicHint,
      })),
    });

    return ok({ planId: plan.id, mix: assembled.mix, warnings: assembled.warnings, slotCount: assembled.slots.length });
  } catch (err) {
    if (err instanceof PlanValidationError) return fail(err.message, 400);
    return fail(err instanceof Error ? err.message : "Plan oluşturulamadı", 500);
  }
}
