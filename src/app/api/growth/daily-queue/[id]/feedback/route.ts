import { NextRequest, NextResponse } from "next/server";
import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";
import { processFeedback } from "@/lib/growth-engine/feedback-service";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = await req.json();

    const { feedbackType, editedContent, reason } = body;

    if (!feedbackType) {
      return NextResponse.json({ success: false, error: "feedbackType is required." }, { status: 400 });
    }

    const existing = await queueRepo.findById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Queue item not found" }, { status: 404 });
    }

    const account = await accountRepo.findById(existing.accountId);
    if (!account) {
      return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
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

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error during daily queue feedback.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
