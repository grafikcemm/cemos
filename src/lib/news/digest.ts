import { prisma } from "@/lib/db/client";
import { generateDigest } from "@/lib/news/newsAi";
import { LOW_SCORE_THRESHOLD } from "@/lib/news/pipeline";
import { getLocalDayBounds } from "@/lib/utils/date";

// Build (or refresh) today's DailyDigest: summarize the top scored news, the
// top trending repos, and 3 AI tips in Turkish via 1 LLM call. Keyed by the
// Europe/Istanbul calendar day (YYYY-MM-DD), upserted so re-runs refresh.

const TOP_NEWS = 6;
const TOP_REPOS = 5;

function istanbulDateStr(reference = new Date()): string {
  return reference.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

export interface DigestRunResult {
  success: boolean;
  date: string;
  costUsd: number;
  modelUsed: string | null;
  newsCount: number;
  repoCount: number;
}

export async function buildDailyDigest(): Promise<DigestRunResult> {
  const { start, end } = getLocalDayBounds("Europe/Istanbul");
  const date = istanbulDateStr();

  const topNews = await prisma.newsItem.findMany({
    where: {
      processingStatus: "analyzed",
      xValueScore: { gte: LOW_SCORE_THRESHOLD },
      lastAttemptedAt: { gte: start, lte: end },
    },
    orderBy: { xValueScore: "desc" },
    take: TOP_NEWS,
  });

  const topRepos = await prisma.repoRadarItem.findMany({
    where: { status: "active", updatedAt: { gte: start, lte: end } },
    orderBy: { xValueScore: "desc" },
    take: TOP_REPOS,
  });

  const newsForPrompt = topNews.map((n) => ({
    title: n.trTitle || n.originalTitle,
    why: n.whyPeopleCare || "",
  }));
  const reposForPrompt = topRepos.map((r) => ({
    name: `${r.owner}/${r.repoName}`,
    hook: r.tweetHook || r.descriptionTr,
  }));

  const digest = await generateDigest(newsForPrompt, reposForPrompt);

  await prisma.dailyDigest.upsert({
    where: { date },
    update: {
      newsSummary: digest.newsSummary,
      repoSummary: digest.repoSummary,
      aiTips: digest.aiTips,
      modelUsed: digest.modelUsed,
      costUsd: digest.costUsd,
    },
    create: {
      date,
      newsSummary: digest.newsSummary,
      repoSummary: digest.repoSummary,
      aiTips: digest.aiTips,
      modelUsed: digest.modelUsed,
      costUsd: digest.costUsd,
    },
  });

  return {
    success: digest.success,
    date,
    costUsd: digest.costUsd,
    modelUsed: digest.modelUsed,
    newsCount: topNews.length,
    repoCount: topRepos.length,
  };
}

export async function getDigestForDate(date?: string) {
  const targetDate = date ?? istanbulDateStr();
  return prisma.dailyDigest.findUnique({ where: { date: targetDate } });
}
