import type { NextRequest } from "next/server";
import { cronRunRepo } from "@/lib/db/cronRunRepo";
import { youtubeService } from "@/lib/services/youtubeService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";
import { redactError } from "@/lib/utils/redactSecrets";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

// Manuel YouTube sync (UI butonu / cron-secret). Advisory lock eşzamanlı koşuyu engeller.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function manualDeadlineMs(): number {
  const n = Number(process.env.YT_SYNC_MANUAL_DEADLINE_MS);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  if (await cronRunRepo.hasRunning("yt_sync")) {
    return fail("Zaten çalışan bir YouTube sync var", 409, { code: "already_running" });
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
    return ok({ ranAt: new Date().toISOString(), ...result });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : String(err);
    if (cronRunId) await cronRunRepo.finish(cronRunId, { ok: false, error: redactError(err) });
    return fail(msg, 500);
  }
}
