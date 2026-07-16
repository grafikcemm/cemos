import type { AccountHandle } from "@/lib/accounts";

export type NewsSource = {
  name: string;
  rssUrl: string;
  lang: "en" | "tr";
};

export const NEWS_SOURCES: Partial<Record<AccountHandle, NewsSource[]>> = {
  grafikcem: [
    // Türkçe tech/AI
    { name: "Webrazzi", rssUrl: "https://webrazzi.com/feed/", lang: "tr" },
    { name: "ShiftDelete", rssUrl: "https://shiftdelete.net/feed", lang: "tr" },
    { name: "Webtekno", rssUrl: "https://www.webtekno.com/rss.xml", lang: "tr" },
    { name: "Log.com.tr", rssUrl: "https://log.com.tr/feed/", lang: "tr" },
    // Uluslararası AI/tech
    { name: "TechCrunch AI", rssUrl: "https://techcrunch.com/category/artificial-intelligence/feed/", lang: "en" },
    { name: "The Verge AI", rssUrl: "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml", lang: "en" },
    { name: "VentureBeat AI", rssUrl: "https://venturebeat.com/category/ai/feed/", lang: "en" },
    { name: "Ars Technica", rssUrl: "https://feeds.arstechnica.com/arstechnica/technology-lab", lang: "en" }
  ],
  maskulenkod: [
    // Türkçe kişisel gelişim / psikoloji / ilişki
    { name: "Uplifers", rssUrl: "https://www.uplifers.com/feed/", lang: "tr" },
    { name: "Evrim Ağacı", rssUrl: "https://evrimagaci.org/rss", lang: "tr" },
    // Uluslararası erkeklik / disiplin / ilişki
    { name: "Mark Manson", rssUrl: "https://markmanson.net/feed", lang: "en" },
    { name: "Art of Manliness", rssUrl: "https://www.artofmanliness.com/feed/", lang: "en" },
    { name: "Farnam Street", rssUrl: "https://fs.blog/feed/", lang: "en" }
  ]
};

export const NEWS_ENABLED_CHANNELS: AccountHandle[] = ["grafikcem"];

/** String-handle erişimi (ADR-031): tohumlu olmayan hesap → boş liste (fail-soft). */
export function getNewsSources(handle: string): NewsSource[] {
  return (NEWS_SOURCES as Partial<Record<string, NewsSource[]>>)[handle] ?? [];
}
