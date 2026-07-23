import type { NextRequest } from "next/server";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import {
  HandoffActionSchema,
  HandoffStatusSchema,
  opportunityHandoffService,
} from "@/lib/services/opportunityHandoffService";

export const dynamic = "force-dynamic";

// GET /api/opportunities/handoff?action=&status=&accountId=&resultRef=
// Hedef yüzeyler (Bugün/Takvim/Seriler) bekleyen aktarımları buradan yükler —
// reload sonrası handoff kaybolmaz (ADR-028).
export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const sp = req.nextUrl.searchParams;
  const action = HandoffActionSchema.safeParse(sp.get("action") ?? undefined);
  const status = HandoffStatusSchema.safeParse(sp.get("status") ?? "pending");
  try {
    const handoffs = await opportunityHandoffService.list({
      action: action.success ? action.data : undefined,
      status: status.success ? status.data : "pending",
      accountId: sp.get("accountId") ?? undefined,
      resultRef: sp.get("resultRef") ?? undefined,
    });
    return ok({ handoffs });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Sunucu hatası", 500);
  }
}

// POST /api/opportunities/handoff — Fırsatlar eylemi typed handoff'a dönüşür.
// Idempotent: aynı fırsat+eylem ikinci kez satır yaratmaz (fingerprint unique).
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON gövdesi", 400);
  try {
    const { handoff, reused } = await opportunityHandoffService.createHandoff(body.data);
    return ok({ handoff, reused }, { status: reused ? 200 : 201 });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      return fail("Geçersiz aktarım verisi", 422, { code: "invalid_input" });
    }
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Sunucu hatası", 500);
  }
}
