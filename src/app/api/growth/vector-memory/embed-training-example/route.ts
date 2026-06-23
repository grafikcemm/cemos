import type { NextRequest } from "next/server";
import { embedTrainingExample } from "@/lib/growth-engine/vector-memory";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";
import { z } from "zod";

const Schema = z.object({
  exampleId: z.string().min(1, "exampleId is required"),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const body = await parseJsonBody(req);
    if (!body.ok) return fail("Geçersiz JSON", 400);

    const result = Schema.safeParse(body.data);
    if (!result.success) {
      return fail("Validation error", 400, { details: result.error.format() });
    }

    const { exampleId } = result.data;
    const embedding = await embedTrainingExample(exampleId);

    return ok({
      embedding: {
        provider: embedding.provider,
        model: embedding.model,
        dimensions: embedding.dimensions,
        createdAt: embedding.createdAt,
      },
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const msg = err instanceof Error ? err.message : "Unknown error";
    return fail(msg, msg.includes("not found") ? 404 : 500);
  }
}
