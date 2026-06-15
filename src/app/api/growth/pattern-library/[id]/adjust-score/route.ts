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
    const body = await req.json();
    const delta = Number(body.delta || 0);

    const pattern = await viralPatternRepo.findById(id);
    if (!pattern) {
      return NextResponse.json({ success: false, error: "Pattern not found" }, { status: 404 });
    }

    const newScore = Math.max(0, Math.min(100, (pattern.successScore ?? 50) + delta));
    const updated = await viralPatternRepo.update(id, { successScore: newScore });

    return NextResponse.json({
      success: true,
      pattern: updated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
