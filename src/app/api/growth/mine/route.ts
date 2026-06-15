import { NextRequest, NextResponse } from "next/server";
import { accountProfiles, type AccountHandle } from "@/lib/accounts";
import { miningService } from "@/lib/services/miningService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

/**
 * Manual trigger for the deliberation council + viral pattern mining for one
 * account. Returns the per-item council verdicts so the UI can show WHY each
 * piece of content was mined or skipped ("müzakere" transparency).
 */
// Council deliberation is the slowest phase — give it the full window.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { handle?: string; limit?: number };
  const handle = body.handle;

  if (!handle || !(handle in accountProfiles)) {
    return NextResponse.json({ success: false, error: "Geçersiz hesap" }, { status: 400 });
  }

  // Clamp: each mined item costs council + analysis + embedding LLM calls.
  const limit = Math.min(5, Math.max(1, Math.floor(body.limit ?? 5)));

  try {
    const result = await miningService.mineTopItems(handle as AccountHandle, limit);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Madencilik hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
