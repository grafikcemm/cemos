import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import { moveSlot } from "@/lib/reels/planSlotService";

export const dynamic = "force-dynamic";

/**
 * Slot taşı/reschedule (ADR-039 §8) — açık kullanıcı eylemi. Gün değişir,
 * dossier bağlantısı KORUNUR; done taşınamaz; hedef gün dolu → 409; ayın gerçek
 * günü doğrulanır; optimistic concurrency.
 */

const BodySchema = z.object({
  accountId: z.string().min(1).max(64),
  targetDay: z.number().int().min(1).max(31),
  expectedUpdatedAt: z.string().min(1).max(40),
});

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  account_mismatch: 422,
  done_immutable: 409,
  day_occupied: 409,
  invalid_day: 422,
  stale: 409,
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id: slotId } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400, { code: "invalid_input" });

  try {
    const result = await moveSlot({
      accountId: parsed.data.accountId,
      slotId,
      targetDay: parsed.data.targetDay,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    });
    if (!result.ok) return fail(result.message, STATUS_BY_CODE[result.code] ?? 422, { code: result.code });
    return ok({ slotId, dayOfMonth: result.dayOfMonth, alreadyThere: result.alreadyThere, updatedAt: result.updatedAt });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Slot taşınamadı", 500);
  }
}
