import { NextRequest, NextResponse } from "next/server";
import { learnService } from "@/lib/learning/learnService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";

export const dynamic = "force-dynamic";

// GET /api/learn/packs/[id] — Learning Pack detayı (UI).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isLearnEnabled()) {
    return NextResponse.json({ success: false, code: "disabled" }, { status: 404 });
  }
  const { id } = await ctx.params;
  const pack = await learnService.getPackDetail(id);
  if (!pack) {
    return NextResponse.json({ success: false, error: "Bulunamadı" }, { status: 404 });
  }
  return NextResponse.json({ success: true, pack });
}
