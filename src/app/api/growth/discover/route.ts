import type { NextRequest } from "next/server";
import { z } from "zod";
import { accountProfiles, type AccountHandle } from "@/lib/accounts";
import { discoveryService } from "@/lib/services/discoveryService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { budgetErrorResponse } from "@/lib/utils/budgetErrorResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

// Phase 1 of the split Keşif Motoru run (discover → mine → generate). Each
// phase gets its own invocation so no single call can hit the Vercel timeout.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const DiscoverSchema = z.object({
  handle: z.string().min(1).max(100).optional(),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });

  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);

  const parsed = DiscoverSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });

  const handle = parsed.data.handle;
  if (!handle || !(handle in accountProfiles)) {
    return fail("Geçersiz hesap", 400);
  }

  try {
    const summary = await discoveryService.discoverForAccount(handle as AccountHandle);
    return ok({ ...summary });
  } catch (err) {
    const budgetRes = budgetErrorResponse(err);
    if (budgetRes) return budgetRes;
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Keşif hatası";
    return fail(msg, 500);
  }
}
