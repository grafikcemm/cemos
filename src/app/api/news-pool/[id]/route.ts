import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

const patchSchema = z.object({
  isRead: z.boolean().optional(),
  isUsed: z.boolean().optional(),
  // retry: re-queue a failed/quarantined item back into the pipeline.
  retry: z.boolean().optional(),
});

// PATCH /api/news-pool/[id]  — toggle isRead/isUsed or retry a failed item.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Geçersiz istek" }, { status: 400 });
  }

  try {
    const existing = await prisma.newsItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Bulunamadı" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.isRead !== undefined) data.isRead = parsed.data.isRead;
    if (parsed.data.isUsed !== undefined) data.isUsed = parsed.data.isUsed;

    if (parsed.data.retry) {
      // Send the item back to the earliest stage it still needs.
      const target = existing.translationStatus === "success" ? "translated" : "raw";
      data.processingStatus = target;
      data.translationStatus = existing.translationStatus === "success" ? "success" : "pending";
      data.analysisStatus = "pending";
      data.errorMessage = null;
    }

    const item = await prisma.newsItem.update({ where: { id }, data });
    return NextResponse.json({ success: true, item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
