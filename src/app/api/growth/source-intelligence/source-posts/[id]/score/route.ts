import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { scoreSourcePostFallback } from "@/lib/growth-engine/scorer";
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

    // 1. Fetch SourcePost
    const post = await prisma.sourcePost.findUnique({
      where: { id },
      include: {
        source: true,
        account: true,
      },
    });

    if (!post) {
      return NextResponse.json(
        { success: false, error: "Source post not found" },
        { status: 404 }
      );
    }

    // 2. Score utilizing Scoring Engine Fallback
    const score = scoreSourcePostFallback({
      content: post.text,
      targetAccount: post.account.handle,
      sourceHandle: post.source.handle,
      sourceType: "tweet",
      publishedAt: post.publishedAt?.toISOString() || post.scannedAt.toISOString(),
      metrics: {
        likes: post.likeCount,
        reposts: post.retweetCount,
      },
    });

    // 3. Return preview results
    return NextResponse.json({
      success: true,
      postText: post.text,
      targetAccount: post.account.handle,
      sourceHandle: post.source.handle,
      score: {
        ...score,
        // Make sure opportunityScore is 0-100 consistent
        opportunityScore: score.opportunityScore,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
