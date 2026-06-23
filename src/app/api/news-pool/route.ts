import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { ok, fail } from "@/lib/utils/apiResponse";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const NEWS_SOURCE_SELECT = {
  select: { name: true, sourceType: true, reliability: true, url: true },
} as const;

// compact=true trims the payload to what the pool cards actually render —
// the full default response was ~185KB at limit=100 (TRAN-ITEM-1.6).
const COMPACT_SELECT = {
  id: true,
  originalTitle: true,
  trTitle: true,
  trSummary: true,
  url: true,
  imageUrl: true,
  category: true,
  viralScore: true,
  xValueScore: true,
  buzzScore: true,
  hnPoints: true,
  hnComments: true,
  redditScore: true,
  tweetAngle: true,
  suggestedFormat: true,
  sourceVerification: true,
  processingStatus: true,
  isRead: true,
  isUsed: true,
  fetchedAt: true,
  publishedAt: true,
  newsSource: NEWS_SOURCE_SELECT,
} satisfies Prisma.NewsItemSelect;

// GET /api/news-pool?status=&category=&minScore=&limit=&compact=
// Lists the news pool with optional filters.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const category = sp.get("category");
  const minScoreRaw = sp.get("minScore");
  const compact = sp.get("compact") === "true";
  const sort = sp.get("sort") || "buzz"; // buzz (reader default) | recent | score
  const limit = Math.min(Number(sp.get("limit")) || 50, 200);

  const where: Prisma.NewsItemWhereInput = {};
  // Default view hides archived noise: low-score items (xValueScore < 70) and
  // stale-quarantined ones only appear when their status is asked for explicitly.
  if (status) where.processingStatus = status;
  else where.processingStatus = { notIn: ["low_score", "quarantined"] };
  if (category) where.category = category;
  if (minScoreRaw && !Number.isNaN(Number(minScoreRaw))) {
    where.xValueScore = { gte: Number(minScoreRaw) };
  }

  // Reader-first default: "çok konuşulan" (buzz) ranking. "recent" = newest,
  // "score" = legacy tweet-value ranking (operator view).
  const ORDER_BY: Record<string, Prisma.NewsItemOrderByWithRelationInput[]> = {
    buzz: [
      { buzzScore: { sort: "desc", nulls: "last" } },
      { publishedAt: { sort: "desc", nulls: "last" } },
    ],
    recent: [
      { publishedAt: { sort: "desc", nulls: "last" } },
      { fetchedAt: "desc" },
    ],
    score: [
      { xValueScore: { sort: "desc", nulls: "last" } },
      { fetchedAt: "desc" },
    ],
  };

  try {
    // Prisma forbids select+include in one call → two explicit branches.
    const baseQuery = {
      where,
      orderBy: ORDER_BY[sort] ?? ORDER_BY.buzz,
      take: limit,
    } satisfies Prisma.NewsItemFindManyArgs;
    const items = compact
      ? await prisma.newsItem.findMany({ ...baseQuery, select: COMPACT_SELECT })
      : await prisma.newsItem.findMany({ ...baseQuery, include: { newsSource: NEWS_SOURCE_SELECT } });
    return ok({ count: items.length, items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
