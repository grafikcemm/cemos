import type { NextRequest } from "next/server";
import { accountList, accountProfiles, type AccountHandle } from "@/lib/accounts";
import { runAccountBenchmark } from "@/lib/ai/benchmark";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

export async function POST(request: NextRequest) {
  if (!isOperatorOrCronAuthorized(request)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody<{ account?: AccountHandle | "all" }>(request);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  try {
    const account = body.data.account;
    const profiles =
      account && account !== "all" ? [accountProfiles[account]].filter(Boolean) : accountList;

    if (profiles.length === 0) {
      return fail("Unknown account.", 400);
    }

    const results = await Promise.all(profiles.map((profile) => runAccountBenchmark(profile)));
    return ok({ results });
  } catch (error) {
    if (error instanceof BudgetExceededError) return fail(error.message, 402, { code: "budget" });
    const message = error instanceof Error ? error.message : "Benchmark failed.";
    return fail(message, 500);
  }
}
