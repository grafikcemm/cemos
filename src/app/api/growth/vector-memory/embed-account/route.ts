import type { NextRequest } from "next/server";
import { embedTrainingExamplesByAccount } from "@/lib/growth-engine/vector-memory";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { isKnownAccountHandle as validateAccountHandle } from "@/lib/growth-engine/account-adapter";
import { accountRepo } from "@/lib/db/accountRepo";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";
import { z } from "zod";

const Schema = z.object({
  accountHandle: z.enum(["grafikcem", "maskulenkod"])
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const body = await parseJsonBody(req);
    if (!body.ok) return fail("Geçersiz JSON", 400);

    const result = Schema.safeParse(body.data);
    if (!result.success) {
      return fail("Validation error: invalid accountHandle", 400);
    }

    const { accountHandle } = result.data;
    if (!validateAccountHandle(accountHandle)) {
      return fail("Invalid accountHandle", 400);
    }

    const dbAccount = await accountRepo.findByHandle(accountHandle);
    if (!dbAccount) {
      return fail(`Account profile not found in DB for handle: ${accountHandle}`, 400);
    }

    const stats = await embedTrainingExamplesByAccount(dbAccount.id);

    return ok({
      ...stats
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    return fail(err instanceof Error ? err.message : "Unknown error", 500);
  }
}
