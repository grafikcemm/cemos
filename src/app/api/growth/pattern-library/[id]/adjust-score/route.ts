import type { NextRequest } from "next/server";
import { z } from "zod";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

const AdjustScoreSchema = z.object({
  delta: z.number().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const { id } = await params;
    const body = await parseJsonBody(req);
    if (!body.ok) return fail("Geçersiz JSON", 400);

    const parsed = AdjustScoreSchema.safeParse(body.data);
    if (!parsed.success) return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });

    const delta = Number(parsed.data.delta || 0);

    const pattern = await viralPatternRepo.findById(id);
    if (!pattern) {
      return fail("Pattern not found", 404);
    }

    const newScore = Math.max(0, Math.min(100, (pattern.successScore ?? 50) + delta));
    const updated = await viralPatternRepo.update(id, { successScore: newScore });

    return ok({
      pattern: updated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return fail(msg, 500);
  }
}
