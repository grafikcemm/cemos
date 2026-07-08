import { NextRequest, NextResponse } from "next/server";
import { accountList } from "@/lib/accounts";
import { pipelineService } from "@/lib/services/pipelineService";
import { cronRunRepo } from "@/lib/db/cronRunRepo";
import { isCronAuthorized } from "@/lib/utils/cronAuth";

// Dedicated morning generation cron. Split out of /api/cron/daily so the most
// important output — the two accounts' drafts — runs FIRST in its own time
// budget and can never be starved by the News / Instagram / Content-Intelligence
// stages (DH-001). Scheduled earlier (03:00 UTC — FIRST-SPRINT item 20 / C11) so
// even Vercel Hobby's ±59min cron drift still lands before the Istanbul morning
// login (DH-003).
export const maxDuration = 180;
export const dynamic = "force-dynamic";

// Stop starting new per-account work after ~80% of the wall clock so the
// invocation always has time to persist its CronRun result. Lazy read so tests
// and per-deploy env tweaks can adjust it without a module reload.
function getTimeBudgetMs(): number {
  return Number(process.env.GENERATE_MORNING_BUDGET_MS || "") || maxDuration * 800;
}

type RunOutcome = { ok: boolean; partial: boolean; results: unknown[] };

async function run(handleParam: string | null): Promise<RunOutcome> {
  const t0 = Date.now();
  const deadlineMs = t0 + getTimeBudgetMs();
  const handles = handleParam
    ? accountList.filter((a) => a.handle === handleParam).map((a) => a.handle)
    : accountList.map((a) => a.handle);

  // Heartbeat-FIRST: even a killed invocation leaves proof the cron fired.
  let cronRunId: string | null = null;
  try {
    cronRunId = (await cronRunRepo.start("generate_morning")).id;
  } catch (err) {
    console.error("CronRun start (generate_morning) yazılırken hata oluştu:", err);
  }

  const results: unknown[] = [];
  let errors = 0;
  let partial = false;

  let fatal = false;
  try {
    for (const handle of handles) {
      if (Date.now() > deadlineMs) {
        results.push({ handle, skipped: "deadline" });
        partial = true;
        continue;
      }
      try {
        // discover/mine skipped here — generation works from the existing backlog
        // so drafts land fast; discovery/mining stay in the daily cron. The
        // deadline bounds every downstream LLM call so we never overrun the budget.
        // idempotent: `generate-morning:{date}:{account}` — aynı gün+hesap için
        // ikinci çağrı LLM'e ulaşmadan erken döner (0 yeni QueueItem/UsageLog).
        results.push(
          await pipelineService.runDailyForAccount(handle, {
            discover: false,
            mine: false,
            deadlineMs,
            idempotent: true,
          })
        );
      } catch (err) {
        errors++;
        // Don't surface raw error text (Prisma/provider internals) in the API
        // response or persisted CronRun (DH-014). Log it; store a sentinel.
        console.error(`[generate-morning] ${handle} üretimi başarısız:`, err);
        results.push({ handle, error: "internal_error" });
      }
    }
    return { ok: errors < handles.length, partial, results };
  } catch (err) {
    // An unexpected throw outside the per-account try (e.g. a DB error) must not
    // leave a false-green CronRun — flag it so the finally records a failure.
    fatal = true;
    console.error("[generate-morning] beklenmeyen çalışma hatası:", err);
    throw err;
  } finally {
    // try/finally → terminal CronRun state even if the loop throws or the
    // invocation is torn down mid-flight (DH-008): no more orphan "started but
    // never finished" rows that read as a false-green "cron ran".
    if (cronRunId) {
      await cronRunRepo.finish(cronRunId, {
        ok: !fatal && errors < handles.length,
        partial: fatal || partial || errors > 0,
        result: { results },
      });
    }
  }
}

// Manual trigger (operator UI / recovery) and Vercel cron both run the same
// generation-only path. Both require the CRON_SECRET bearer. Note: a request
// without `?handle=` runs BOTH accounts (full morning run); pass `?handle=<acct>`
// to target a single account (recovery).
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const handle = req.nextUrl.searchParams.get("handle");
  const outcome = await run(handle);
  return NextResponse.json({
    success: outcome.ok,
    ranAt: new Date().toISOString(),
    partial: outcome.partial,
    results: outcome.results,
  });
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const handle = req.nextUrl.searchParams.get("handle");
  const outcome = await run(handle);
  return NextResponse.json({
    success: outcome.ok,
    ranAt: new Date().toISOString(),
    partial: outcome.partial,
    results: outcome.results,
  });
}
