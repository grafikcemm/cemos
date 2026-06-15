import { NextRequest, NextResponse } from "next/server";
import { accountProfiles, type AccountHandle } from "@/lib/accounts";
import { runDraftPipeline } from "@/lib/ai/draft-pipeline";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(request: NextRequest) {
  if (!isOperatorOrCronAuthorized(request)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const body = await request.json();
    const account = body.account as AccountHandle | undefined;
    const sourceInput = String(body.sourceInput ?? "");

    if (!account || !accountProfiles[account]) {
      return NextResponse.json({ error: "Unknown account." }, { status: 400 });
    }

    if (!sourceInput.trim()) {
      return NextResponse.json({ error: "sourceInput is required." }, { status: 400 });
    }

    const result = await runDraftPipeline(accountProfiles[account], sourceInput);
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Draft generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
