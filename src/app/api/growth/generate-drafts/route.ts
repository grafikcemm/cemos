import { NextRequest, NextResponse } from "next/server";
import { generateDrafts } from "@/lib/growth-engine/draft-generator";
import { validateAccountHandle } from "@/lib/growth-engine/account-profiles";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();

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
    } = body;

    // 1. Validate accountHandle
    if (!accountHandle || !validateAccountHandle(accountHandle)) {
      return NextResponse.json(
        { success: false, error: `Invalid or missing accountHandle: ${accountHandle}` },
        { status: 400 }
      );
    }

    // 2. Validate actionType
    if (!actionType || !["tweet", "quote", "reply"].includes(actionType)) {
      return NextResponse.json(
        { success: false, error: `Invalid or missing actionType: ${actionType}` },
        { status: 400 }
      );
    }

    // 3. Validate content availability
    const contentProvided = sourceContent || manualIdea || sourcePostId;
    if (!contentProvided) {
      return NextResponse.json(
        { success: false, error: "At least one content source (sourceContent, manualIdea, or sourcePostId) must be provided." },
        { status: 400 }
      );
    }

    // 4. Generate drafts with Draft Generator (includes evaluation with Draft Critic)
    const result = await generateDrafts({
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
      count,
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error during draft generation.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
