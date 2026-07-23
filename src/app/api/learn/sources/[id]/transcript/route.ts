import type { NextRequest } from "next/server";
import { z } from "zod";
import { learnService } from "@/lib/learning/learnService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export const dynamic = "force-dynamic";

const PostSchema = z.object({
  text: z.string().max(500_000).optional(),
});

// POST /api/learn/sources/[id]/transcript { text } — transkript-yok sonrası manuel yapıştırma.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isLearnEnabled()) {
    return fail("disabled", 404, { code: "disabled" });
  }
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = PostSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
  }
  const text = typeof parsed.data.text === "string" ? parsed.data.text : "";
  try {
    const okResult = await learnService.setManualTranscript(id, text);
    if (!okResult) {
      return fail("Transkript çok kısa (en az 200 karakter).", 400, { code: "too_short" });
    }
    return ok();
  } catch (err) {
    // WP-01 straggler: catch'siz handler uncaught-500 sızdırıyordu.
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Transkript kaydedilemedi", 500);
  }
}
