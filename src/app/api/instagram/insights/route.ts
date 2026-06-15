import { NextRequest, NextResponse } from "next/server";
import { igInsightSnapshotRepo } from "@/lib/db/igInsightSnapshotRepo";
import { instagramService } from "@/lib/services/instagramService";
import { isConfigured } from "@/lib/instagram/igClient";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { istanbulDateKey } from "@/lib/instagram/igConfig";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/instagram/insights — son 30 snapshot + en güncel
export async function GET() {
  const [configured, snapshots] = await Promise.all([
    isConfigured(),
    igInsightSnapshotRepo.listRecent(30),
  ]);
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  return NextResponse.json({ success: true, configured, snapshots, latest });
}

// POST /api/instagram/insights — bugünün snapshot'ını al (günde 1 idempotent, guard)
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const existing = await igInsightSnapshotRepo.getByDate(istanbulDateKey());
    if (existing) {
      return NextResponse.json({ success: true, captured: false, reason: "already_today" });
    }
    const result = await instagramService.syncInsights({ deadlineMs: 15_000 });
    return NextResponse.json({ success: true, captured: result.captured });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
