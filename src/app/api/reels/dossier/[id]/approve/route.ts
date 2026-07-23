import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import { approveDossier } from "@/lib/reels/dossierReviewService";

/**
 * AÇIK insan onayı endpoint'i (ADR-036 §G). Onaydan önce sunucu YENİDEN
 * kontrol eder: sahiplik, güncel sürüm (expectedUpdatedAt), creative readiness,
 * kanıt tazeliği, seri promptVersion. İdempotent: aynı dossier ikinci kez
 * (concurrent dahil) onaylanınca duplicate TrainingExample OLUŞMAZ.
 */

const ApproveSchema = z.object({
  accountId: z.string().min(1).max(64),
  expectedUpdatedAt: z.string().min(10).max(40),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = ApproveSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);
  try {
    const r = await approveDossier({ dossierId: id, ...parsed.data });
    if (!r.ok) {
      const status =
        r.code === "not_found"
          ? 404
          : r.code === "stale" || r.code === "series_version_changed"
            ? 409
            : 422;
      return fail(r.message, status, {
        code: r.code,
        ...("readiness" in r ? { readiness: r.readiness } : {}),
      });
    }
    return ok({ ...r });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Onay başarısız", 500);
  }
}
