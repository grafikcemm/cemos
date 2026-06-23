import type { NextRequest } from "next/server";
import { scanService } from "@/lib/services/scanService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody<{ channel?: string; limit?: number }>(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);

  const { channel, limit = 10 } = body.data;

  if (!channel) {
    return fail("Gecersiz kanal", 400);
  }

  try {
    const result = await scanService.scanAccount(channel, limit);
    return ok({
      channel,
      scannedAt: new Date().toISOString(),
      scanRunId: result.scanRunId,
      sourcesScanned: result.sourcesScanned,
      tweetsFound: result.tweetsFound,
      postsInserted: result.postsInserted,
      duplicatesFound: result.duplicatesFound,
      retweetsSkipped: result.retweetsSkipped,
      estimatedCostUSD: result.estimatedCostUsd.toFixed(4),
      errors: result.errors,
      posts: result.posts,
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const msg = err instanceof Error ? err.message : "Tarama hatası";
    return fail(msg, 500);
  }
}
