import type { NextRequest } from "next/server";
import { z } from "zod";
import { accountProfiles, type AccountHandle } from "@/lib/accounts";
import { pipelineService } from "@/lib/services/pipelineService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

// Phase 3 of the split Keşif Motoru run: generate today's drafts from the
// already-discovered (and mined) backlog. Discovery/mining are skipped here —
// they run as their own invocations so no phase can hit the Vercel timeout.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const GenerateDailySchema = z.object({
  handle: z.string().min(1).max(100).optional(),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });

  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);

  const parsed = GenerateDailySchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });

  const handle = parsed.data.handle;
  if (!handle || !(handle in accountProfiles)) {
    return fail("Geçersiz hesap", 400);
  }

  try {
    const summary = await pipelineService.runDailyForAccount(handle as AccountHandle, {
      discover: false,
      mine: false,
    });
    return ok({ ...summary });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const msg = err instanceof Error ? err.message : "Üretim hatası";
    return fail(msg, 500);
  }
}
