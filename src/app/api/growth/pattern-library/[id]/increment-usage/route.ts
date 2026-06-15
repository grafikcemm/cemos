import { NextRequest, NextResponse } from "next/server";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const updated = await viralPatternRepo.incrementUsage(id);
    return NextResponse.json({
      success: true,
      pattern: updated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
