import { NextRequest, NextResponse } from "next/server";
import { accountProfiles, type AccountHandle } from "@/lib/accounts";
import { pipelineService } from "@/lib/services/pipelineService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

// Phase 3 of the split Keşif Motoru run: generate today's drafts from the
// already-discovered (and mined) backlog. Discovery/mining are skipped here —
// they run as their own invocations so no phase can hit the Vercel timeout.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { handle?: string };
  const handle = body.handle;

  if (!handle || !(handle in accountProfiles)) {
    return NextResponse.json({ success: false, error: "Geçersiz hesap" }, { status: 400 });
  }

  try {
    const summary = await pipelineService.runDailyForAccount(handle as AccountHandle, {
      discover: false,
      mine: false,
    });
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Üretim hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
