import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

/**
 * Slot ↔ dossier bağlama (ADR-036 §I) — YALNIZ açık kullanıcı eylemiyle.
 * Atomik claim (updateMany: yalnız dossierId=null slot), idempotent (aynı
 * dossier tekrar bağlanınca alreadyAttached), cross-account fail-closed
 * (dossier.accountId === plan.accountId zorunlu). Dossier'siz slot sahte
 * "hazır" görünmez — bağlama ayrı, üretim ayrı eylemdir.
 */

const AttachSchema = z.object({
  accountId: z.string().min(1).max(64),
  dossierId: z.string().min(1).max(64),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id: slotId } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = AttachSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);
  const { accountId, dossierId } = parsed.data;

  try {
    const slot = await prisma.reelPlanSlot.findUnique({
      where: { id: slotId },
      include: { plan: { select: { accountId: true } } },
    });
    if (!slot) return fail("Slot bulunamadı", 404, { code: "slot_not_found" });
    if (slot.plan.accountId !== accountId) {
      return fail("Slot bu hesaba ait değil", 422, { code: "account_mismatch" });
    }
    const dossier = await prisma.reelDossier.findUnique({
      where: { id: dossierId },
      select: { accountId: true },
    });
    if (!dossier) return fail("Dossier bulunamadı", 404, { code: "dossier_not_found" });
    if (dossier.accountId !== slot.plan.accountId) {
      // Başka hesabın dossier'i slota bağlanamaz.
      return fail("Dossier bu hesaba ait değil", 422, { code: "dossier_account_mismatch" });
    }

    if (slot.dossierId === dossierId) {
      return ok({ slotId, dossierId, alreadyAttached: true });
    }
    if (slot.dossierId) {
      return fail("Slota zaten başka bir dossier bağlı", 409, { code: "slot_occupied" });
    }

    // Atomik claim: yalnız hâlâ boş slot güncellenir (yarış → 409).
    const claimed = await prisma.reelPlanSlot.updateMany({
      where: { id: slotId, dossierId: null },
      data: { dossierId, status: "drafted" },
    });
    if (claimed.count === 0) {
      return fail("Slot bu arada bağlandı — yenileyip tekrar dene", 409, { code: "slot_race" });
    }
    return ok({ slotId, dossierId, alreadyAttached: false });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Bağlama başarısız", 500);
  }
}
