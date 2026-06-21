import { NextRequest, NextResponse } from "next/server";
import { learnService } from "@/lib/learning/learnService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { BudgetExceededError } from "@/lib/config/costGate";
import { TranscriptUnavailableError } from "@/lib/learning/pipeline/orchestrator";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// POST /api/learn/jobs/[id]/advance — job'ı bir deadline kadar ilerletir (resumable).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isLearnEnabled()) {
    return NextResponse.json({ success: false, code: "disabled" }, { status: 404 });
  }
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    const result = await learnService.advance(id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return NextResponse.json(
        { success: false, code: "budget", error: err.message },
        { status: 429 }
      );
    }
    if (err instanceof TranscriptUnavailableError) {
      return NextResponse.json(
        { success: false, code: "transcript_unavailable", error: err.message },
        { status: 422 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "job_not_found") {
      return NextResponse.json({ success: false, code: "not_found", error: msg }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
