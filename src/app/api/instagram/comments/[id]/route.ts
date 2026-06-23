import type { NextRequest } from "next/server";
import { z } from "zod";
import { igCommentRepo } from "@/lib/db/igCommentRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  status: z.enum(["ignored", "new"]),
});

// PATCH /api/instagram/comments/[id] { status: "ignored" | "new" } — Yoksay / geri al
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = PatchSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz durum", 400, { detail: parsed.error.flatten() });
  }
  try {
    const comment = await igCommentRepo.setStatus(id, parsed.data.status);
    return ok({ comment });
  } catch {
    return fail("Bulunamadı", 404);
  }
}
