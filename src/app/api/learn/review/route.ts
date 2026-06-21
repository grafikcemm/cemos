import { NextRequest, NextResponse } from "next/server";
import { reviewService } from "@/lib/learning/reviewService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";

// GET /api/learn/review?limit= — bugün due tekrar oturumu (en zayıf kavram önce).
// Aggregate öğrenme içeriği döndürür → same-origin guard (diğer mutation route'larla tutarlı).
export async function GET(req: NextRequest) {
  if (!isLearnEnabled()) {
    return NextResponse.json({ success: false, code: "disabled" }, { status: 404 });
  }
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 10;
  const items = await reviewService.getSession(limit);
  return NextResponse.json({ success: true, items });
}
