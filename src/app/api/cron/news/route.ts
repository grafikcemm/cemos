import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/utils/cronAuth";
import { runPipelineTick } from "@/lib/news/pipeline";
import { syncHackerNews } from "@/lib/news/hackernews";

// Light intra-day refresh: fetch RSS + translate + analyze + buzz-enrich, WITHOUT
// the heavy per-account draft generation that /api/cron/daily runs at 06:00.
// Keeps "en güncel ve çok konuşulan" fresh through the day (every 3h via cron).
export const maxDuration = 120;
export const dynamic = "force-dynamic";

function getNewsBudgetMs(): number {
  return Number(process.env.NEWS_CRON_BUDGET_MS || "") || maxDuration * 800;
}

async function run(): Promise<{ ok: boolean; hackernews?: unknown; pipeline?: unknown }> {
  const out: { ok: boolean; hackernews?: unknown; pipeline?: unknown } = { ok: true };
  const deadline = Date.now() + getNewsBudgetMs();

  try {
    out.hackernews = await syncHackerNews({ maxItems: 20 });
  } catch (err) {
    out.hackernews = { error: err instanceof Error ? err.message : String(err) };
  }
  try {
    // Reserve ~5s for response persistence; pipeline self-bounds each stage.
    out.pipeline = await runPipelineTick(Math.max(30_000, deadline - Date.now() - 5_000));
  } catch (err) {
    out.ok = false;
    out.pipeline = { error: err instanceof Error ? err.message : String(err) };
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const outcome = await run();
  return NextResponse.json({
    success: outcome.ok,
    ranAt: new Date().toISOString(),
    hackernews: outcome.hackernews,
    pipeline: outcome.pipeline,
  });
}

// Manual trigger (operator UI / curl) — same work as the cron path.
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const outcome = await run();
  return NextResponse.json({
    success: outcome.ok,
    ranAt: new Date().toISOString(),
    hackernews: outcome.hackernews,
    pipeline: outcome.pipeline,
  });
}
