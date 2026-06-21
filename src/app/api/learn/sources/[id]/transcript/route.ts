import { NextRequest, NextResponse } from "next/server";
import { learnService } from "@/lib/learning/learnService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";

// POST /api/learn/sources/[id]/transcript { text } — transkript-yok sonrası manuel yapıştırma.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isLearnEnabled()) {
    return NextResponse.json({ success: false, code: "disabled" }, { status: 404 });
  }
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  const ok = await learnService.setManualTranscript(id, text);
  if (!ok) {
    return NextResponse.json(
      { success: false, code: "too_short", error: "Transkript çok kısa (en az 200 karakter)." },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: true });
}
