import type { NextRequest } from "next/server";
import { z } from "zod";
import { accountProfiles, type AccountHandle } from "@/lib/accounts";
import { miningService } from "@/lib/services/miningService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { budgetErrorResponse } from "@/lib/utils/budgetErrorResponse";

/**
 * Manual trigger for the deliberation council + viral pattern mining for one
 * account. Returns the per-item council verdicts so the UI can show WHY each
 * piece of content was mined or skipped ("müzakere" transparency).
 */
// Council deliberation is the slowest phase — give it the full window.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MineSchema = z.object({
  handle: z.string().min(1).max(100).optional(),
  limit: z.number().optional(),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });

  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);

  const parsed = MineSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });

  const handle = parsed.data.handle;
  if (!handle || !(handle in accountProfiles)) {
    return fail("Geçersiz hesap", 400);
  }

  // Clamp: each mined item costs council + analysis + embedding LLM calls.
  const limit = Math.min(5, Math.max(1, Math.floor(parsed.data.limit ?? 5)));

  try {
    const result = await miningService.mineTopItems(handle as AccountHandle, limit);
    return ok({ ...result });
  } catch (err) {
    const budgetRes = budgetErrorResponse(err);
    if (budgetRes) return budgetRes;
    const msg = err instanceof Error ? err.message : "Madencilik hatası";
    return fail(msg, 500);
  }
}
