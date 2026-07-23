import type { NextRequest } from "next/server";
import { z } from "zod";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import {
  HandoffFlowError,
  handoffErrorResponse,
  opportunityHandoffService,
} from "@/lib/services/opportunityHandoffService";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({ op: z.literal("cancel") });

// PATCH /api/opportunities/handoff/[id] — yalnız state machine üzerinden
// (op=cancel). Doğrudan status yazımı YOK.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON gövdesi", 400);
  const parsed = PatchSchema.safeParse(body.data);
  if (!parsed.success) return fail("Desteklenmeyen işlem — yalnız op=cancel.", 422, { code: "invalid_op" });
  try {
    const handoff = await opportunityHandoffService.cancel(id);
    return ok({ handoff });
  } catch (err) {
    if (err instanceof HandoffFlowError) {
      const r = handoffErrorResponse(err);
      return fail(r.error, r.status, { code: r.code });
    }
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Sunucu hatası", 500);
  }
}
