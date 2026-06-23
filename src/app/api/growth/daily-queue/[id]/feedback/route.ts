import type { NextRequest } from "next/server";
import { z } from "zod";
import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";
import { processFeedback } from "@/lib/growth-engine/feedback-service";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

const FeedbackSchema = z.object({
  feedbackType: z.string().max(50).optional(),
  editedContent: z.string().max(10000).optional(),
  reason: z.string().max(2000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const { id } = await params;
    const body = await parseJsonBody(req);
    if (!body.ok) return fail("Geçersiz JSON", 400);

    const parsed = FeedbackSchema.safeParse(body.data);
    if (!parsed.success) return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });

    const { feedbackType, editedContent, reason } = parsed.data;

    if (!feedbackType) {
      return fail("feedbackType is required.", 400);
    }

    const existing = await queueRepo.findById(id);
    if (!existing) {
      return fail("Queue item not found", 404);
    }

    const account = await accountRepo.findById(existing.accountId);
    if (!account) {
      return fail("Account not found", 404);
    }

    const originalText = existing.content;
    const activeText = editedContent || existing.editedContent || originalText;
    const isEdited = activeText.trim() !== originalText.trim();
    
    const finalFeedbackType = feedbackType === "approved" && isEdited ? "edited" : feedbackType;

    const result = await processFeedback({
      accountHandle: account.handle,
      accountId: account.id,
      feedbackType: finalFeedbackType,
      originalContent: originalText,
      editedContent: isEdited ? activeText : undefined,
      reason: reason || "Daily Queue editor feedback",
      queueItemId: id,
      modeId: existing.mode,
      saveTrainingExample: true,
      saveAsPattern: false,
    });

    // Sync database status based on feedback action
    const updates: any = {};
    if (finalFeedbackType === "approved" || finalFeedbackType === "edited") {
      updates.status = "approved";
      if (isEdited) {
        updates.editedContent = activeText;
      }
    } else if (finalFeedbackType === "rejected") {
      updates.status = "rejected";
    } else {
      // For other minor tone feedback, map status back to draft ("new") if not approved
      updates.status = "new";
    }

    await queueRepo.update(id, updates);

    const { success: _ok, ...payload } = result;
    return ok(payload);
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const msg = err instanceof Error ? err.message : "Unexpected system error during daily queue feedback.";
    return fail(msg, 500);
  }
}
