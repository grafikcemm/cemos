import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sourceService, SourceServiceError } from "@/lib/services/sourceService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

const updateSchema = z.object({
  displayName: z.string().optional(),
  enabled: z.boolean().optional(),
  mode: z.enum(["ALL", "TWEET", "QUOTE", "REPLY"]).optional(),
  thresholdLikes: z.number().int().min(0).optional(),
  thresholdRetweets: z.number().int().min(0).optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/sources/[id]">
) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Geçersiz istek" }, { status: 400 });
  }

  try {
    const source = await sourceService.updateSource(id, parsed.data);
    return NextResponse.json({ success: true, source });
  } catch (err) {
    if (err instanceof SourceServiceError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: 404 });
    }
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/sources/[id]">
) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  try {
    const source = await sourceService.archiveSource(id);
    return NextResponse.json({ success: true, source });
  } catch (err) {
    if (err instanceof SourceServiceError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: 404 });
    }
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
