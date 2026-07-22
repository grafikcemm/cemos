import type { NextRequest } from "next/server";
import { reviewService } from "@/lib/learning/reviewService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

// GET /api/learn/review?limit= — bugün due tekrar oturumu (en zayıf kavram önce).
// Aggregate öğrenme içeriği döndürür → same-origin guard (diğer mutation route'larla tutarlı).
export async function GET(req: NextRequest) {
  if (!isLearnEnabled()) {
    return fail("disabled", 404, { code: "disabled" });
  }
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 10;
  const items = await reviewService.getSession(limit);
  return ok({ items });
}
