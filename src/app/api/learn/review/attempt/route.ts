import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reviewService } from "@/lib/learning/reviewService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import type { ReviewGrade } from "@/lib/learning/scheduling/srs";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  itemId: z.string().min(1),
  grade: z.number().int().min(0).max(3),
  responseMs: z.number().int().min(0).max(3_600_000).default(0),
  correct: z.boolean().optional(),
});

// POST /api/learn/review/attempt { itemId, grade, responseMs?, correct? }
export async function POST(req: NextRequest) {
  if (!isLearnEnabled()) {
    return NextResponse.json({ success: false, code: "disabled" }, { status: 404 });
  }
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Geçersiz istek" }, { status: 400 });
  }
  try {
    const result = await reviewService.grade({
      itemId: parsed.data.itemId,
      grade: parsed.data.grade as ReviewGrade,
      responseMs: parsed.data.responseMs,
      correct: parsed.data.correct,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "item_not_found") {
      return NextResponse.json({ success: false, code: "not_found", error: msg }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
