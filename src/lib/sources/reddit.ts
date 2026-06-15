import type { AccountHandle } from "@/lib/accounts";
import { NICHE_QUERIES } from "@/lib/sources/niche-queries";
import type { NormalizedItem, SourceConnector } from "@/lib/sources/types";

const FETCH_TIMEOUT_MS = 12_000;

type RedditChild = {
  data?: {
    id?: string;
    title?: string;
    selftext?: string;
    ups?: number;
    num_comments?: number;
    permalink?: string;
    author?: string;
    created_utc?: number;
    over_18?: boolean;
    stickied?: boolean;
  };
};

type RedditListing = {
  data?: { children?: RedditChild[] };
};

async function fetchSubreddit(subreddit: string, limit: number): Promise<NormalizedItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?t=week&limit=${limit}`;
    const res = await fetch(url, {
      // Reddit blocks the default fetch UA; a descriptive UA is required.
      headers: { "User-Agent": "web:grafikcem-xagent:1.0 (by /u/grafikcem)" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as RedditListing;
    const children = json.data?.children ?? [];
    const items: NormalizedItem[] = [];
    for (const child of children) {
      const d = child.data;
      if (!d?.id || !d.title) continue;
      if (d.over_18 || d.stickied) continue;
      const text = [d.title, d.selftext].filter(Boolean).join(" — ").slice(0, 600);
      if (text.length < 20) continue;
      const ups = d.ups ?? 0;
      const comments = d.num_comments ?? 0;
      items.push({
        sourceType: "reddit",
        externalId: d.id,
        text,
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : `https://redd.it/${d.id}`,
        author: `r/${subreddit}`,
        lang: "en",
        engagementScore: ups + comments * 2,
        sourceWeight: 0.7,
        publishedAt: d.created_utc ? new Date(d.created_utc * 1000) : undefined,
      });
    }
    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export const redditConnector: SourceConnector = {
  type: "reddit",
  isConfigured(): boolean {
    // Public listing JSON needs no key. Allow an explicit kill-switch.
    return process.env.DISABLE_REDDIT_SOURCE !== "true";
  },
  async fetchForAccount(handle: AccountHandle, limit: number): Promise<NormalizedItem[]> {
    if (!this.isConfigured()) return [];
    const subs = NICHE_QUERIES[handle]?.reddit ?? [];
    if (subs.length === 0) return [];
    const perSub = Math.max(3, Math.ceil(limit / subs.length));
    const settled = await Promise.allSettled(subs.map((s) => fetchSubreddit(s, perSub)));
    const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
    all.sort((a, b) => b.engagementScore - a.engagementScore);
    return all.slice(0, limit);
  },
};
