import type { NewsItem } from "@/generated/prisma/client";

/**
 * NewsItem → taslak grounding metni. Tek kaynak: hem manuel köprü
 * (/api/news-pool/[id]/generate-draft) hem sabah cron'unun haber fallback'i
 * (pipelineService) aynı kompozisyonu kullanır — iki yüzey ayrışamaz.
 */
export function composeNewsGrounding(news: NewsItem): string {
  return [
    news.trTitle || news.originalTitle,
    news.trSummary || news.originalSummary || "",
    news.whyPeopleCare ? `Neden önemli: ${news.whyPeopleCare}` : "",
    news.tweetAngle ? `Açı: ${news.tweetAngle}` : "",
    news.url,
  ]
    .filter(Boolean)
    .join("\n");
}
