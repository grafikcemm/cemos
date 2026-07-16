import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import {
  HandoffFlowError,
  handoffErrorResponse,
  opportunityHandoffService,
} from "@/lib/services/opportunityHandoffService";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  dayOfMonth: z.number().int().min(1).max(31),
});

// POST /api/opportunities/handoff/[id]/consume-plan
// Plana-ekle onayı: kullanıcı GÜN seçtikten sonra çağrılır — onay öncesi
// hiçbir slot yazılmaz (sessiz takvim kaydı YOK). Consume claim + slot create
// tek transaction → confirmation tekrarında duplicate slot oluşmaz.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON gövdesi", 400);
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz gün/ay bilgisi.", 422, { code: "invalid_input" });

  try {
    const handoff = await opportunityHandoffService.getById(id);
    if (!handoff) return fail("Fırsat aktarımı bulunamadı.", 404, { code: "not_found" });
    if (handoff.action !== "plan") {
      return fail("Bu aktarım takvim planı için değil.", 422, { code: "invalid_state" });
    }
    if (handoff.status === "consumed") {
      return ok({ alreadyConsumed: true, slotId: handoff.resultRef });
    }

    const plan = await prisma.reelPlan.findUnique({
      where: { accountId_month: { accountId: handoff.accountId, month: parsed.data.month } },
    });
    if (!plan) {
      throw new HandoffFlowError(
        "plan_not_found",
        `Bu ay (${parsed.data.month}) için plan yok — önce Takvim'den aylık planı kur.`
      );
    }

    const txResult = await prisma.$transaction(async (tx) => {
      const consumed = await opportunityHandoffService.consume(handoff.id, {}, tx as never);
      if (consumed.alreadyConsumed) {
        return { slotId: consumed.handoff.resultRef, alreadyConsumed: true };
      }
      const slot = await tx.reelPlanSlot.create({
        data: {
          planId: plan.id,
          dayOfMonth: parsed.data.dayOfMonth,
          pillar: handoff.title.slice(0, 80),
          mixBucket: "reactive",
          topicHint: handoff.topicSeed || handoff.title,
          status: "planned",
        },
      });
      await tx.opportunityHandoff.update({ where: { id: handoff.id }, data: { resultRef: slot.id } });
      return { slotId: slot.id, alreadyConsumed: false };
    });

    return ok(txResult, { status: txResult.alreadyConsumed ? 200 : 201 });
  } catch (err) {
    if (err instanceof HandoffFlowError) {
      const r = handoffErrorResponse(err);
      return fail(r.error, r.status, { code: r.code });
    }
    return fail(err instanceof Error ? err.message : "Sunucu hatası", 500);
  }
}
