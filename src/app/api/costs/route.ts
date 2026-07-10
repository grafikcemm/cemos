import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { getCostLimits } from "@/lib/config/costLimits";
import { getBudgetStatus } from "@/lib/config/costGate";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

// SocialData per-tweet unit price (mirrors calculateCost in socialdata.ts).
const SOCIALDATA_UNIT_PRICE = 0.0002;

type UsageLogRow = {
  date: string;
  type: string;
  tweetCount: number | null;
  estimatedCostUsd: number;
  provider: string | null;
  model: string | null;
  meta: string | null;
};

function parseMeta(meta: string | null): { purpose: string | null; preset: string | null } {
  if (!meta) return { purpose: null, preset: null };
  try {
    const parsed = JSON.parse(meta) as { purpose?: unknown; preset?: unknown };
    return {
      purpose: typeof parsed.purpose === "string" ? parsed.purpose : null,
      preset: typeof parsed.preset === "string" ? parsed.preset : null,
    };
  } catch {
    return { purpose: null, preset: null };
  }
}

function parsePurpose(meta: string | null): string | null {
  return parseMeta(meta).purpose;
}

// A log row counts as SocialData spend if explicitly tagged, or if it is a scan row.
function isSocialData(row: UsageLogRow): boolean {
  return row.provider === "socialdata" || row.type === "scan";
}

// A log row counts as OpenRouter (LLM) spend if explicitly tagged, or if it is a
// generation row (drafts) or an openrouter-typed row (news adapters).
function isOpenRouter(row: UsageLogRow): boolean {
  return row.provider === "openrouter" || row.type === "openrouter" || row.type === "generation";
}

function purposeOf(row: UsageLogRow): string {
  return parsePurpose(row.meta) ?? (row.type === "generation" ? "draft_generation" : "other");
}

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 403 });
  }
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const thisMonthStr = new Date().toISOString().slice(0, 7);

    // 1. Fetch all usage logs for the current month
    const logs = (await prisma.usageLog.findMany({
      where: { date: { startsWith: thisMonthStr } },
    })) as unknown as UsageLogRow[];

    const todayLogs = logs.filter((l) => l.date === todayStr);

    // 2. Today / month totals (sum every row exactly once — backward-friendly keys)
    const todayTotalUsd = todayLogs.reduce((acc, l) => acc + l.estimatedCostUsd, 0);
    const monthTotalUsd = logs.reduce((acc, l) => acc + l.estimatedCostUsd, 0);

    const limits = getCostLimits();
    const budgetUsd = limits.monthlyBudgetUsd;
    const budgetStatus = await getBudgetStatus({ budgetClass: "essential" });

    // ── PROVIDER LINE ITEMS (month-to-date) ───────────────────────────────────
    // SocialData: tweets fetched × unit price.
    const socialLogs = logs.filter(isSocialData);
    const socialTweets = socialLogs.reduce((acc, l) => acc + (l.tweetCount ?? 0), 0);
    const socialCostUsd = socialLogs.reduce((acc, l) => acc + l.estimatedCostUsd, 0);

    // OpenRouter: real costs, grouped by purpose and by model.
    const orLogs = logs.filter(isOpenRouter);
    const orTotalUsd = orLogs.reduce((acc, l) => acc + l.estimatedCostUsd, 0);

    const byPurposeMap = new Map<string, { purpose: string; costUsd: number; calls: number }>();
    const byModelMap = new Map<string, { model: string; costUsd: number; calls: number }>();
    // Preset kırılımı (Sprint 2): UsageLog.meta.preset gated preset çağrılarında
    // yazılır; preset'siz gated çağrılar (rol yolu) tek kalemde toplanır.
    const byPresetMap = new Map<string, { preset: string; costUsd: number; calls: number }>();
    for (const row of orLogs) {
      const purpose = purposeOf(row);
      const pEntry = byPurposeMap.get(purpose) ?? { purpose, costUsd: 0, calls: 0 };
      pEntry.costUsd += row.estimatedCostUsd;
      pEntry.calls += 1;
      byPurposeMap.set(purpose, pEntry);

      const model = row.model && row.model.trim().length > 0 ? row.model : "unknown";
      const mEntry = byModelMap.get(model) ?? { model, costUsd: 0, calls: 0 };
      mEntry.costUsd += row.estimatedCostUsd;
      mEntry.calls += 1;
      byModelMap.set(model, mEntry);

      const preset = parseMeta(row.meta).preset ?? "(rol yolu)";
      const prEntry = byPresetMap.get(preset) ?? { preset, costUsd: 0, calls: 0 };
      prEntry.costUsd += row.estimatedCostUsd;
      prEntry.calls += 1;
      byPresetMap.set(preset, prEntry);
    }

    const round5 = (n: number) => Number(n.toFixed(5));
    const sortByCost = <T extends { costUsd: number }>(arr: T[]) =>
      arr.sort((a, b) => b.costUsd - a.costUsd).map((e) => ({ ...e, costUsd: round5(e.costUsd) }));

    const lineItems = {
      socialData: {
        provider: "socialdata",
        tweets: socialTweets,
        unitPriceUsd: SOCIALDATA_UNIT_PRICE,
        costUsd: round5(socialCostUsd),
      },
      openRouter: {
        provider: "openrouter",
        costUsd: round5(orTotalUsd),
        byPurpose: sortByCost([...byPurposeMap.values()]),
        byModel: sortByCost([...byModelMap.values()]),
        byPreset: sortByCost([...byPresetMap.values()]),
      },
    };

    // ── 30-day daily series (total spend per day) ─────────────────────────────
    const dailyMap: Record<string, { date: string; totalUsd: number; socialDataUsd: number; openRouterUsd: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      dailyMap[dateStr] = { date: dateStr, totalUsd: 0, socialDataUsd: 0, openRouterUsd: 0 };
    }
    for (const log of logs) {
      const bucket = dailyMap[log.date];
      if (!bucket) continue;
      bucket.totalUsd += log.estimatedCostUsd;
      if (isSocialData(log)) bucket.socialDataUsd += log.estimatedCostUsd;
      else if (isOpenRouter(log)) bucket.openRouterUsd += log.estimatedCostUsd;
    }
    const dailySeries = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date,
        totalUsd: round5(d.totalUsd),
        socialDataUsd: round5(d.socialDataUsd),
        openRouterUsd: round5(d.openRouterUsd),
      }));

    return NextResponse.json({
      // Backward-friendly keys (Topbar + SettingsTab read today.totalUsd / month.*).
      today: {
        totalUsd: round5(todayTotalUsd),
        socialDataTweets: todayLogs.filter(isSocialData).reduce((a, l) => a + (l.tweetCount ?? 0), 0),
        socialDataUsd: round5(todayLogs.filter(isSocialData).reduce((a, l) => a + l.estimatedCostUsd, 0)),
        openRouterUsd: round5(todayLogs.filter(isOpenRouter).reduce((a, l) => a + l.estimatedCostUsd, 0)),
      },
      month: {
        totalUsd: round5(monthTotalUsd),
        budgetUsd,
        socialDataUsd: lineItems.socialData.costUsd,
        openRouterUsd: lineItems.openRouter.costUsd,
      },
      lineItems,
      budgetStatus,
      dailySeries,
      limits: {
        dailyTweetBudget: limits.dailyTweetBudget,
        maxSourcesPerAccount: limits.maxSourcesPerAccount,
        maxTweetsPerSource: limits.maxTweetsPerSource,
        monthlyBudgetUsd: limits.monthlyBudgetUsd,
        costPerItem: limits.costPerItem,
        costPerGeneration: limits.costPerGeneration,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Maliyetler alınamadı";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
