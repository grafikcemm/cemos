import { prisma } from "@/lib/db/client";
import { cleanNewsText, isStalePublishDate } from "@/lib/news/pipeline";

// Hacker News front-page fetch via the free Algolia API (no key required).
// Upserts results as raw NewsItems so they flow through translate → score with
// everything else. We tag them with a synthetic NewsSource ("Hacker News") and
// rely on the pipeline's normal stages downstream.

const HN_FRONT_PAGE = "https://hn.algolia.com/api/v1/search?tags=front_page";
const HN_TOP_RECENT = "https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E100";

type HnHit = {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
  created_at: string | null;
  story_text?: string | null;
};

type HnResponse = { hits?: HnHit[] };

async function ensureHnSource(): Promise<string> {
  const feedUrl = "https://hn.algolia.com/api/v1/search?tags=front_page";
  const existing = await prisma.newsSource.findUnique({ where: { feedUrl } });
  if (existing) return existing.id;
  const created = await prisma.newsSource.create({
    data: {
      name: "Hacker News",
      url: "https://news.ycombinator.com",
      feedUrl,
      sourceType: "hackernews",
      category: "product_tools",
      priority: 88,
      reliability: "high",
    },
  });
  return created.id;
}

async function fetchHits(endpoint: string): Promise<HnHit[]> {
  const res = await fetch(endpoint, {
    headers: { "User-Agent": "GrafikCem-XAgent/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HN HTTP ${res.status}`);
  const json = (await res.json()) as HnResponse;
  return json.hits ?? [];
}

export interface HackerNewsSyncResult {
  processed: number;
  errors: number;
  fetched: number;
}

export async function syncHackerNews(opts: { maxItems?: number } = {}): Promise<HackerNewsSyncResult> {
  const maxItems = opts.maxItems ?? 20;
  const result: HackerNewsSyncResult = { processed: 0, errors: 0, fetched: 0 };

  let hits: HnHit[];
  try {
    const [front, recent] = await Promise.all([
      fetchHits(HN_FRONT_PAGE),
      fetchHits(HN_TOP_RECENT).catch(() => [] as HnHit[]),
    ]);
    // Front page first (already curated), then high-point recent stories.
    const seen = new Set<string>();
    hits = [...front, ...recent].filter((h) => {
      if (!h.objectID || seen.has(h.objectID)) return false;
      seen.add(h.objectID);
      return Boolean(h.title && h.url);
    });
  } catch (err) {
    result.errors++;
    console.warn("[hackernews] fetch başarısız:", err);
    return result;
  }

  result.fetched = hits.length;
  const sourceId = await ensureHnSource();

  for (const hit of hits.slice(0, maxItems)) {
    const url = hit.url!;
    const publishedAt = hit.created_at ? new Date(hit.created_at) : new Date();
    // Old stories resurface on HN regularly — skip anything past the stale window.
    if (isStalePublishDate(publishedAt)) continue;

    try {
      const exists = await prisma.newsItem.findUnique({ where: { url }, select: { id: true } });
      if (exists) continue;

      const summary = hit.story_text ? cleanNewsText(hit.story_text).slice(0, 1000) : "";
      await prisma.newsItem.create({
        data: {
          newsSourceId: sourceId,
          url,
          canonicalUrl: url,
          originalTitle: cleanNewsText(hit.title!),
          originalSummary: summary || `Hacker News · ${hit.points ?? 0} puan`,
          category: "product_tools",
          processingStatus: "raw",
          translationStatus: "pending",
          analysisStatus: "pending",
          publishedAt,
        },
      });
      result.processed++;
    } catch {
      // Unique-url race: ignore.
    }
  }

  return result;
}
