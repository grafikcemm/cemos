import type { NextRequest } from "next/server";
import { z } from "zod";
import { learnService, InvalidSourceUrlError } from "@/lib/learning/learnService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

function disabled() {
  return fail("disabled", 404, { code: "disabled" });
}

const PostSchema = z.object({
  url: z.string().trim().min(1),
  manualTranscript: z.string().max(500_000).optional(),
});

// GET /api/learn/sources — dashboard (kaynaklar + sayaçlar).
export async function GET() {
  if (!isLearnEnabled()) return disabled();
  const data = await learnService.dashboard();
  return ok({ ...data });
}

// POST /api/learn/sources { url, manualTranscript? } — kaynak + işleme job'ı yaratır.
export async function POST(req: NextRequest) {
  if (!isLearnEnabled()) return disabled();
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = PostSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("url gerekli", 400, { detail: parsed.error.flatten() });
  }
  try {
    const result = await learnService.createSource({
      url: parsed.data.url,
      manualTranscript: parsed.data.manualTranscript,
    });
    return ok({ ...result });
  } catch (err) {
    if (err instanceof InvalidSourceUrlError) {
      return fail(err.message, 400, { code: "invalid_url" });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return fail(msg, 500);
  }
}
