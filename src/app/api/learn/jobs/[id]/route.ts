import type { NextRequest } from "next/server";
import { learnService } from "@/lib/learning/learnService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { ok, fail } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";

// GET /api/learn/jobs/[id] — job durumu (processing ekranı poll'u).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("unauthorized", 403);
  if (!isLearnEnabled()) {
    return fail("disabled", 404, { code: "disabled" });
  }
  try {
    const { id } = await ctx.params;
    const job = await learnService.getJob(id);
    if (!job) {
      return fail("Bulunamadı", 404);
    }
    return ok({ job });
  } catch (err) {
    // WP-01 straggler: catch'siz handler uncaught-500 sızdırıyordu.
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Job durumu alınamadı", 500);
  }
}
