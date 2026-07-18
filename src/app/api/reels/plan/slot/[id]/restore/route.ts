import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { restoreSlot } from "@/lib/reels/planSlotService";

export const dynamic = "force-dynamic";

/**
 * Slot geri al/restore (ADR-039 §8) — skipped → planned (dossier varsa drafted).
 * Yalnız atlanmış slot; optimistic concurrency.
 */

const BodySchema = z.object({
  accountId: z.string().min(1).max(64),
  expectedUpdatedAt: z.string().min(1).max(40),
});

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  account_mismatch: 422,
  not_skipped: 422,
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
    const result = await restoreSlot({
      accountId: parsed.data.accountId,
      slotId,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    });
    if (!result.ok) return fail(result.message, STATUS_BY_CODE[result.code] ?? 422, { code: result.code });
    return ok({ slotId, status: result.status, updatedAt: result.updatedAt });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Slot geri alınamadı", 500);
  }
}
