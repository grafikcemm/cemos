import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export const dynamic = "force-dynamic";

/**
 * Slot ↔ dossier bağlantısını kaldırma (ADR-038 §F) — açık kullanıcı eylemi.
 *  - Dossier FİZİKSEL SİLİNMEZ; yalnız slot ilişkisi çözülür, slot "planned"e
 *    döner. Dossier'i başka slota taşımak = detach + attach (iki açık eylem).
 *  - `expectedDossierId` fail-closed: slotta bu arada başka dossier varsa
 *    işlem uygulanmaz (yanlış bağlantı çözülemez).
 *  - "done" slot çözülemez (işlenmiş içerik geçmişi korunur) → 409.
 *  - İdempotent: slot zaten boşsa alreadyDetached.
 */

const DetachSchema = z.object({
  accountId: z.string().min(1).max(64),
  expectedDossierId: z.string().min(1).max(64),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id: slotId } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = DetachSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);
  const { accountId, expectedDossierId } = parsed.data;

  try {
    const slot = await prisma.reelPlanSlot.findUnique({
      where: { id: slotId },
      include: { plan: { select: { accountId: true } } },
    });
    if (!slot) return fail("Slot bulunamadı", 404, { code: "slot_not_found" });
    if (slot.plan.accountId !== accountId) {
      return fail("Slot bu hesaba ait değil", 422, { code: "account_mismatch" });
    }
    if (!slot.dossierId) {
      return ok({ slotId, alreadyDetached: true });
    }
    if (slot.dossierId !== expectedDossierId) {
      return fail("Slota bu arada başka bir dossier bağlandı — yenile", 409, {
        code: "dossier_mismatch",
      });
    }
    if (slot.status === "done") {
      return fail("İşlenmiş (done) slotun bağlantısı çözülemez", 409, { code: "slot_done" });
    }

    // Atomik: yalnız beklenen dossier hâlâ bağlıysa çözülür (yarış → 409).
    const released = await prisma.reelPlanSlot.updateMany({
      where: { id: slotId, dossierId: expectedDossierId, status: { not: "done" } },
      data: { dossierId: null, status: "planned" },
    });
    if (released.count === 0) {
      return fail("Slot bu arada değişti — yenileyip tekrar dene", 409, { code: "slot_race" });
    }
    return ok({ slotId, alreadyDetached: false, detachedDossierId: expectedDossierId });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Bağlantı kaldırılamadı", 500);
  }
}
