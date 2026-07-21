import type { NextRequest } from "next/server";
import { learnService } from "@/lib/learning/learnService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { budgetErrorResponse } from "@/lib/utils/budgetErrorResponse";
import { TranscriptUnavailableError } from "@/lib/learning/pipeline/orchestrator";
import { ok, fail } from "@/lib/utils/apiResponse";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// POST /api/learn/jobs/[id]/advance — job'ı bir deadline kadar ilerletir (resumable).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isLearnEnabled()) {
    return fail("disabled", 404, { code: "disabled" });
  }
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  try {
    const result = await learnService.advance(id);
    return ok({ ...result });
  } catch (err) {
    const budgetRes = budgetErrorResponse(err);
    if (budgetRes) return budgetRes;
    if (err instanceof TranscriptUnavailableError) {
      return fail(err.message, 422, { code: "transcript_unavailable" });
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "job_not_found") {
      return fail(msg, 404, { code: "not_found" });
    }
    return fail(msg, 500);
  }
}
