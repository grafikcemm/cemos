import { NextRequest, NextResponse } from "next/server";
import { accountList, accountProfiles, type AccountHandle } from "@/lib/accounts";
import { miningService } from "@/lib/services/miningService";
import { engagementLearningService } from "@/lib/services/engagementLearningService";
import { cronRunRepo } from "@/lib/db/cronRunRepo";
import { isCronAuthorized } from "@/lib/utils/cronAuth";
import { getBudgetStatus } from "@/lib/config/costGate";
import { generateWeeklyLearningReport } from "@/lib/growth-engine/weekly-learning-report";
import { runPipelineTick } from "@/lib/news/pipeline";
import { prisma } from "@/lib/db/client";
import { youtubeService } from "@/lib/services/youtubeService";
import { YT_SYNC_DEADLINE_MS } from "@/lib/youtube/ytConfig";
import { instagramService } from "@/lib/services/instagramService";
import { IG_SYNC_LEARN_DEADLINE_MS } from "@/lib/instagram/igConfig";
import { ytOwnPerformanceService } from "@/lib/services/ytOwnPerformanceService";
import { pipelineTraceRepo } from "@/lib/db/pipelineTraceRepo";
import { learnService } from "@/lib/learning/learnService";
import { isLearnEnabled, LEARN_SWEEP_DEADLINE_MS } from "@/lib/learning/learnConfig";

// The LEARN cron (18:00 UTC / 21:00 Istanbul): this is what makes the system
// continuously learn without anyone clicking a button —
//   1. council mining over the day's discovered posts (viral patterns),
//   2. engagement sync: own-tweet performance → pattern re-weights + training,
//   3. Mondays: auto-generate the weekly learning report,
//   4. retention cleanup (serverless never runs the local pruneTick).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function getTimeBudgetMs(): number {
  return Number(process.env.CRON_TIME_BUDGET_MS || "") || maxDuration * 800;
}

function getMiningLimit(): number {
  const raw = process.env.MINING_DAILY_LIMIT;
  if (raw === undefined || raw.trim() === "") return 2;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 2;
}

function isIstanbulMonday(d: Date): boolean {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Istanbul", weekday: "short" }).format(d) ===
    "Mon"
  );
}

const SOURCE_POST_RETENTION_DAYS = 30;
const RUN_LOG_RETENTION_DAYS = 90;
const NEWS_ITEM_RETENTION_DAYS = 30;
const PIPELINE_TRACE_RETENTION_DAYS = 30;

async function pruneOldRecords() {
  const sourceCutoff = new Date(Date.now() - SOURCE_POST_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const runCutoff = new Date(Date.now() - RUN_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const newsCutoff = new Date(Date.now() - NEWS_ITEM_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const [sourcePosts, scanRuns, generationRuns, cronRuns, newsItems, pipelineTraces, learnJobs] = await Promise.all([
    prisma.sourcePost.deleteMany({
      where: {
        status: { in: ["used", "error", "blocked", "ignored"] },
        scannedAt: { lt: sourceCutoff },
      },
    }),
    prisma.scanRun.deleteMany({ where: { startedAt: { lt: runCutoff } } }),
    prisma.generationRun.deleteMany({ where: { createdAt: { lt: runCutoff } } }),
    cronRunRepo.pruneOlderThan(60),
    prisma.newsItem.deleteMany({ where: { fetchedAt: { lt: newsCutoff }, isUsed: false } }),
    pipelineTraceRepo.pruneOlderThan(PIPELINE_TRACE_RETENTION_DAYS),
    // CemOS Learn: yalnız TAMAMLANMIŞ/başarısız (geçici) job'lar prune edilir;
    // pack/transcript/chunk user içeriği + cache → KORUNUR.
    prisma.learnProcessingJob.deleteMany({
      where: { status: { in: ["done", "failed"] }, finishedAt: { lt: runCutoff } },
    }),
  ]);
  return {
    sourcePosts: sourcePosts.count,
    scanRuns: scanRuns.count,
    generationRuns: generationRuns.count,
    cronRuns: cronRuns.count,
    newsItems: newsItems.count,
    pipelineTraces: pipelineTraces.count,
    learnJobs: learnJobs.count,
  };
}

async function runLearn(handleParam: string | null) {
  const t0 = Date.now();
  const timeBudgetMs = getTimeBudgetMs();
  const handles: AccountHandle[] =
    handleParam && handleParam in accountProfiles
      ? [handleParam as AccountHandle]
      : accountList.map((a) => a.handle);

  // Heartbeat-FIRST, exactly like the daily cron.
  let cronRunId: string | null = null;
  try {
    cronRunId = (await cronRunRepo.start("learn")).id;
  } catch (err) {
    console.error("CronRun start yazılırken hata oluştu:", err);
  }

  // Budget gate guards the LLM-heavy mining only. Engagement sync is a cheap
  // SocialData read and keeps learning even when the AI budget is exhausted.
  // Conservative on failure: unknown budget → skip mining.
  let miningAllowed = false;
  try {
    miningAllowed = (await getBudgetStatus()).allowed;
  } catch (err) {
    console.error("Budget durumu okunamadı, mining atlanıyor:", err);
  }
  const miningLimit = getMiningLimit();

  // YouTube rakip sync — LLM'siz ve ucuz, mining'den ÖNCE (AI bütçesi bitse bile
  // koşar). 40s ya da kalan süre (hangisi küçükse); fail-open, cron'u bozmaz.
  let ytSync: unknown = null;
  if (Date.now() - t0 < timeBudgetMs) {
    const ytDeadlineMs = Math.min(YT_SYNC_DEADLINE_MS, timeBudgetMs - (Date.now() - t0));
    if (ytDeadlineMs > 0) {
      try {
        ytSync = await youtubeService.syncCompetitors({ deadlineMs: ytDeadlineMs });
      } catch (err) {
        ytSync = { error: err instanceof Error ? err.message : String(err) };
      }
    }
  }

  // Instagram yorum sync — ytSync'ten sonra, mining'den önce (LLM'siz çekme + sınırlı
  // sınıflandırma). Deadline'lı, fail-open; cron'u bozmaz.
  let igSync: unknown = null;
  if (Date.now() - t0 < timeBudgetMs) {
    const igDeadlineMs = Math.min(IG_SYNC_LEARN_DEADLINE_MS, timeBudgetMs - (Date.now() - t0));
    if (igDeadlineMs > 0) {
      try {
        igSync = await instagramService.sync({ deadlineMs: igDeadlineMs });
      } catch (err) {
        igSync = { error: err instanceof Error ? err.message : String(err) };
      }
    }
  }

  // Instagram engagement learning — own top-media performance → IG feedback +
  // pattern re-weights. Cheap (1 snapshot read, no LLM), global (one IG
  // account), fail-open; runs after igSync, before the per-handle loop.
  let igEngagement: unknown = null;
  if (Date.now() - t0 < timeBudgetMs) {
    try {
      igEngagement = await engagementLearningService.syncInstagram();
    } catch (err) {
      igEngagement = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  // YouTube own-video engagement learning — kendi kanal performansı → ytOutcome
  // verdict'leri (FeedbackEvent + TrainingExample). Env'siz no-op, LLM'siz
  // (yalnız Data API ~2-3 quota unit), fail-open.
  let ytOwnEngagement: unknown = null;
  if (Date.now() - t0 < timeBudgetMs) {
    try {
      ytOwnEngagement = await ytOwnPerformanceService.sync();
    } catch (err) {
      ytOwnEngagement = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  // CemOS Learn sweep — client'ı kopmuş işleme job'larını kalan bütçede ilerletir.
  // LEARN_ENABLED kapalıysa no-op; fail-open, cron'u bozmaz; yeni cron slotu yok.
  let learnSweep: unknown = null;
  if (isLearnEnabled() && Date.now() - t0 < timeBudgetMs) {
    const learnDeadlineMs = Math.min(LEARN_SWEEP_DEADLINE_MS, timeBudgetMs - (Date.now() - t0));
    if (learnDeadlineMs > 0) {
      try {
        learnSweep = await learnService.sweepPendingJobs({ deadlineMs: learnDeadlineMs });
      } catch (err) {
        learnSweep = { error: err instanceof Error ? err.message : String(err) };
      }
    }
  }

  const results: unknown[] = [];
  let errors = 0;
  let partial = false;

  for (const handle of handles) {
    if (Date.now() - t0 > timeBudgetMs) {
      results.push({ handle, skipped: "time_budget" });
      partial = true;
      continue;
    }

    const entry: Record<string, unknown> = { handle };
    try {
      if (miningAllowed && miningLimit > 0) {
        entry.mining = await miningService.mineTopItems(handle, miningLimit);
      } else {
        entry.mining = { skipped: miningLimit === 0 ? "mining_disabled" : "budget_exhausted" };
      }
    } catch (err) {
      entry.miningError = err instanceof Error ? err.message : String(err);
      errors++;
    }
    try {
      entry.engagement = await engagementLearningService.syncForAccount(handle);
    } catch (err) {
      entry.engagementError = err instanceof Error ? err.message : String(err);
      errors++;
    }
    results.push(entry);
  }

  // Mondays: persist the weekly report into the CronRun payload so the tab
  // has a precomputed snapshot even before its own on-demand call.
  let weeklyReport: unknown = null;
  if (isIstanbulMonday(new Date()) && Date.now() - t0 < timeBudgetMs) {
    try {
      weeklyReport = await generateWeeklyLearningReport({
        accountHandle: "all",
        dateRange: "last_7_days",
      });
    } catch (err) {
      weeklyReport = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Mondays: refresh the AI model leaderboard (AI Sıralama) from the public
  // sources. Best-effort + graceful — keeps the last good snapshot if the
  // sources are unreadable. Weekly here avoids a separate Vercel cron slot.
  let rankingsRefresh: unknown = null;
  if (isIstanbulMonday(new Date()) && Date.now() - t0 < timeBudgetMs) {
    try {
      const { refreshRankings } = await import("@/lib/services/aiRankingsService");
      rankingsRefresh = await refreshRankings();
    } catch (err) {
      rankingsRefresh = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  // News catch-up: drain any translate/analyze leftovers the morning cron's
  // capped news window did not finish. Fail-open, time-budgeted.
  let newsCatchup: unknown = null;
  if (Date.now() - t0 < timeBudgetMs) {
    try {
      newsCatchup = await runPipelineTick(60_000);
    } catch (err) {
      newsCatchup = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  let pruned: unknown = null;
  try {
    pruned = await pruneOldRecords();
  } catch (err) {
    pruned = { error: err instanceof Error ? err.message : String(err) };
  }

  const ok = errors < handles.length * 2; // both phases of every account failing = broken run
  if (cronRunId) {
    await cronRunRepo.finish(cronRunId, {
      ok,
      partial,
      result: { results, weeklyReport: weeklyReport ? true : null, pruned, newsCatchup, ytSync, igSync, igEngagement, ytOwnEngagement, rankingsRefresh, learnSweep },
    });
  }
  return { ok, partial, results, weeklyReport, pruned, newsCatchup, ytSync, igSync, igEngagement, ytOwnEngagement, rankingsRefresh, learnSweep };
}

// Vercel cron (daily 18:00 UTC) → GET; manual trigger → POST.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const handle = req.nextUrl.searchParams.get("handle");
  const outcome = await runLearn(handle);
  return NextResponse.json({ success: outcome.ok, ranAt: new Date().toISOString(), ...outcome });
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const handle = req.nextUrl.searchParams.get("handle");
  const outcome = await runLearn(handle);
  return NextResponse.json({ success: outcome.ok, ranAt: new Date().toISOString(), ...outcome });
}
