import type { NextRequest } from "next/server";
import { z } from "zod";
import { sourceService, SourceServiceError } from "@/lib/services/sourceService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

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
    return fail("account param gerekli", 400);
  }

  try {
    const sources = await sourceService.listSources(accountHandle);
    return ok({ sources });
  } catch (err) {
    if (err instanceof SourceServiceError) {
      return fail(err.message, 400, { code: err.code });
    }
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = addSourceSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Geçersiz istek", 400);
  }

  try {
    const source = await sourceService.addSource(parsed.data);
    return ok({ source }, { status: 201 });
  } catch (err) {
    if (err instanceof SourceServiceError) {
      return fail(err.message, 409, { code: err.code });
    }
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
