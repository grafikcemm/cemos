import { NextRequest, NextResponse } from "next/server";
import { resolveCronHandles } from "@/lib/accounts/profileRepository";
import { pipelineService } from "@/lib/services/pipelineService";
import { cronRunRepo } from "@/lib/db/cronRunRepo";
import { isCronAuthorized } from "@/lib/utils/cronAuth";
import { runPipelineTick } from "@/lib/news/pipeline";
import { syncHackerNews } from "@/lib/news/hackernews";
import { syncRepoRadar } from "@/lib/news/repoRadar";
import { generateOpportunities } from "@/lib/news/opportunities";
import { buildDailyDigest } from "@/lib/news/digest";
import { syncToCanonical } from "@/lib/content/syncBridge";
import { syncIgCompetitors } from "@/lib/instagram/competitor/igCompetitorService";

// With Fluid Compute (Vercel default for new projects) Hobby functions may run
// up to 300s. If a deploy ever rejects this literal, drop it to 60 — the time
// budget below self-derives from it, so the run degrades instead of crashing.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Stop starting new per-account work after ~80% of the wall clock so the
// invocation always has time to persist its CronRun result. Read lazily so
// tests (and per-deploy env tweaks) can adjust it without a module reload.
function getTimeBudgetMs(): number {
  return Number(process.env.CRON_TIME_BUDGET_MS || "") || maxDuration * 800;
}

// News pipeline total budget within the daily cron. Hard cap so the
// per-account draft generation (the most important output) always gets
// the remaining wall clock. Each stage is fail-open + deadline-bounded.
function getNewsBudgetMs(): number {
  return Number(process.env.NEWS_TIME_BUDGET_MS || "") || 150_000;
}

// Run the News AI ingest → score → opportunities → repos → digest stages,
// folded into the 06:00 cron so the morning dashboard is fully populated
// before the operator logs in. Every stage swallows its own errors.
async function runNewsStages(newsDeadline: number): Promise<Record<string, unknown>> {
  const summary: Record<string, unknown> = {};
  const within = () => Date.now() < newsDeadline;

  try {
    if (within()) summary.hackernews = await syncHackerNews({ maxItems: 20 });
  } catch (err) {
    summary.hackernews = { error: err instanceof Error ? err.message : String(err) };
  }
  try {
    // sync RSS + translate + analyze (cursor = processingStatus, resumable).
    // The pipeline is the stage that actually produces scored news, so it gets
    // the BULK of the news window: everything except a 45s reserve for the
    // cheaper repos/opportunities/digest stages, with a 90s floor so translate
    // and analyze always make real progress (the old 15s floor processed ~0).
    if (within()) summary.pipeline = await runPipelineTick(Math.max(90_000, newsDeadline - Date.now() - 45_000));
  } catch (err) {
    summary.pipeline = { error: err instanceof Error ? err.message : String(err) };
  }
  try {
    if (within()) summary.repos = await syncRepoRadar({ maxRepos: 6, deadlineMs: Math.min(newsDeadline, Date.now() + 20_000) });
  } catch (err) {
    summary.repos = { error: err instanceof Error ? err.message : String(err) };
  }
  try {
    if (within()) summary.opportunities = await generateOpportunities({ deadlineMs: Math.min(newsDeadline, Date.now() + 15_000) });
  } catch (err) {
    summary.opportunities = { error: err instanceof Error ? err.message : String(err) };
  }
  try {
    if (within()) summary.digest = await buildDailyDigest();
  } catch (err) {
    summary.digest = { error: err instanceof Error ? err.message : String(err) };
  }
  return summary;
}

type RunOutcome = {
  ok: boolean;
  partial: boolean;
  news?: Record<string, unknown>;
  results: unknown[];
};

async function run(handleParam: string | null, mine: boolean): Promise<RunOutcome> {
  const t0 = Date.now();
  const timeBudgetMs = getTimeBudgetMs();
  // ADR-031: cron yalnız DB'de aktif + üretim-hazır hesapları koşar.
  const { handles, degraded: accountSourceDegraded } = await resolveCronHandles(handleParam);

  // Heartbeat-FIRST: even a mid-run timeout leaves proof the cron fired, so the
  // dashboard never again claims "cron çalışmadı" while it actually ran.
  let cronRunId: string | null = null;
  try {
    cronRunId = (await cronRunRepo.start("daily")).id;
  } catch (err) {
    console.error("CronRun start yazılırken hata oluştu:", err);
  }

  // News AI stages first (only on full daily runs, not single-account manual
  // triggers). Capped so per-account generation always gets remaining time.
  let news: Record<string, unknown> | undefined;
  if (!handleParam) {
    const newsDeadline = t0 + Math.min(getNewsBudgetMs(), timeBudgetMs - 60_000);
    try {
      news = await runNewsStages(newsDeadline);
    } catch (err) {
      news = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  // İçerik Zekası köprüsü — mevcut tarama çıktılarını (X/IG/YT/news/repo) kanonik
  // havuza besler (ingest → baseline → outlier → embedding). Tam günlük koşuda,
  // hesap üretiminden önce, kalan bütçeyle sınırlı. Fail-open.
  let contentSync: unknown = null;
  if (!handleParam && Date.now() - t0 < timeBudgetMs) {
    const ciDeadline = Date.now() + Math.min(60_000, timeBudgetMs - (Date.now() - t0));
    try {
      contentSync = await syncToCanonical({ limitPerSource: 100, deadlineMs: ciDeadline });
    } catch (err) {
      contentSync = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Own-account Instagram sync (ADR-032) — Composio/Meta provider köprüsü,
  // READ-ONLY + LLM'siz + idempotent. Fail-open: yapılandırma yoksa dürüst
  // errorClass ile boş döner, cron'u asla bozmaz. Yeni cron slotu YOK.
  let igOwnSync: unknown = null;
  if (!handleParam && Date.now() - t0 < timeBudgetMs) {
    try {
      const { syncInstagramViaBridge } = await import("@/lib/instagram/bridgeSyncService");
      igOwnSync = await syncInstagramViaBridge();
    } catch (err) {
      igOwnSync = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  // IG rakip watchlist sync (Sprint 4, CONTENT-ENGINE §3) — business_discovery
  // TEK onaylı okuma, LLM'SİZ (~$0), ≤20 hesap/gün. Fail-open; token yoksa boş.
  let igCompetitorSync: unknown = null;
  if (!handleParam && Date.now() - t0 < timeBudgetMs) {
    try {
      igCompetitorSync = await syncIgCompetitors({
        deadlineMs: Math.min(45_000, timeBudgetMs - (Date.now() - t0)),
      });
    } catch (err) {
      igCompetitorSync = { error: err instanceof Error ? err.message : String(err) };
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
    try {
      results.push(await pipelineService.runDailyForAccount(handle, { mine }));
    } catch (err) {
      errors++;
      results.push({ handle, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Aggregate honesty: a failed own/competitor IG sync (e.g. a revoked Meta
  // token) must not leave a clean "cron ran" signal. It doesn't flip `ok` (draft
  // generation still worked and per-widget freshness stays honest), but it marks
  // the run PARTIAL so the health surface reads degraded rather than green.
  const subSyncDegraded = (r: unknown): boolean => {
    if (!r || typeof r !== "object") return false;
    const o = r as Record<string, unknown>;
    return o.ok === false || "error" in o;
  };
  if (subSyncDegraded(igOwnSync) || subSyncDegraded(igCompetitorSync)) {
    partial = true;
  }

  const ok = handles.length === 0 ? true : errors < handles.length;
  if (cronRunId) {
    await cronRunRepo.finish(cronRunId, {
      ok,
      partial,
      result: { news, contentSync, igOwnSync, igCompetitorSync, results, accountSourceDegraded },
    });
  }
  return { ok, partial, news, results };
}

// Manual / UI trigger → FULL run including multi-agent mining.
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const handle = req.nextUrl.searchParams.get("handle");
  const outcome = await run(handle, true);
  return NextResponse.json({
    success: outcome.ok,
    ranAt: new Date().toISOString(),
    partial: outcome.partial,
    news: outcome.news,
    results: outcome.results,
  });
}

// Vercel cron (daily) → LIGHT run (discover + generate). The heavy mining +
// engagement learning runs in /api/cron/learn instead.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const handle = req.nextUrl.searchParams.get("handle");
  const outcome = await run(handle, false);
  return NextResponse.json({
    success: outcome.ok,
    ranAt: new Date().toISOString(),
    partial: outcome.partial,
    news: outcome.news,
    results: outcome.results,
  });
}
