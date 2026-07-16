import { getWatchedSources } from "@/lib/sources";
import { fetchUserTweets } from "@/lib/socialdata";
import type { NormalizedItem, SourceConnector } from "@/lib/sources/types";

/**
 * Thin adapter that maps the existing SocialData X connector into the unified
 * NormalizedItem shape. X scanning costs money, so this is key-gated and capped.
 */
export const xConnector: SourceConnector = {
  type: "x",
  isConfigured(): boolean {
    return Boolean(process.env.SOCIALDATA_API_KEY);
  },
  async fetchForAccount(handle: string, limit: number): Promise<NormalizedItem[]> {
    if (!this.isConfigured()) return [];
    const handles = getWatchedSources(handle).slice(0, 4); // cap cost
    if (handles.length === 0) return [];
    const perHandle = Math.max(2, Math.ceil(limit / handles.length));
    const settled = await Promise.allSettled(
      handles.map((s) => fetchUserTweets(s.handle, perHandle))
    );
    const items: NormalizedItem[] = [];
    for (const r of settled) {
      if (r.status !== "fulfilled") continue;
      for (const t of r.value.tweets) {
        items.push({
          sourceType: "x",
          externalId: t.id,
          text: t.text,
          url: t.url,
          author: `@${t.handle}`,
          lang: "tr",
          engagementScore: t.likeCount + t.retweetCount * 2 + t.replyCount,
          sourceWeight: 0.9,
          publishedAt: t.createdAt ? new Date(t.createdAt) : undefined,
        });
      }
    }
    items.sort((a, b) => b.engagementScore - a.engagementScore);
    return items.slice(0, limit);
  },
};
