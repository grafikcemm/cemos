import type { NextRequest } from "next/server";
import { searchSimilarExamples } from "@/lib/growth-engine/vector-memory";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { isKnownAccountHandle as validateAccountHandle } from "@/lib/growth-engine/account-adapter";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";
import { z } from "zod";

const Schema = z.object({
  accountHandle: z.enum(["grafikcem", "maskulenkod"]),
  text: z.string().min(1, "text is required"),
  label: z.enum(["positive", "negative", "edited", "pattern", "unknown"]).optional(),
  limit: z.number().int().min(1).optional()
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const body = await parseJsonBody(req);
    if (!body.ok) return fail("Geçersiz JSON", 400);

    const result = Schema.safeParse(body.data);
    if (!result.success) {
      return fail("Validation error: invalid request fields", 400);
    }

    const { accountHandle, text, label, limit } = result.data;
    if (!validateAccountHandle(accountHandle)) {
      return fail("Invalid accountHandle", 400);
    }

    const results = await searchSimilarExamples({
      accountHandle,
      text,
      label,
      limit
    });

    return ok({
      results
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    return fail(err instanceof Error ? err.message : "Unknown error", 500);
  }
}
