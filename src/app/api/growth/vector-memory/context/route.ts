import type { NextRequest } from "next/server";
import { buildMemoryContext, buildMemoryPromptBlock } from "@/lib/growth-engine/vector-memory";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { isKnownAccountHandle as validateAccountHandle } from "@/lib/growth-engine/account-adapter";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";
import { z } from "zod";

const Schema = z
  .object({
    accountHandle: z.enum(["grafikcem", "maskulenkod"]),
    sourceContent: z.string().optional(),
    manualIdea: z.string().optional(),
    draftContent: z.string().optional(),
    limitPerGroup: z.number().int().min(1).optional()
  })
  .refine(
    (data) => {
      return Boolean(
        data.sourceContent?.trim() ||
        data.manualIdea?.trim() ||
        data.draftContent?.trim()
      );
    },
    {
      message: "At least one content field (sourceContent, manualIdea, or draftContent) must be non-empty",
      path: ["sourceContent"]
    }
  );

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const body = await parseJsonBody(req);
    if (!body.ok) return fail("Geçersiz JSON", 400);

    const result = Schema.safeParse(body.data);
    if (!result.success) {
      return fail("Validation error: missing content fields or invalid types", 400);
    }

    const { accountHandle, sourceContent, manualIdea, draftContent, limitPerGroup } = result.data;
    if (!validateAccountHandle(accountHandle)) {
      return fail("Invalid accountHandle", 400);
    }

    const memoryContext = await buildMemoryContext({
      accountHandle,
      sourceContent,
      manualIdea,
      draftContent,
      limitPerGroup
    });

    const promptBlock = buildMemoryPromptBlock(memoryContext);

    return ok({
      memoryContext,
      promptBlock
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    return fail(err instanceof Error ? err.message : "Unknown error", 500);
  }
}
