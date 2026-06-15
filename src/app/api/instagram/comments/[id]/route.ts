import { NextRequest, NextResponse } from "next/server";
import { igCommentRepo } from "@/lib/db/igCommentRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";

// PATCH /api/instagram/comments/[id] { status: "ignored" | "new" } — Yoksay / geri al
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (status !== "ignored" && status !== "new") {
    return NextResponse.json({ success: false, error: "Geçersiz durum" }, { status: 400 });
  }
  try {
    const comment = await igCommentRepo.setStatus(id, status);
    return NextResponse.json({ success: true, comment });
  } catch {
    return NextResponse.json({ success: false, error: "Bulunamadı" }, { status: 404 });
  }
}
