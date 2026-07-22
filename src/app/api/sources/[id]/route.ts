import type { NextRequest } from "next/server";
import { z } from "zod";
import { sourceService, SourceServiceError } from "@/lib/services/sourceService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

const updateSchema = z.object({
  displayName: z.string().optional(),
  enabled: z.boolean().optional(),
  mode: z.enum(["ALL", "TWEET", "QUOTE", "REPLY"]).optional(),
  thresholdLikes: z.number().int().min(0).optional(),
  thresholdRetweets: z.number().int().min(0).optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = updateSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz istek", 400);
  }

  try {
    const source = await sourceService.updateSource(id, parsed.data);
    return ok({ source });
  } catch (err) {
    if (err instanceof SourceServiceError) {
      return fail(err.message, 404, { code: err.code });
    }
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;

  try {
    const source = await sourceService.archiveSource(id);
    return ok({ source });
  } catch (err) {
    if (err instanceof SourceServiceError) {
      return fail(err.message, 404, { code: err.code });
    }
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
