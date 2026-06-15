import { NextRequest, NextResponse } from "next/server";
import { cronRunRepo } from "@/lib/db/cronRunRepo";
import { youtubeService } from "@/lib/services/youtubeService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

// Manuel YouTube sync (UI butonu / cron-secret). Advisory lock eşzamanlı koşuyu engeller.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function manualDeadlineMs(): number {
  const n = Number(process.env.YT_SYNC_MANUAL_DEADLINE_MS);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  if (await cronRunRepo.hasRunning("yt_sync")) {
    return NextResponse.json(
      { success: false, code: "already_running", error: "Zaten çalışan bir YouTube sync var" },
      { status: 409 }
    );
  }

  let cronRunId: string | null = null;
  try {
    cronRunId = (await cronRunRepo.start("yt_sync")).id;
  } catch (err) {
    console.error("CronRun start (yt_sync) hata:", err);
  }

  try {
    const result = await youtubeService.syncCompetitors({ deadlineMs: manualDeadlineMs() });
    if (cronRunId) await cronRunRepo.finish(cronRunId, { ok: true, result });
    return NextResponse.json({ success: true, ranAt: new Date().toISOString(), ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (cronRunId) await cronRunRepo.finish(cronRunId, { ok: false, error: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
