import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

const patchSchema = z.object({
  isRead: z.boolean().optional(),
  isUsed: z.boolean().optional(),
  // retry: re-queue a failed/quarantined item back into the pipeline.
  retry: z.boolean().optional(),
});

// PATCH /api/news-pool/[id]  — toggle isRead/isUsed or retry a failed item.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = patchSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz istek", 400);
  }

  try {
    const existing = await prisma.newsItem.findUnique({ where: { id } });
    if (!existing) {
      return fail("Bulunamadı", 404);
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
    return ok({ item });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
