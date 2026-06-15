import type { AccountHandle } from "@/lib/accounts";
import { NEWS_SOURCES } from "@/lib/news-sources";
import type { NormalizedItem, SourceConnector } from "@/lib/sources/types";

const FETCH_TIMEOUT_MS = 12_000;

function stripHtml(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? stripHtml(m[1]) : "";
}

function pickLink(block: string): string {
  // RSS: <link>url</link>. Atom: <link href="url" .../>
  const rss = block.match(/<link>([\s\S]*?)<\/link>/i);
  if (rss?.[1]) return stripHtml(rss[1]);
  const atom = block.match(/<link[^>]*href="([^"]+)"/i);
  return atom?.[1] ?? "";
}

function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(36)}`;
}

function parseFeed(xml: string, feedName: string, lang: string): NormalizedItem[] {
  const items: NormalizedItem[] = [];
  // Support both RSS <item> and Atom <entry>.
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) ?? [];
  for (const block of blocks) {
    const title = pick(block, "title");
    const description = pick(block, "description") || pick(block, "summary") || pick(block, "content");
    const url = pickLink(block);
    const guid = pick(block, "guid") || pick(block, "id") || url || title;
    const pubRaw = pick(block, "pubDate") || pick(block, "updated") || pick(block, "published");
    const text = [title, description].filter(Boolean).join(" — ").slice(0, 600);
    if (!title || text.length < 20) continue;
    let publishedAt: Date | undefined;
    if (pubRaw) {
      const d = new Date(pubRaw);
      if (!Number.isNaN(d.getTime())) publishedAt = d;
    }
    items.push({
      sourceType: "rss",
      externalId: hashId(guid),
      text,
      url: url || "",
      author: feedName,
      lang,
      engagementScore: 0, // RSS exposes no engagement; ranking leans on recency + weight
      sourceWeight: 0.6,
      publishedAt,
    });
  }
  return items;
}

async function fetchFeed(rssUrl: string, name: string, lang: string): Promise<NormalizedItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(rssUrl, {
      headers: { "User-Agent": "grafikcem-xagent/1.0", Accept: "application/rss+xml, application/xml, text/xml" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeed(xml, name, lang);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export const rssConnector: SourceConnector = {
  type: "rss",
  isConfigured(): boolean {
    return true; // RSS needs no credentials
  },
  async fetchForAccount(handle: AccountHandle, limit: number): Promise<NormalizedItem[]> {
    const feeds = NEWS_SOURCES[handle] ?? [];
    if (feeds.length === 0) return [];
    const settled = await Promise.allSettled(feeds.map((f) => fetchFeed(f.rssUrl, f.name, f.lang)));
    const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
    // Freshest first, then cap.
    all.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
    return all.slice(0, limit);
  },
};

export const __test = { parseFeed, stripHtml, hashId };
