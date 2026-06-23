import { NextRequest } from "next/server";
import { z } from "zod";
import { draftService } from "@/lib/services/draftService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

const GenerateSchema = z
  .object({
    channel: z.string().min(1),
    sourcePostId: z.string().optional(),
    sourceTweet: z.string().max(20000).optional(),
    sourceHandle: z.string().optional(),
    draftType: z.string().optional(),
    mode: z.string().optional(),
  })
  .refine((b) => Boolean(b.sourceTweet || b.sourcePostId), {
    message: "sourceTweet veya sourcePostId gerekli",
  });

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return fail("Yetkisiz", 403, { code: "forbidden" });
  }
  try {
    const parsedBody = await parseJsonBody(req);
    if (!parsedBody.ok) return fail("Geçersiz JSON", 400);
    const parsed = GenerateSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
    }
    const body = parsed.data;

    const result = await draftService.generateDraft({
      accountHandle: body.channel,
      sourcePostId: body.sourcePostId,
      sourceTweet: body.sourceTweet,
      sourceHandle: body.sourceHandle,
      draftType: body.draftType,
      mode: body.mode,
    });

    return ok({
      channel: body.channel,
      draftType: body.draftType ?? "TWEET",
      generated: result.generated,
      charCount: result.generated.length,
      queueItemId: result.queueItem?.id,
      estimatedCostUsd: result.estimatedCostUsd,
      usedMock: result.usedMock,
      candidates: result.candidates,
      timings: result.timings,
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return fail(err.message, 402, { code: "budget" });
    }
    const msg = err instanceof Error ? err.message : "Generation hatası";
    return fail(msg, 500);
  }
}
