import type { NextRequest } from "next/server";
import { igInsightSnapshotRepo } from "@/lib/db/igInsightSnapshotRepo";
import { instagramService } from "@/lib/services/instagramService";
import { isConfigured } from "@/lib/instagram/igClient";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { istanbulDateKey } from "@/lib/instagram/igConfig";
import { ok, fail } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/instagram/insights — son 30 snapshot + en güncel
export async function GET() {
  const [configured, snapshots] = await Promise.all([
    isConfigured(),
    igInsightSnapshotRepo.listRecent(30),
  ]);
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  return ok({ configured, snapshots, latest });
}

// POST /api/instagram/insights — bugünün snapshot'ını al (günde 1 idempotent, guard)
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const existing = await igInsightSnapshotRepo.getByDate(istanbulDateKey());
    if (existing) {
      return ok({ captured: false, reason: "already_today" });
    }
    const result = await instagramService.syncInsights({ deadlineMs: 15_000 });
    return ok({ captured: result.captured });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(msg, 500);
  }
}
