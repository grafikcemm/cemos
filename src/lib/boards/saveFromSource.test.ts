import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Research → ContentItem bridge (Phase 4B): server re-loads the authoritative
 * origin row and runs the typed normalizer (client DTO fields untrusted). Each
 * kind maps to the right platform/externalId; missing row → honest not-found.
 */

const ciFindUnique = vi.fn();
const newsFindUnique = vi.fn();
const ytFindUnique = vi.fn();
const spFindUnique = vi.fn();
const igFindUnique = vi.fn();
const repoFindUnique = vi.fn();
const ingestContent = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    contentItem: { findUnique: (a: unknown) => ciFindUnique(a) },
    newsItem: { findUnique: (a: unknown) => newsFindUnique(a) },
    ytVideo: { findUnique: (a: unknown) => ytFindUnique(a) },
    sourcePost: { findUnique: (a: unknown) => spFindUnique(a) },
    igMedia: { findUnique: (a: unknown) => igFindUnique(a) },
    repoRadarItem: { findUnique: (a: unknown) => repoFindUnique(a) },
  },
}));

vi.mock("@/lib/content/ingestService", () => ({
  ingestContent: (input: unknown) => ingestContent(input),
}));

import { resolveSourceToContentItem } from "./saveFromSource";

beforeEach(() => {
  vi.clearAllMocks();
  ingestContent.mockImplementation((input: { platform: string; externalId: string }) =>
    Promise.resolve({ id: `ci-${input.platform}-${input.externalId}`, ...input }),
  );
});

describe("resolveSourceToContentItem", () => {
  it("contentItem → doğrudan satır, ingest ÇAĞRILMAZ", async () => {
    ciFindUnique.mockResolvedValue({ id: "ci-1", platform: "x", externalId: "e1" });
    const r = await resolveSourceToContentItem({ kind: "contentItem", contentItemId: "ci-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.contentItem.id).toBe("ci-1");
    expect(ingestContent).not.toHaveBeenCalled();
  });

  it("news → NewsItem satırı id ile yüklenir → platform 'news', externalId=id", async () => {
    newsFindUnique.mockResolvedValue({
      id: "news-1",
      url: "https://n/1",
      canonicalUrl: null,
      originalTitle: "T",
      trTitle: "Başlık",
      trSummary: "Özet",
      originalSummary: null,
      lang: "tr",
      imageUrl: null,
      publishedAt: null,
    });
    const r = await resolveSourceToContentItem({ kind: "news", id: "news-1" });
    expect(newsFindUnique).toHaveBeenCalledWith({ where: { id: "news-1" } });
    expect(r.ok).toBe(true);
    const input = ingestContent.mock.calls[0][0];
    expect(input.platform).toBe("news");
    expect(input.externalId).toBe("news-1");
  });

  it("ytVideo → YtVideo videoId (unique) ile yüklenir → platform 'youtube'", async () => {
    ytFindUnique.mockResolvedValue({
      videoId: "vid123",
      title: "V",
      description: "D",
      isShort: false,
      viewCount: 10,
      likeCount: 1,
      commentCount: 0,
      publishedAt: null,
    });
    const r = await resolveSourceToContentItem({ kind: "ytVideo", videoId: "vid123" });
    expect(ytFindUnique).toHaveBeenCalledWith({ where: { videoId: "vid123" } });
    expect(r.ok).toBe(true);
    const input = ingestContent.mock.calls[0][0];
    expect(input.platform).toBe("youtube");
    expect(input.externalId).toBe("vid123");
  });

  it("sourcePost → SourcePost id ile yüklenir → sourceType'tan platform türetilir", async () => {
    spFindUnique.mockResolvedValue({
      id: "sp-1",
      tweetId: "x:999",
      externalId: "999",
      sourceType: "twitter",
      url: "https://x.com/a/999",
      text: "gönderi",
      lang: "tr",
      author: "@a",
      mediaUrls: "[]",
      likeCount: 5,
      retweetCount: 1,
      viewCount: 100,
      publishedAt: null,
    });
    const r = await resolveSourceToContentItem({ kind: "sourcePost", id: "sp-1" });
    expect(spFindUnique).toHaveBeenCalledWith({ where: { id: "sp-1" } });
    expect(r.ok).toBe(true);
    const input = ingestContent.mock.calls[0][0];
    expect(input.platform).toBe("x");
    expect(input.externalId).toBe("999");
  });

  it("kaynak satırı yok → source_not_found (ingest yok)", async () => {
    newsFindUnique.mockResolvedValue(null);
    const r = await resolveSourceToContentItem({ kind: "news", id: "yok" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("source_not_found");
    expect(ingestContent).not.toHaveBeenCalled();
  });

  it("contentItem yok → source_not_found", async () => {
    ciFindUnique.mockResolvedValue(null);
    const r = await resolveSourceToContentItem({ kind: "contentItem", contentItemId: "yok" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("source_not_found");
  });
});
