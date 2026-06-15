import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/utils/cronAuth";
import { cronRunRepo } from "@/lib/db/cronRunRepo";
import {
  syncDueSources,
  translateBatch,
  analyzeBatch,
  runPipelineTick,
} from "@/lib/news/pipeline";
import { syncHackerNews } from "@/lib/news/hackernews";
import { syncRepoRadar } from "@/lib/news/repoRadar";
import { generateOpportunities } from "@/lib/news/opportunities";
import { buildDailyDigest } from "@/lib/news/digest";

// Vercel Fluid Compute allows up to 300s. The per-stage budgets self-derive
// from this, so dropping it degrades gracefully instead of crashing.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Stage = "fetch" | "translate" | "opportunities" | "repos" | "digest" | "all";

const VALID_STAGES: Stage[] = ["fetch", "translate", "opportunities", "repos", "digest", "all"];

function timeBudgetMs(): number {
  return Number(process.env.CRON_TIME_BUDGET_MS || "") || maxDuration * 800;
}

async function runStage(stage: Stage, deadline: number): Promise<Record<string, unknown>> {
  switch (stage) {
    case "fetch": {
      const sync = await syncDueSources(deadline, { maxSources: 12 });
      const hn = await syncHackerNews({ maxItems: 20 });
      return { sync, hackernews: hn };
    }
    case "translate": {
      const translate = await translateBatch(deadline, 12);
      const analyze = await analyzeBatch(deadline, 12);
      return { translate, analyze };
    }
    case "opportunities":
      return { opportunities: await generateOpportunities({ deadlineMs: deadline }) };
    case "repos":
      return { repos: await syncRepoRadar({ deadlineMs: deadline }) };
    case "digest":
      return { digest: await buildDailyDigest() };
    case "all": {
      const tick = await runPipelineTick(Math.max(10_000, deadline - Date.now()));
      const hn = await syncHackerNews({ maxItems: 15 });
      const repos = await syncRepoRadar({ deadlineMs: deadline });
      const opportunities = await generateOpportunities({ deadlineMs: deadline });
      const digest = await buildDailyDigest();
      return { tick, hackernews: hn, repos, opportunities, digest };
    }
  }
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const stageParam = (req.nextUrl.searchParams.get("stage") || "all") as Stage;
  if (!VALID_STAGES.includes(stageParam)) {
    return NextResponse.json(
      { success: false, error: `Geçersiz stage. Şunlardan biri olmalı: ${VALID_STAGES.join(", ")}` },
      { status: 400 }
    );
  }

  // Advisory lock via CronRun: skip if a news run is already in flight.
  if (await cronRunRepo.hasRunning("news_run")) {
    return NextResponse.json({ success: false, error: "Zaten çalışan bir haber işlemi var" }, { status: 409 });
  }

  let cronRunId: string | null = null;
  try {
    cronRunId = (await cronRunRepo.start("news_run")).id;
  } catch (err) {
    console.error("CronRun start (news_run) hata:", err);
  }

  const deadline = Date.now() + timeBudgetMs();
  try {
    const result = await runStage(stageParam, deadline);
    if (cronRunId) {
      await cronRunRepo.finish(cronRunId, { ok: true, result: { stage: stageParam, ...result } });
    }
    return NextResponse.json({ success: true, stage: stageParam, ranAt: new Date().toISOString(), ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (cronRunId) {
      await cronRunRepo.finish(cronRunId, { ok: false, error: msg });
    }
    return NextResponse.json({ success: false, stage: stageParam, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// GET allowed too so a Vercel cron can target a specific stage directly.
export async function GET(req: NextRequest) {
  return handle(req);
}
