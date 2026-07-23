import type { NextRequest } from "next/server";
import { cronRunRepo } from "@/lib/db/cronRunRepo";
import { translateBatch, analyzeBatch } from "@/lib/news/pipeline";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";
import { redactError } from "@/lib/utils/redactSecrets";
import { budgetErrorResponse } from "@/lib/utils/budgetErrorResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

// POST /api/news-pool/process — UI-triggered drain of the translate → analyze
// backlog ("Tümünü İşle"). Guarded by isOperatorOrCronAuthorized: the app's
// own UI passes via Sec-Fetch-Site/Origin, automation passes via the
// CRON_SECRET bearer, and cross-site/drive-by requests get 403 so a stranger
// can't burn LLM budget. The advisory lock below still prevents concurrent runs.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function timeBudgetMs(): number {
  return Number(process.env.CRON_TIME_BUDGET_MS || "") || maxDuration * 800;
}

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return fail("Bu uç yalnız uygulama arayüzünden tetiklenebilir", 403, { code: "forbidden" });
  }

  if (await cronRunRepo.hasRunning("news_run")) {
    return fail("Zaten çalışan bir haber işlemi var", 409, { code: "already_running" });
  }

  let cronRunId: string | null = null;
  try {
    cronRunId = (await cronRunRepo.start("news_run")).id;
  } catch (err) {
    console.error("CronRun start (news_run/process) hata:", err);
  }

  const deadline = Date.now() + timeBudgetMs();
  try {
    const translate = await translateBatch(deadline, 12);
    const analyze = await analyzeBatch(deadline, 12);
    const result = { stage: "process", translate, analyze };
    if (cronRunId) {
      await cronRunRepo.finish(cronRunId, { ok: true, result });
    }
    return ok({ ranAt: new Date().toISOString(), translate, analyze });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (cronRunId) {
      await cronRunRepo.finish(cronRunId, { ok: false, error: redactError(err) });
    }
    const budgetRes = budgetErrorResponse(err);
    if (budgetRes) return budgetRes;
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(msg, 500);
  }
}
