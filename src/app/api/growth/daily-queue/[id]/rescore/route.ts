import { NextRequest, NextResponse } from "next/server";
import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";
import { critiqueDraft } from "@/lib/growth-engine/draft-critic";
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

    const { content } = body;

    const existing = await queueRepo.findById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Queue item not found" }, { status: 404 });
    }

    const account = await accountRepo.findById(existing.accountId);
    if (!account) {
      return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
    }

    const textToScore = content || existing.editedContent || existing.content;

    // Critique the content
    const critic = await critiqueDraft({
      draft: textToScore,
      accountHandle: account.handle,
      modeId: existing.mode,
    });

    // Update SQLite scores JSON field
    const scoresJsonString = JSON.stringify(critic);
    await queueRepo.update(id, {
      scores: scoresJsonString,
      // If content was explicitly sent (edited content), update editedContent too
      editedContent: content ? content.trim() : undefined,
    });

    return NextResponse.json({
      success: true,
      critic,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error during daily queue rescoring.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
