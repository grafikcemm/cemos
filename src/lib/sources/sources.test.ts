import { describe, it, expect, beforeEach } from "vitest";
import { __test as rssTest } from "@/lib/sources/rss";
import { preFilterBatch } from "@/lib/sources/pre-filter";
import { deriveScores } from "@/lib/services/discoveryService";
import type { NormalizedItem } from "@/lib/sources/types";

const SAMPLE_RSS = `<?xml version="1.0"?><rss><channel>
  <item>
    <title>OpenAI yeni model duyurdu</title>
    <link>https://example.com/a</link>
    <description><![CDATA[<p>Tasarımcılar için <b>büyük</b> güncelleme geldi.</p>]]></description>
    <guid>guid-a</guid>
    <pubDate>Mon, 08 Jun 2026 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title>x</title>
    <link>https://example.com/short</link>
    <description>too short</description>
  </item>
</channel></rss>`;

const SAMPLE_ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Atom başlık örneği yeterince uzun</title>
    <link href="https://example.com/atom1"/>
    <summary>Bu bir atom özetidir ve yeterince uzundur.</summary>
    <id>atom-1</id>
    <updated>2026-06-07T12:00:00Z</updated>
  </entry>
</feed>`;

describe("rss parser", () => {
  it("strips HTML and CDATA", () => {
    expect(rssTest.stripHtml("<p>hello&amp;world</p>")).toBe("hello&world");
  });

  it("parses RSS items and skips too-short entries", () => {
    const items = rssTest.parseFeed(SAMPLE_RSS, "TestFeed", "tr");
    expect(items).toHaveLength(1);
    expect(items[0].sourceType).toBe("rss");
    expect(items[0].text).toContain("OpenAI yeni model");
    expect(items[0].author).toBe("TestFeed");
    expect(items[0].sourceWeight).toBe(0.6);
    expect(items[0].publishedAt).toBeInstanceOf(Date);
  });

  it("parses Atom entries with href links", () => {
    const items = rssTest.parseFeed(SAMPLE_ATOM, "AtomFeed", "tr");
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://example.com/atom1");
  });

  it("produces stable hash ids", () => {
    expect(rssTest.hashId("guid-a")).toBe(rssTest.hashId("guid-a"));
    expect(rssTest.hashId("guid-a")).not.toBe(rssTest.hashId("guid-b"));
  });
});

describe("deriveScores", () => {
  it("ranks higher engagement above lower engagement", () => {
    const low = deriveScores({ engagementScore: 5, sourceWeight: 0.7 } as NormalizedItem);
    const high = deriveScores({ engagementScore: 5000, sourceWeight: 0.7 } as NormalizedItem);
    expect(high.viralScore).toBeGreaterThan(low.viralScore);
    expect(high.viralScore).toBeLessThanOrEqual(99);
    expect(low.viralScore).toBeGreaterThanOrEqual(5);
    expect(high.opportunityScore).toBeLessThanOrEqual(1);
  });
});

describe("preFilterBatch fail-open", () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  it("keeps every item when there is no API key", async () => {
    const items: NormalizedItem[] = [
      { sourceType: "reddit", externalId: "1", text: "bir içerik yeterince uzun", url: "u", engagementScore: 10, sourceWeight: 0.7 },
      { sourceType: "rss", externalId: "2", text: "ikinci içerik yeterince uzun", url: "u2", engagementScore: 0, sourceWeight: 0.6 },
    ];
    const res = await preFilterBatch(items, "grafikcem");
    expect(res.kept).toHaveLength(2);
    expect(res.usedLlm).toBe(false);
    expect(res.reason).toBe("no_api_key");
  });

  it("returns empty for empty input", async () => {
    const res = await preFilterBatch([], "grafikcem");
    expect(res.kept).toHaveLength(0);
  });
});
