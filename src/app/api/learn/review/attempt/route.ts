import type { NextRequest } from "next/server";
import { z } from "zod";
import { reviewService } from "@/lib/learning/reviewService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import type { ReviewGrade } from "@/lib/learning/scheduling/srs";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  itemId: z.string().min(1),
  grade: z.number().int().min(0).max(3),
  responseMs: z.number().int().min(0).max(3_600_000).default(0),
  correct: z.boolean().optional(),
  idempotencyKey: z.string().min(1).max(200).optional(), // 4C-H çift-gönderim koruması
});

// POST /api/learn/review/attempt { itemId, grade, responseMs?, correct? }
export async function POST(req: NextRequest) {
  if (!isLearnEnabled()) {
    return fail("disabled", 404, { code: "disabled" });
  }
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz istek", 400);
  }
  try {
    const result = await reviewService.grade({
      itemId: parsed.data.itemId,
      grade: parsed.data.grade as ReviewGrade,
      responseMs: parsed.data.responseMs,
      correct: parsed.data.correct,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return ok({ ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "item_not_found") {
      return fail(msg, 404, { code: "not_found" });
    }
    return fail(msg, 500);
  }
}
