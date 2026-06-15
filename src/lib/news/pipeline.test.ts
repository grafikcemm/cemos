import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  decodeEntities,
  repairMojibake,
  cleanNewsText,
  isStalePublishDate,
  parseRSSItems,
  syncDueSources,
  translateBatch,
  analyzeBatch,
} from "./pipeline";
import { prisma } from "@/lib/db/client";
import { translateNews, scoreNews } from "@/lib/news/newsAi";
import { detectLanguage } from "@/lib/news/language";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    newsItem: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    newsSource: {
      count: vi.fn(),
      findMany: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/news/newsAi", () => ({
  translateNews: vi.fn(),
  scoreNews: vi.fn(),
}));

vi.mock("@/lib/news/language", () => ({
  detectLanguage: vi.fn(() => ({ isTurkish: false, confidence: 0 })),
}));

const FAR_DEADLINE = () => Date.now() + 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(detectLanguage).mockReturnValue({ isTurkish: false, confidence: 0 } as never);
});

// --- pure text helpers -------------------------------------------------------

describe("decodeEntities", () => {
  it("decodes decimal numeric entities", () => {
    expect(decodeEntities("Apple&#8217;s launch")).toBe("Apple’s launch");
  });

  it("decodes hex numeric entities", () => {
    expect(decodeEntities("it&#x27;s here")).toBe("it's here");
  });

  it("decodes named entities", () => {
    expect(decodeEntities("AI &amp; tools &mdash; daily&nbsp;news&hellip;")).toBe(
      "AI & tools — daily news…",
    );
  });

  it("leaves unknown entities untouched", () => {
    expect(decodeEntities("a &unknownent; b")).toBe("a &unknownent; b");
  });
});

describe("repairMojibake", () => {
  it("repairs UTF-8 read as latin1 (Turkish)", () => {
    expect(repairMojibake("GÃ¼nÃ¼n en iyi aracÄ±")).toBe("Günün en iyi aracı");
  });

  it("repairs cp1252 smart quotes", () => {
    // "“quote”" mangled: the closing quote's third byte (0x9D) survives as the
    // invisible U+009D control char in real-world mojibake.
    expect(repairMojibake("â€œquoteâ€")).toBe("“quote”");
  });

  it("leaves truncated mojibake untouched instead of corrupting it", () => {
    // Incomplete UTF-8 sequence (missing the 0x9D byte) → repair must no-op.
    expect(repairMojibake("â€œquoteâ€")).toBe("â€œquoteâ€");
  });

  it("is a no-op on clean Turkish text", () => {
    const clean = "Bugünün öne çıkan şıklığı: kâğıt işler";
    expect(repairMojibake(clean)).toBe(clean);
  });

  it("is a no-op on plain ASCII", () => {
    expect(repairMojibake("hello world")).toBe("hello world");
  });
});

describe("cleanNewsText", () => {
  it("strips CDATA, tags and entities in one pass", () => {
    expect(cleanNewsText("<![CDATA[Apple&#8217;s new <b>AI</b> &amp; tools]]>")).toBe(
      "Apple’s new AI & tools",
    );
  });

  it("strips entity-escaped HTML after decoding", () => {
    expect(cleanNewsText("&lt;p&gt;Hello&lt;/p&gt; world")).toBe("Hello world");
  });

  it("collapses whitespace", () => {
    expect(cleanNewsText("a\n\n  b\t c")).toBe("a b c");
  });

  // Regression for the prod backfill (scripts/clean-news-text.ts): the known
  // dirty shapes must come out as their exact clean forms. (The script's DIRTY
  // regex is only a candidate finder — legit Turkish "â" matches it, so it is
  // not usable as a cleanliness oracle here.)
  it("repairs the known dirty samples to their exact clean forms", () => {
    const cases: Array<[string, string]> = [
      ["Appleâ€™s big bet", "Apple’s big bet"],
      ["GÃ¼ndem: yapay zekÃ¢", "Gündem: yapay zekâ"],
      ["Claude&#8217;s memory &amp; tools", "Claude’s memory & tools"],
      ["&lt;p&gt;Detaylar burada&lt;/p&gt;", "Detaylar burada"],
      ["Bayat haber: 7 gÃ¼nden eski, otomatik karantina", "Bayat haber: 7 günden eski, otomatik karantina"],
    ];
    for (const [dirty, clean] of cases) {
      expect(cleanNewsText(dirty)).toBe(clean);
    }
  });
});

describe("isStalePublishDate", () => {
  const now = Date.now();

  it("flags items older than 7 days", () => {
    expect(isStalePublishDate(new Date(now - 8 * 24 * 60 * 60 * 1000), now)).toBe(true);
  });

  it("accepts items within 7 days", () => {
    expect(isStalePublishDate(new Date(now - 6 * 24 * 60 * 60 * 1000), now)).toBe(false);
  });
});

describe("parseRSSItems", () => {
  it("extracts and cleans items from RSS2 xml", () => {
    const xml = `<rss><channel>
      <item>
        <title><![CDATA[Claude&#8217;s new &amp; improved API]]></title>
        <link>https://example.com/a</link>
        <description>&lt;p&gt;Big &lt;b&gt;update&lt;/b&gt; today&lt;/p&gt;</description>
        <pubDate>Wed, 10 Jun 2026 08:00:00 GMT</pubDate>
      </item>
    </channel></rss>`;
    const items = parseRSSItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Claude’s new & improved API");
    expect(items[0].link).toBe("https://example.com/a");
    expect(items[0].description).toBe("Big update today");
  });
});

// --- sync: stale filtering ----------------------------------------------------

describe("syncDueSources", () => {
  it("skips stale items before insert", async () => {
    const freshDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toUTCString();
    const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toUTCString();
    const xml = `<rss><channel>
      <item><title>Fresh story</title><link>https://example.com/fresh</link><pubDate>${freshDate}</pubDate></item>
      <item><title>Stale story</title><link>https://example.com/stale</link><pubDate>${staleDate}</pubDate></item>
    </channel></rss>`;

    vi.mocked(prisma.newsSource.count).mockResolvedValue(1);
    vi.mocked(prisma.newsSource.findMany).mockResolvedValue([
      {
        id: "s1",
        name: "Test Feed",
        feedUrl: "https://example.com/feed",
        category: "tech_news",
        errorCount: 0,
        fetchIntervalMin: 60,
        lastCheckedAt: null,
      },
    ] as never);
    vi.mocked(prisma.newsItem.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.newsItem.create).mockResolvedValue({} as never);
    vi.mocked(prisma.newsSource.update).mockResolvedValue({} as never);

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(xml) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncDueSources(FAR_DEADLINE());

    expect(result.processed).toBe(1);
    expect(prisma.newsItem.create).toHaveBeenCalledTimes(1);
    const created = vi.mocked(prisma.newsItem.create).mock.calls[0][0] as {
      data: { url: string };
    };
    expect(created.data.url).toBe("https://example.com/fresh");

    vi.unstubAllGlobals();
  });
});

// --- translate: status transitions + paging + deadline ------------------------

const rawItem = (id: string) => ({
  id,
  originalTitle: `English headline ${id}`,
  originalSummary: "An english summary",
  trTitle: null,
  trSummary: null,
  translationStatus: "pending",
});

describe("translateBatch", () => {
  it("moves raw → translated on success", async () => {
    vi.mocked(prisma.newsItem.count).mockResolvedValue(1);
    vi.mocked(prisma.newsItem.findMany).mockResolvedValueOnce([rawItem("n1")] as never);
    vi.mocked(translateNews).mockResolvedValue({
      success: true,
      trTitle: "Türkçe başlık",
      trSummary: "Türkçe özet",
      modelUsed: "test-model",
    } as never);
    vi.mocked(prisma.newsItem.update).mockResolvedValue({} as never);

    const result = await translateBatch(FAR_DEADLINE());

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);
    expect(prisma.newsItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "n1" },
        data: expect.objectContaining({ processingStatus: "translated" }),
      }),
    );
  });

  it("moves raw → failed on translation failure", async () => {
    vi.mocked(prisma.newsItem.count).mockResolvedValue(1);
    vi.mocked(prisma.newsItem.findMany).mockResolvedValueOnce([rawItem("n2")] as never);
    vi.mocked(translateNews).mockResolvedValue({
      success: false,
      validationError: "leak detected",
    } as never);
    vi.mocked(prisma.newsItem.update).mockResolvedValue({} as never);

    const result = await translateBatch(FAR_DEADLINE());

    expect(result.errors).toBe(1);
    expect(prisma.newsItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ processingStatus: "failed", errorMessage: "leak detected" }),
      }),
    );
  });

  it("passes Turkish sources through without calling the LLM", async () => {
    vi.mocked(detectLanguage).mockReturnValue({ isTurkish: true, confidence: 90 } as never);
    vi.mocked(prisma.newsItem.count).mockResolvedValue(1);
    vi.mocked(prisma.newsItem.findMany).mockResolvedValueOnce([rawItem("n3")] as never);
    vi.mocked(prisma.newsItem.update).mockResolvedValue({} as never);

    const result = await translateBatch(FAR_DEADLINE());

    expect(result.processed).toBe(1);
    expect(translateNews).not.toHaveBeenCalled();
    expect(prisma.newsItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ modelUsed: "passthrough_turkish_source" }),
      }),
    );
  });

  it("pages through the backlog beyond a single batch", async () => {
    vi.mocked(prisma.newsItem.count).mockResolvedValue(3);
    vi.mocked(prisma.newsItem.findMany)
      .mockResolvedValueOnce([rawItem("a"), rawItem("b")] as never)
      .mockResolvedValueOnce([rawItem("c")] as never);
    vi.mocked(translateNews).mockResolvedValue({
      success: true,
      trTitle: "t",
      trSummary: "s",
      modelUsed: "m",
    } as never);
    vi.mocked(prisma.newsItem.update).mockResolvedValue({} as never);

    const result = await translateBatch(FAR_DEADLINE(), 2);

    expect(result.processed).toBe(3);
    expect(result.remaining).toBe(0);
    expect(prisma.newsItem.findMany).toHaveBeenCalledTimes(2);
  });

  it("sets deadlineHit and stops when the deadline is near", async () => {
    vi.mocked(prisma.newsItem.count).mockResolvedValue(5);

    const result = await translateBatch(Date.now() + 5_000);

    expect(result.deadlineHit).toBe(true);
    expect(result.remaining).toBe(5);
    expect(prisma.newsItem.findMany).not.toHaveBeenCalled();
  });
});

describe("analyzeBatch", () => {
  // analyzeBatch's FIRST findMany call loads the cross-source verification
  // corpus; the pending-items query comes after it in every iteration.
  const translatedItem = (id: string) => ({
    id,
    originalTitle: "Original headline",
    url: `https://example.com/${id}`,
    newsSourceId: "src-1",
    trTitle: "Türkçe başlık",
    trSummary: "Türkçe özet",
  });

  it("moves translated → analyzed on success", async () => {
    vi.mocked(prisma.newsItem.count).mockResolvedValue(1);
    vi.mocked(prisma.newsItem.findMany)
      .mockResolvedValueOnce([] as never) // verification corpus
      .mockResolvedValueOnce([translatedItem("n1")] as never);
    vi.mocked(scoreNews).mockResolvedValue({
      success: true,
      viralScore: 80,
      xValueScore: 85,
      whyPeopleCare: "önemli",
      tweetAngle: "açı",
      suggestedFormat: "micro",
      modelUsed: "judge",
    } as never);
    vi.mocked(prisma.newsItem.update).mockResolvedValue({} as never);

    const result = await analyzeBatch(FAR_DEADLINE());

    expect(result.processed).toBe(1);
    expect(prisma.newsItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ processingStatus: "analyzed", xValueScore: 85 }),
      }),
    );
  });

  it("archives items scoring below LOW_SCORE_THRESHOLD as low_score", async () => {
    vi.mocked(prisma.newsItem.count).mockResolvedValue(1);
    vi.mocked(prisma.newsItem.findMany)
      .mockResolvedValueOnce([] as never) // verification corpus
      .mockResolvedValueOnce([translatedItem("n3")] as never)
      .mockResolvedValue([] as never);
    vi.mocked(scoreNews).mockResolvedValue({
      success: true,
      viralScore: 50,
      xValueScore: 55,
      whyPeopleCare: "az önemli",
      tweetAngle: "zayıf açı",
      suggestedFormat: "micro",
      modelUsed: "judge",
    } as never);
    vi.mocked(prisma.newsItem.update).mockResolvedValue({} as never);

    const result = await analyzeBatch(FAR_DEADLINE());

    expect(result.processed).toBe(1);
    expect(prisma.newsItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processingStatus: "low_score",
          analysisStatus: "success",
          errorMessage: expect.stringContaining("Düşük skor: 55"),
        }),
      }),
    );
  });

  it("re-queues items that lost their translation", async () => {
    vi.mocked(prisma.newsItem.count).mockResolvedValue(1);
    vi.mocked(prisma.newsItem.findMany)
      .mockResolvedValueOnce([] as never) // verification corpus
      .mockResolvedValueOnce([{ id: "n2", trTitle: null, trSummary: null }] as never);
    vi.mocked(prisma.newsItem.update).mockResolvedValue({} as never);

    const result = await analyzeBatch(FAR_DEADLINE());

    expect(result.processed).toBe(0);
    expect(scoreNews).not.toHaveBeenCalled();
    expect(prisma.newsItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ processingStatus: "raw" }),
      }),
    );
  });
});
