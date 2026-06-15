import { NextRequest, NextResponse } from "next/server";
import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";
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
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const { content, accountHandle, modeId } = body;

    if (content && accountHandle) {
      const account = await accountRepo.findByHandle(accountHandle);
      if (!account) {
        return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
      }

      const queueItem = await queueRepo.create({
        accountId: account.id,
        sourcePostId: id && id !== "none" && id !== "undefined" ? id : undefined,
        content,
        draftType: "TWEET",
        mode: modeId || "ai_news",
        estimatedCostUsd: 0.001,
        usedMock: true,
        scores: "{}",
      });

      return NextResponse.json({
        success: true,
        queueItemId: queueItem.id,
        message: "Taslak başarıyla sıraya (Queue) eklendi.",
      });
    }

    return NextResponse.json({
      success: true,
      placeholder: true,
      message: "Draft Generator Sprint 10’da aktif olacak.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
