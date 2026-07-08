import type { NextRequest } from "next/server";
import { z } from "zod";
import { generateDrafts } from "@/lib/growth-engine/draft-generator";
import { isKnownAccountHandle as validateAccountHandle } from "@/lib/growth-engine/account-adapter";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

const GenerateDraftsSchema = z.object({
  accountHandle: z.string().max(100).optional(),
  actionType: z.string().max(50).optional(),
  sourcePostId: z.string().max(200).optional(),
  sourceContent: z.string().max(10000).optional(),
  sourceUrl: z.string().max(2000).optional(),
  sourceHandle: z.string().max(100).optional(),
  modeId: z.string().max(100).optional(),
  patternId: z.string().max(200).optional(),
  patternName: z.string().max(200).optional(),
  manualIdea: z.string().max(10000).optional(),
  count: z.number().optional(),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });

  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);

  const parsed = GenerateDraftsSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });

  try {
    const {
      accountHandle,
      actionType,
      sourcePostId,
      sourceContent,
      sourceUrl,
      sourceHandle,
      modeId,
      patternId,
      patternName,
      manualIdea,
      count = 3
    } = parsed.data;

    // 1. Validate accountHandle
    if (!accountHandle || !validateAccountHandle(accountHandle)) {
      return fail(`Invalid or missing accountHandle: ${accountHandle}`, 400);
    }

    // 2. Validate actionType
    if (!actionType || !["tweet", "quote", "reply"].includes(actionType)) {
      return fail(`Invalid or missing actionType: ${actionType}`, 400);
    }

    // 3. Validate content availability
    const contentProvided = sourceContent || manualIdea || sourcePostId;
    if (!contentProvided) {
      return fail("At least one content source (sourceContent, manualIdea, or sourcePostId) must be provided.", 400);
    }

    // 4. Generate drafts with Draft Generator (includes evaluation with Draft Critic)
    const result = await generateDrafts({
      accountHandle,
      actionType: actionType as "tweet" | "quote" | "reply",
      sourcePostId,
      sourceContent,
      sourceUrl,
      sourceHandle,
      modeId,
      patternId,
      patternName,
      manualIdea,
      count,
    });

    // Servis zaten { success:true, ... } döndürür; envelope'a kendi success'i
    // sızmasın diye ayıkla (ok() success:true'yu garanti eder).
    const { success: _ok, ...payload } = result;
    return ok(payload);
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const msg = err instanceof Error ? err.message : "Unexpected system error during draft generation.";
    return fail(msg, 500);
  }
}
