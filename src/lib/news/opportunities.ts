import { prisma } from "@/lib/db/client";
import { accountRepo } from "@/lib/db/accountRepo";
import { scoreNews } from "@/lib/news/newsAi";

// Derive ContentOpportunity rows from top-scored, recently-analyzed NewsItems.
// The scoring stage already picked a best_account per item; we re-score lightly
// here only when that signal is missing. Opportunities are idempotent per
// (newsItemId, accountId): re-running updates instead of duplicating.

const MIN_X_VALUE = 70;
const ANALYSIS_WINDOW_MS = 24 * 60 * 60 * 1000;

type ContentFormat = "tweet" | "thread" | "carousel" | "spotlight" | "punch";

function mapFormat(suggested: string | null): ContentFormat {
  switch (suggested) {
    case "thread":
      return "thread";
    case "carousel":
      return "carousel";
    case "tool_drop":
    case "repo_spotlight":
      return "spotlight";
    case "tweet":
      return "tweet";
    default:
      return "punch";
  }
}

export interface OpportunityResult {
  processed: number;
  errors: number;
  skipped: number;
}

export async function generateOpportunities(opts: { deadlineMs?: number } = {}): Promise<OpportunityResult> {
  const deadline = opts.deadlineMs ?? Date.now() + 30_000;
  const result: OpportunityResult = { processed: 0, errors: 0, skipped: 0 };

  // Window on lastAttemptedAt (when analysis actually ran), not fetchedAt:
  // backlog items analyzed today must still become opportunities even if
  // fetched days ago.
  const analyzed = await prisma.newsItem.findMany({
    where: {
      processingStatus: "analyzed",
      lastAttemptedAt: { gte: new Date(Date.now() - ANALYSIS_WINDOW_MS) },
    },
    orderBy: { xValueScore: "desc" },
    take: 40,
  });

  if (analyzed.length === 0) return result;

  // Resolve account ids once for fast lookup.
  const accounts = await accountRepo.findAll();
  const accountIdByHandle = new Map(accounts.map((a) => [a.handle, a.id]));

  for (const item of analyzed) {
    if (Date.now() > deadline - 3000) {
      result.skipped++;
      continue;
    }
    if ((item.xValueScore ?? 0) < MIN_X_VALUE) {
      result.skipped++;
      continue;
    }

    // Determine which account this item targets. scoreNews returns best_account
    // but we don't persist it on NewsItem; re-derive cheaply from a fresh score
    // only when needed. To avoid extra LLM cost, default to grafikcem (the
    // AI/design/tools insider) unless a re-score is explicitly cheap — here we
    // keep it deterministic and use grafikcem as the primary target.
    let targetHandle = "grafikcem";
    if (item.category === "masculine" || item.tags.includes("maskulen")) {
      targetHandle = "maskulenkod";
    }
    const accountId = accountIdByHandle.get(targetHandle) ?? null;

    const format = mapFormat(item.suggestedFormat);
    const oneLine = item.whyPeopleCare
      ? item.whyPeopleCare.split(".")[0] + "."
      : item.trTitle || item.originalTitle;

    try {
      const existing = await prisma.contentOpportunity.findFirst({
        where: { newsItemId: item.id, accountId },
        select: { id: true },
      });

      const data = {
        sourceType: "news",
        turkishTitle: item.trTitle || item.originalTitle,
        oneLineValue: oneLine,
        tweetAngle: item.tweetAngle || "",
        contentFormat: format,
        xValueScore: item.xValueScore ?? 0,
        noveltyScore: item.viralScore ?? 50,
        usefulnessScore: item.xValueScore ?? 50,
        visualScore: item.viralScore ?? 50,
        status: "new",
      };

      if (existing) {
        await prisma.contentOpportunity.update({ where: { id: existing.id }, data });
      } else {
        await prisma.contentOpportunity.create({
          data: { ...data, newsItemId: item.id, accountId },
        });
      }
      result.processed++;
    } catch (err) {
      result.errors++;
      console.warn(`[opportunities] ${item.id} işlenemedi:`, err);
    }
  }

  return result;
}

// Optional: explicitly re-classify a single news item's best account via LLM.
// Exposed for callers that want account routing accuracy over cost.
export async function classifyBestAccount(
  trTitle: string,
  trSummary: string | null
): Promise<"grafikcem" | "maskulenkod"> {
  const res = await scoreNews(trTitle, trSummary);
  return res.bestAccount === "maskulenkod" ? "maskulenkod" : "grafikcem";
}
