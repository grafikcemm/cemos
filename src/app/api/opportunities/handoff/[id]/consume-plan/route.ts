import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { acquireXactAdvisoryLock } from "@/lib/db/advisoryLock";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { daysInMonth } from "@/lib/utils/calendarGrid";
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
// Plana-ekle onayı (ADR-039 §8): kullanıcı GÜN seçtikten sonra çağrılır — onay
// öncesi hiçbir slot yazılmaz. Sözleşme:
//  - Gün ayın gerçek sınırında olmalı (Şubat 30 reddedilir).
//  - Plan archived ise yerleştirme yok.
//  - Aynı günde BOŞ assembler slotu varsa yeni satır yerine O slot kullanılır
//    (duplicate satır oluşmaz). Gün doluysa (drafted/done/dossier/başka handoff)
//    → 409 day_occupied.
//  - Consume claim + slot yazımı tek transaction (advisory-lock'lu) → slot
//    yazımı başarısızsa handoff consumed KALMAZ; retry idempotent; resultRef
//    hiçbir zaman orphan olmaz (assembler artık planned slotu silmez).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON gövdesi", 400);
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz gün/ay bilgisi.", 422, { code: "invalid_input" });
  const { month, dayOfMonth } = parsed.data;

  try {
    const handoff = await opportunityHandoffService.getById(id);
    if (!handoff) return fail("Fırsat aktarımı bulunamadı.", 404, { code: "not_found" });
    if (handoff.action !== "plan") {
      return fail("Bu aktarım takvim planı için değil.", 422, { code: "invalid_state" });
    }
    if (handoff.status === "consumed") {
      return ok({ alreadyConsumed: true, slotId: handoff.resultRef });
    }

    // Ayın gerçek günü doğrulanır.
    const [y, m] = month.split("-").map(Number);
    if (dayOfMonth > daysInMonth(y, m)) {
      throw new HandoffFlowError("invalid_day", `${month} ayında ${dayOfMonth}. gün yok.`);
    }

    const plan = await prisma.reelPlan.findUnique({
      where: { accountId_month: { accountId: handoff.accountId, month } },
      select: { id: true, status: true },
    });
    if (!plan) {
      throw new HandoffFlowError(
        "plan_not_found",
        `Bu ay (${month}) için plan yok — önce Takvim'den aylık planı kur.`
      );
    }
    if (plan.status === "archived") {
      throw new HandoffFlowError("plan_archived", "Arşivli plana yerleştirme yapılamaz — önce planı geri al.");
    }

    const txResult = await prisma.$transaction(async (tx) => {
      await acquireXactAdvisoryLock(tx, "plan_day:" + plan.id + ":" + dayOfMonth);
      const consumed = await opportunityHandoffService.consume(handoff.id, {}, tx as never);
      if (consumed.alreadyConsumed) {
        return { slotId: consumed.handoff.resultRef, alreadyConsumed: true, reused: false };
      }

      // Gündeki slotları sınıflandır: boş assembler slotu reuse; occupied → 409.
      const daySlots = await tx.reelPlanSlot.findMany({
        where: { planId: plan.id, dayOfMonth },
        select: { id: true, status: true, dossierId: true },
      });
      let reusableId: string | null = null;
      for (const s of daySlots) {
        if (s.status === "skipped") continue;
        const isFree = s.status === "planned" && !s.dossierId;
        if (!isFree) {
          throw new HandoffFlowError("day_occupied", `${dayOfMonth}. günde zaten işlenmiş bir içerik var.`);
        }
        // Başka bir consumed handoff'un slotunu gasp etme.
        const owner = await tx.opportunityHandoff.findFirst({
          where: { accountId: handoff.accountId, action: "plan", status: "consumed", resultRef: s.id },
          select: { id: true },
        });
        if (owner) {
          throw new HandoffFlowError("day_occupied", `${dayOfMonth}. gün başka bir fırsata ayrılmış.`);
        }
        if (!reusableId) reusableId = s.id;
      }

      let slotId: string;
      let reused: boolean;
      if (reusableId) {
        // Boş assembler slotunu yeniden kullan (duplicate satır YOK).
        await tx.reelPlanSlot.update({
          where: { id: reusableId },
          data: {
            pillar: handoff.title.slice(0, 80),
            mixBucket: "reactive",
            topicHint: handoff.topicSeed || handoff.title,
            status: "planned",
          },
        });
        slotId = reusableId;
        reused = true;
      } else {
        const slot = await tx.reelPlanSlot.create({
          data: {
            planId: plan.id,
            dayOfMonth,
            pillar: handoff.title.slice(0, 80),
            mixBucket: "reactive",
            topicHint: handoff.topicSeed || handoff.title,
            status: "planned",
          },
        });
        slotId = slot.id;
        reused = false;
      }
      await tx.opportunityHandoff.update({ where: { id: handoff.id }, data: { resultRef: slotId } });
      return { slotId, alreadyConsumed: false, reused };
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
