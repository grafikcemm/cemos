import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { fail } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

// POST /api/toolbox/[id]/favorite — toggle the isFavorite flag (DB-persisted).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  try {
    const existing = await prisma.toolboxResource.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Kaynak bulunamadı" }, { status: 404 });
    }

    const updated = await prisma.toolboxResource.update({
      where: { id },
      data: { isFavorite: !existing.isFavorite },
    });

    return NextResponse.json({ success: true, isFavorite: updated.isFavorite });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
