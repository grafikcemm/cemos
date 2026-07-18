import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { transitionPlanStatus } from "@/lib/reels/planReconcileService";

export const dynamic = "force-dynamic";

/**
 * Plan lifecycle (Phase 3E, ADR-039 §7C) — server state machine. draft/active/
 * archived geçişleri; apply otomatik active YAPMAZ, aktivasyon açık kullanıcı
 * eylemi; uyarı varsa açık onay (acknowledgeWarnings). Archive non-destructive;
 * archived → active/draft yeniden mümkün. İstemci status'u doğrudan yazamaz.
 */

const BodySchema = z.object({
  accountId: z.string().min(1).max(64),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  target: z.enum(["draft", "active", "archived"]),
  expectedUpdatedAt: z.string().min(1).max(40),
  acknowledgeWarnings: z.boolean().optional(),
});

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  stale: 409,
  invalid_transition: 422,
  ack_required: 422,
};

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400, { code: "invalid_input" });

  try {
    const result = await transitionPlanStatus(parsed.data);
    if (!result.ok) {
      return fail(result.message, STATUS_BY_CODE[result.code] ?? 422, { code: result.code });
    }
    return ok({ status: result.status, updatedAt: result.updatedAt });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Durum değiştirilemedi", 500);
  }
}
