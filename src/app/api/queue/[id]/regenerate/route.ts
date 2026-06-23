import type { NextRequest } from "next/server";
import { scheduleService } from "@/lib/services/scheduleService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/queue/[id]">
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  try {
    const result = await scheduleService.regenerate(id);
    return ok({ ...result });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 400);
  }
}
