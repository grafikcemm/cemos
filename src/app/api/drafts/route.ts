import type { NextRequest } from "next/server";
import { accountProfiles, type AccountHandle } from "@/lib/accounts";
import { runDraftPipeline } from "@/lib/ai/draft-pipeline";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

export async function POST(request: NextRequest) {
  if (!isOperatorOrCronAuthorized(request)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody<{ account?: AccountHandle; sourceInput?: unknown }>(request);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  try {
    const account = body.data.account;
    const sourceInput = String(body.data.sourceInput ?? "");

    if (!account || !accountProfiles[account]) {
      return fail("Unknown account.", 400);
    }

    if (!sourceInput.trim()) {
      return fail("sourceInput is required.", 400);
    }

    const result = await runDraftPipeline(accountProfiles[account], sourceInput);
    return ok({ result });
  } catch (error) {
    if (error instanceof BudgetExceededError) return fail(error.message, 402, { code: "budget" });
    const message = error instanceof Error ? error.message : "Draft generation failed.";
    return fail(message, 500);
  }
}
