import { NextRequest, NextResponse } from "next/server";
import { learnService } from "@/lib/learning/learnService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { buildObsidianBundle } from "@/lib/learning/obsidian";

export const dynamic = "force-dynamic";

// GET /api/learn/packs/[id]/obsidian — Obsidian markdown dosyaları (client ZIP'ler).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isLearnEnabled()) {
    return NextResponse.json({ success: false, code: "disabled" }, { status: 404 });
  }
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const pack = await learnService.getPackDetail(id);
  if (!pack) {
    return NextResponse.json({ success: false, error: "Bulunamadı" }, { status: 404 });
  }
  const bundle = buildObsidianBundle(pack, new Date().toISOString());
  return NextResponse.json({ success: true, ...bundle });
}
