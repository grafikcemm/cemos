// Canonical content normalizer (Eden ilkesi: tek birleşik Content Item).
// Tüm platform kaynakları (X/IG/YT/News/Repo/manuel) tek şekle indirgenir.
// Saf fonksiyonlar (DB yok) → birim testlenebilir. Dedup anahtarı (platform,
// externalId); contentItemRepo.upsert bunu kullanır. Mevcut tablolar DOKUNULMAZ —
// originTable+originId ile soft-provenance bağlanır.

import type {
  SourcePost,
  NewsItem,
  YtVideo,
  IgMedia,
  RepoRadarItem,
} from "@/generated/prisma/client";

export type CanonicalMetrics = {
  likes?: number;
  retweets?: number;
  views?: number;
  comments?: number;
  shares?: number;
  stars?: number;
  forks?: number;
};

export type NormalizedContentInput = {
  platform: string; // x | instagram | youtube | news | repo | manual | reddit
  externalId: string; // ham platform id (prefix'siz)
  canonicalUrl?: string | null;
  sourceType?: string; // external | own | manual
  originTable?: string;
  originId?: string;
  contentType?: string; // post | video | article | repo | thread
  format?: string; // x_single | x_thread | ig_reel | ...
  title?: string;
  body?: string;
  transcript?: string;
  language?: string | null;
  author?: string;
  mediaUrls?: string[];
  metrics?: CanonicalMetrics;
  rawMetadata?: Record<string, unknown>;
  publishedAt?: Date | null;
};

/** "youtube:abc" → "abc"; prefix yoksa olduğu gibi. SourcePost.tweetId universal key. */
export function stripSourcePrefix(rawId: string): string {
  const idx = rawId.indexOf(":");
  return idx >= 0 ? rawId.slice(idx + 1) : rawId;
}

function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}

/** SourcePost.sourceType → kanonik platform. reddit/rss X hesabını besler ama kendi
 *  platformu olarak korunur (dedup doğruluğu); yt → youtube. */
export function sourcePostPlatform(sourceType: string): string {
  const s = sourceType.toLowerCase();
  if (s.startsWith("yt") || s === "youtube") return "youtube";
  if (s.startsWith("ig") || s === "instagram") return "instagram";
  if (s === "reddit") return "reddit";
  if (s === "rss" || s === "news") return "news";
  return "x";
}

/** X format: medya varsa image_post, yoksa single. (thread tespiti ileride.) */
function xFormat(hasMedia: boolean): string {
  return hasMedia ? "x_image" : "x_single";
}

/** Instagram mediaType → kanonik format. */
export function igFormat(mediaType: string): string {
  const t = mediaType.toUpperCase();
  if (t === "REELS" || t === "VIDEO") return "ig_reel";
  if (t === "CAROUSEL_ALBUM") return "ig_carousel";
  return "ig_static";
}

export function fromSourcePost(p: SourcePost): NormalizedContentInput {
  const mediaUrls = safeParseArray(p.mediaUrls);
  const platform = sourcePostPlatform(p.sourceType);
  const externalId = p.externalId ?? stripSourcePrefix(p.tweetId);
  return {
    platform,
    externalId,
    canonicalUrl: p.url,
    sourceType: "external",
    originTable: "SourcePost",
    originId: p.id,
    contentType: "post",
    format: platform === "x" ? xFormat(mediaUrls.length > 0) : "",
    body: p.text,
    language: p.lang,
    author: p.author ?? "",
    mediaUrls,
    metrics: { likes: p.likeCount, retweets: p.retweetCount, views: p.viewCount },
    publishedAt: p.publishedAt,
  };
}

export function fromNewsItem(n: NewsItem): NormalizedContentInput {
  return {
    platform: "news",
    externalId: n.id,
    canonicalUrl: n.canonicalUrl ?? n.url,
    sourceType: "external",
    originTable: "NewsItem",
    originId: n.id,
    contentType: "article",
    format: "news_article",
    title: n.trTitle ?? n.originalTitle,
    body: n.trSummary ?? n.originalSummary ?? "",
    language: n.lang,
    mediaUrls: n.imageUrl ? [n.imageUrl] : [],
    publishedAt: n.publishedAt,
  };
}

export function fromYtVideo(v: YtVideo): NormalizedContentInput {
  return {
    platform: "youtube",
    externalId: v.videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
    sourceType: "external",
    originTable: "YtVideo",
    originId: v.id,
    contentType: "video",
    format: v.isShort ? "yt_short" : "yt_long",
    title: v.title,
    body: v.description,
    metrics: { views: v.viewCount, likes: v.likeCount, comments: v.commentCount },
    publishedAt: v.publishedAt,
  };
}

export function fromIgMedia(m: IgMedia): NormalizedContentInput {
  return {
    platform: "instagram",
    externalId: m.mediaId,
    canonicalUrl: m.permalink || null,
    sourceType: "external",
    originTable: "IgMedia",
    originId: m.id,
    contentType: "post",
    format: igFormat(m.mediaType),
    body: m.caption,
    metrics: { likes: m.likeCount, comments: m.commentCount },
    publishedAt: m.postedAt,
  };
}

export function fromRepoRadarItem(r: RepoRadarItem): NormalizedContentInput {
  return {
    platform: "repo",
    externalId: r.repoUrl,
    canonicalUrl: r.repoUrl,
    sourceType: "external",
    originTable: "RepoRadarItem",
    originId: r.id,
    contentType: "repo",
    format: "repo",
    title: r.repoName,
    body: r.descriptionTr,
    author: r.owner,
    language: r.language,
    metrics: { stars: r.stars, forks: r.forks },
    publishedAt: r.lastCommitAt,
  };
}

/** Manuel URL → kanonik içerik (en zayıf normalize; kullanıcı ekler). */
export function fromManualUrl(url: string, title?: string, body?: string): NormalizedContentInput {
  return {
    platform: "manual",
    externalId: url,
    canonicalUrl: url,
    sourceType: "manual",
    contentType: "post",
    format: "",
    title: title ?? "",
    body: body ?? "",
  };
}

/**
 * Outlier paydası için tek skalar engagement metriği. Video platformlarında views
 * baskın; metinde likes+retweets+comments+shares. Negatif yok.
 */
export function engagementOf(metrics: CanonicalMetrics | undefined, platform: string): number {
  if (!metrics) return 0;
  if (platform === "youtube") return Math.max(0, metrics.views ?? 0);
  const sum =
    (metrics.likes ?? 0) +
    (metrics.retweets ?? 0) +
    (metrics.comments ?? 0) +
    (metrics.shares ?? 0) +
    (metrics.stars ?? 0);
  return Math.max(0, sum);
}
