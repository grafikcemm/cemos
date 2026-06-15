import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sourceService, SourceServiceError } from "@/lib/services/sourceService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

const addSourceSchema = z.object({
  accountHandle: z.string().min(1),
  handle: z.string().min(1).max(15),
  displayName: z.string().optional(),
  mode: z.enum(["ALL", "TWEET", "QUOTE", "REPLY"]).optional(),
  thresholdLikes: z.number().int().min(0).optional(),
  thresholdRetweets: z.number().int().min(0).optional(),
});

export async function GET(req: NextRequest) {
  const accountHandle = req.nextUrl.searchParams.get("account");
  if (!accountHandle) {
    return NextResponse.json({ success: false, error: "account param gerekli" }, { status: 400 });
  }

  try {
    const sources = await sourceService.listSources(accountHandle);
    return NextResponse.json({ success: true, sources });
  } catch (err) {
    if (err instanceof SourceServiceError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = addSourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz istek" }, { status: 400 });
  }

  try {
    const source = await sourceService.addSource(parsed.data);
    return NextResponse.json({ success: true, source }, { status: 201 });
  } catch (err) {
    if (err instanceof SourceServiceError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
