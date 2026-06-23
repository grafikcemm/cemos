import type { NextRequest } from "next/server";
import { processFeedback } from "@/lib/growth-engine/feedback-service";
import { ZodError } from "zod";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const body = await parseJsonBody(req);
    if (!body.ok) return fail("Geçersiz JSON", 400);

    const result = await processFeedback(body.data);
    const { success: _ok, ...payload } = result;
    return ok(payload);
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });

    if (err instanceof ZodError) {
      return fail("Validation failed", 400, { details: err.errors });
    }

    const message = err instanceof Error ? err.message : "Unexpected system error";

    // Check for explicit input validation issues that warrant 400 Bad Request
    if (
      message.includes("Invalid accountHandle") ||
      message.includes("No content provided")
    ) {
      return fail(message, 400);
    }

    return fail(message, 500);
  }
}
