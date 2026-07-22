import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalizeUrlKey,
  indexSignals,
  matchSignalsToItems,
  fetchHackerNewsSignals,
  fetchRedditSignals,
  type ExternalSignal,
} from "@/lib/news/externalSignals";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("normalizeUrlKey", () => {
  it("strips www, query, hash, and trailing slash", () => {
    expect(normalizeUrlKey("https://www.example.com/post/123/?utm=x#frag")).toBe(
      "example.com/post/123",
    );
  });

  it("treats utm-tagged and bare URLs as the same key", () => {
    const a = normalizeUrlKey("https://example.com/a?utm_source=hn");
    const b = normalizeUrlKey("https://example.com/a");
    expect(a).toBe(b);
  });

  it("returns null for invalid input", () => {
    expect(normalizeUrlKey("not a url")).toBeNull();
    expect(normalizeUrlKey(null)).toBeNull();
    expect(normalizeUrlKey(undefined)).toBeNull();
  });
});

describe("indexSignals", () => {
  it("aggregates HN and Reddit signals onto one key, keeping the max", () => {
    const signals: ExternalSignal[] = [
      { url: "https://example.com/a", points: 100, comments: 40, source: "hn" },
      { url: "https://www.example.com/a/", points: 250, comments: 80, source: "hn" },
      { url: "https://example.com/a?x=1", points: 900, comments: 0, source: "reddit" },
    ];
    const index = indexSignals(signals);
    const hit = index.get("example.com/a");
    expect(hit).toEqual({ hnPoints: 250, hnComments: 80, redditScore: 900 });
  });
});

describe("matchSignalsToItems", () => {
  it("matches by canonicalUrl first, then url", () => {
    const items = [
      { id: "1", url: "https://example.com/a", canonicalUrl: "https://example.com/a" },
      { id: "2", url: "https://other.com/b", canonicalUrl: null },
    ];
    const signals: ExternalSignal[] = [
      { url: "https://example.com/a", points: 120, comments: 30, source: "hn" },
    ];
    const matched = matchSignalsToItems(items, signals);
    expect(matched.get("1")).toEqual({ hnPoints: 120, hnComments: 30, redditScore: 0 });
    expect(matched.has("2")).toBe(false);
  });
});

describe("fetch no-throw behavior", () => {
  it("returns [] when HN fetch fails (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    await expect(fetchHackerNewsSignals()).resolves.toEqual([]);
  });

  it("returns [] when Reddit responds non-OK (IP block)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    );
    await expect(fetchRedditSignals()).resolves.toEqual([]);
  });

  it("parses HN hits and skips entries without a url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          hits: [
            { url: "https://example.com/story", points: 320, num_comments: 145 },
            { url: null, points: 10, num_comments: 2 }, // Ask HN — skipped
          ],
        }),
      }),
    );
    const signals = await fetchHackerNewsSignals();
    expect(signals).toEqual([
      { url: "https://example.com/story", points: 320, comments: 145, source: "hn" },
    ]);
  });
});
