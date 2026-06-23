import type { NextRequest } from "next/server";
import { z } from "zod";
import { NEWS_SOURCES } from "@/lib/news-sources";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";
import type { AccountHandle } from "@/lib/accounts";

export interface FetchedNewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  lang: "en" | "tr";
}

function extractText(xml: string, tag: string): string {
  const cdataMatch = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i").exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();
  const tagMatch = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  if (tagMatch) return tagMatch[1].replace(/<[^>]+>/g, "").trim();
  return "";
}

function parseRss(xml: string, sourceName: string, lang: "en" | "tr"): FetchedNewsItem[] {
  const items: FetchedNewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractText(block, "title");
    const link = extractText(block, "link") || extractText(block, "guid");
    const description = extractText(block, "description");
    const pubDate = extractText(block, "pubDate");

    if (!title || !link) continue;

    items.push({
      id: `news-${Buffer.from(link).toString("base64").slice(0, 16)}`,
      title,
      description: description.slice(0, 300),
      url: link,
      source: sourceName,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      lang,
    });
  }

  return items.slice(0, 8);
}

const ChannelSchema = z.object({
  channel: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = ChannelSchema.safeParse(body.data);
  const channel = parsed.success ? (parsed.data.channel as AccountHandle) : undefined;

  if (!channel || !NEWS_SOURCES[channel as keyof typeof NEWS_SOURCES]) {
    return fail("Bu kanal için haber kaynağı yok", 400);
  }

  try {
    const sources = NEWS_SOURCES[channel as keyof typeof NEWS_SOURCES]!;
    const allItems: FetchedNewsItem[] = [];
    const errors: string[] = [];

    await Promise.allSettled(
      sources.map(async (src) => {
        try {
          const res = await fetch(src.rssUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; XAgent/1.0)" },
            next: { revalidate: 1800 },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const xml = await res.text();
          const items = parseRss(xml, src.name, src.lang);
          allItems.push(...items);
        } catch (err) {
          errors.push(`${src.name}: ${err instanceof Error ? err.message : "hata"}`);
        }
      })
    );

    // En yeniden eskiye sırala
    allItems.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    return ok({
      channel,
      items: allItems.slice(0, 30),
      errors,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
