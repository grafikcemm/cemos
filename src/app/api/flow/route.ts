import type { NextRequest } from "next/server";
import { createSourcePosts } from "@/lib/agent/source-engine";
import type { AccountHandle } from "@/lib/accounts";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

export async function POST(request: NextRequest) {
  if (!isOperatorOrCronAuthorized(request)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody<{ account?: AccountHandle | "all"; perAccount?: unknown }>(request);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const account = (body.data.account ?? "all") as AccountHandle | "all";
  const perAccount = Number(body.data.perAccount ?? 5);

  try {
    return ok({
      scannedAt: new Date().toISOString(),
      posts: createSourcePosts(account, perAccount),
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
