import { NextRequest, NextResponse } from "next/server";
import { cronRunRepo } from "@/lib/db/cronRunRepo";
import { instagramService } from "@/lib/services/instagramService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { getIgManualDeadlineMs } from "@/lib/instagram/igConfig";

// Manuel Instagram sync (UI butonu / cron-secret). Advisory lock eşzamanlı koşuyu engeller.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  if (await cronRunRepo.hasRunning("ig_sync")) {
    return NextResponse.json(
      { success: false, code: "already_running", error: "Zaten çalışan bir Instagram sync var" },
      { status: 409 }
    );
  }

  let cronRunId: string | null = null;
  try {
    cronRunId = (await cronRunRepo.start("ig_sync")).id;
  } catch (err) {
    console.error("CronRun start (ig_sync) hata:", err);
  }

  try {
    const result = await instagramService.sync({ deadlineMs: getIgManualDeadlineMs() });
    if (cronRunId) await cronRunRepo.finish(cronRunId, { ok: true, result });
    return NextResponse.json({ success: true, ranAt: new Date().toISOString(), ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (cronRunId) await cronRunRepo.finish(cronRunId, { ok: false, error: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
