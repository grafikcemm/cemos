import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/utils/cronAuth";
import { refreshRankings } from "@/lib/services/aiRankingsService";

// Refreshes the AI model leaderboard snapshot from the 3 public sources.
// Cron-authorized only. Callable on demand or by an external scheduler; also
// invoked weekly inside /api/cron/learn (Mondays) so no extra Vercel cron slot
// is required.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const outcome = await refreshRankings();
  return NextResponse.json({ success: outcome.ok, ranAt: new Date().toISOString(), ...outcome });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
