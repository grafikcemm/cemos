import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { processFeedback } from "@/lib/growth-engine/feedback-service";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
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
      return fail("Gönderi bulunamadı", 404);
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

    return ok({
      feedbackResult: result,
      message: "Pattern başarıyla kaydedildi ve gönderi used olarak işaretlendi.",
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return fail(msg, 500);
  }
}
