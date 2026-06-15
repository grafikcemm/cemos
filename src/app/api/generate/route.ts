import { NextRequest, NextResponse } from "next/server";
import { draftService } from "@/lib/services/draftService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const body = (await req.json()) as {
      channel?: string;
      sourcePostId?: string;
      sourceTweet?: string;
      sourceHandle?: string;
      draftType?: string;
      mode?: string;
    };

    if (!body.channel) {
      return NextResponse.json({ success: false, error: "channel gerekli" }, { status: 400 });
    }
    if (!body.sourceTweet && !body.sourcePostId) {
      return NextResponse.json({ success: false, error: "sourceTweet veya sourcePostId gerekli" }, { status: 400 });
    }

    const result = await draftService.generateDraft({
      accountHandle: body.channel,
      sourcePostId: body.sourcePostId,
      sourceTweet: body.sourceTweet,
      sourceHandle: body.sourceHandle,
      draftType: body.draftType,
      mode: body.mode,
    });

    return NextResponse.json({
      success: true,
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
    const msg = err instanceof Error ? err.message : "Generation hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
