import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
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

    // 1. Fetch post details
    const post = await prisma.sourcePost.findUnique({
      where: { id },
      include: {
        account: true,
      },
    });

    if (!post) {
      return NextResponse.json({ success: false, error: "Gönderi bulunamadı" }, { status: 404 });
    }

    // 2. Trigger Feedback API process to extract & save pattern + training example
    const result = await processFeedback({
      accountHandle: post.account.handle as any,
      accountId: post.accountId,
      feedbackType: "saved_as_pattern",
      originalContent: post.text,
      sourcePostId: post.id,
      sourceContent: post.text,
      saveTrainingExample: true,
      saveAsPattern: true,
    });

    // 3. Mark the source post as "used" or keep it. Let's mark it as used so it disappears from new candidates!
    await prisma.sourcePost.update({
      where: { id },
      data: { status: "used" },
    });

    return NextResponse.json({
      success: true,
      feedbackResult: result,
      message: "Pattern başarıyla kaydedildi ve gönderi used olarak işaretlendi.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
