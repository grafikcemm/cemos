import { describe, it, expect } from "vitest";
import type {
  SourcePost,
  NewsItem,
  YtVideo,
  IgMedia,
  RepoRadarItem,
} from "@/generated/prisma/client";
import {
  fromSourcePost,
  fromNewsItem,
  fromYtVideo,
  fromIgMedia,
  fromRepoRadarItem,
  fromManualUrl,
  stripSourcePrefix,
  sourcePostPlatform,
  igFormat,
  engagementOf,
} from "@/lib/content/normalizer";

// Minimal mock'lar — yalnız normalize'ın okuduğu alanlar. `as unknown as T` testte
// kabul edilebilir (tam Prisma satırını elle kurmak gürültü olur).
function sp(over: Partial<SourcePost>): SourcePost {
  return {
    id: "sp1",
    sourceType: "x",
    externalId: null,
    tweetId: "12345",
    author: "@dev",
    lang: "en",
    text: "hello world",
    likeCount: 100,
    retweetCount: 10,
    viewCount: 1000,
    url: "https://x.com/dev/12345",
    publishedAt: new Date("2026-06-01T00:00:00Z"),
    mediaUrls: "[]",
    ...over,
  } as unknown as SourcePost;
}

describe("stripSourcePrefix", () => {
  it("removes sourceType prefix", () => {
    expect(stripSourcePrefix("youtube:abc")).toBe("abc");
  });
  it("returns raw id when no prefix", () => {
    expect(stripSourcePrefix("12345")).toBe("12345");
  });
});

describe("sourcePostPlatform", () => {
  it("maps known source types", () => {
    expect(sourcePostPlatform("x")).toBe("x");
    expect(sourcePostPlatform("youtube")).toBe("youtube");
    expect(sourcePostPlatform("reddit")).toBe("reddit");
    expect(sourcePostPlatform("rss")).toBe("news");
  });
});

describe("igFormat", () => {
  it("maps Instagram media types", () => {
    expect(igFormat("REELS")).toBe("ig_reel");
    expect(igFormat("VIDEO")).toBe("ig_reel");
    expect(igFormat("CAROUSEL_ALBUM")).toBe("ig_carousel");
    expect(igFormat("IMAGE")).toBe("ig_static");
  });
});

describe("fromSourcePost", () => {
  it("normalizes an X post and derives x_single format", () => {
    const out = fromSourcePost(sp({}));
    expect(out.platform).toBe("x");
    expect(out.externalId).toBe("12345");
    expect(out.format).toBe("x_single");
    expect(out.originTable).toBe("SourcePost");
    expect(out.metrics).toEqual({ likes: 100, retweets: 10, views: 1000 });
  });

  it("derives x_image when media present", () => {
    const out = fromSourcePost(sp({ mediaUrls: '["https://img/1.jpg"]' }));
    expect(out.format).toBe("x_image");
    expect(out.mediaUrls).toEqual(["https://img/1.jpg"]);
  });

  it("prefers externalId over stripped tweetId", () => {
    const out = fromSourcePost(sp({ externalId: "RAW99", tweetId: "x:RAW99" }));
    expect(out.externalId).toBe("RAW99");
  });

  it("DEDUP: same source yields a stable (platform, externalId) key", () => {
    const a = fromSourcePost(sp({ likeCount: 100 }));
    const b = fromSourcePost(sp({ likeCount: 250 })); // metrics changed, identity same
    expect(`${a.platform}:${a.externalId}`).toBe(`${b.platform}:${b.externalId}`);
  });
});

describe("fromNewsItem", () => {
  it("prefers Turkish title/summary, falls back to original", () => {
    const out = fromNewsItem({
      id: "n1",
      url: "https://news/1",
      canonicalUrl: null,
      trTitle: "Başlık",
      originalTitle: "Title",
      trSummary: null,
      originalSummary: "Summary",
      lang: "en",
      imageUrl: "https://img/n.jpg",
      publishedAt: null,
    } as unknown as NewsItem);
    expect(out.platform).toBe("news");
    expect(out.format).toBe("news_article");
    expect(out.title).toBe("Başlık");
    expect(out.body).toBe("Summary");
    expect(out.mediaUrls).toEqual(["https://img/n.jpg"]);
  });
});

describe("fromYtVideo", () => {
  it("maps short vs long format and view metrics", () => {
    const short = fromYtVideo({
      videoId: "v1",
      isShort: true,
      title: "t",
      description: "d",
      viewCount: 5000,
      likeCount: 100,
      commentCount: 20,
      id: "y1",
      publishedAt: null,
    } as unknown as YtVideo);
    expect(short.platform).toBe("youtube");
    expect(short.format).toBe("yt_short");
    expect(short.metrics).toEqual({ views: 5000, likes: 100, comments: 20 });
    const long = fromYtVideo({ videoId: "v2", isShort: false, id: "y2" } as unknown as YtVideo);
    expect(long.format).toBe("yt_long");
  });
});

describe("fromIgMedia", () => {
  it("maps reel/carousel formats", () => {
    const reel = fromIgMedia({
      mediaId: "m1",
      mediaType: "REELS",
      caption: "c",
      likeCount: 42,
      commentCount: 5,
      permalink: "https://ig/p",
      id: "i1",
      postedAt: null,
    } as unknown as IgMedia);
    expect(reel.platform).toBe("instagram");
    expect(reel.format).toBe("ig_reel");
    expect(reel.metrics).toEqual({ likes: 42, comments: 5 });
  });
});

describe("fromRepoRadarItem", () => {
  it("maps repo metrics and owner", () => {
    const out = fromRepoRadarItem({
      repoUrl: "https://github.com/o/r",
      repoName: "r",
      owner: "o",
      descriptionTr: "açıklama",
      stars: 1200,
      forks: 80,
      language: "TypeScript",
      id: "r1",
      lastCommitAt: null,
    } as unknown as RepoRadarItem);
    expect(out.platform).toBe("repo");
    expect(out.externalId).toBe("https://github.com/o/r");
    expect(out.author).toBe("o");
    expect(out.metrics).toEqual({ stars: 1200, forks: 80 });
  });
});

describe("fromManualUrl", () => {
  it("creates a manual content item keyed by url", () => {
    const out = fromManualUrl("https://example.com/x", "T", "B");
    expect(out.platform).toBe("manual");
    expect(out.externalId).toBe("https://example.com/x");
    expect(out.sourceType).toBe("manual");
  });
});

describe("engagementOf", () => {
  it("uses views for youtube", () => {
    expect(engagementOf({ views: 9000, likes: 5 }, "youtube")).toBe(9000);
  });
  it("sums interactions for text platforms", () => {
    expect(engagementOf({ likes: 10, retweets: 5, comments: 3, shares: 2 }, "x")).toBe(20);
  });
  it("returns 0 for missing metrics", () => {
    expect(engagementOf(undefined, "x")).toBe(0);
  });
});
