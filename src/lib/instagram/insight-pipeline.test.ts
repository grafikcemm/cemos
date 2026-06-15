import { describe, it, expect } from "vitest";
import {
  parseAccountInsights,
  parseMediaInsights,
  groupMediaBySeries,
  topMediaByReach,
  type MediaInsightItem,
  type SeriesConfigEntry,
} from "@/lib/instagram/insight-pipeline";

describe("parseAccountInsights — metrik drift toleransı", () => {
  it("total_value.value okur", () => {
    const raw = { data: [{ name: "reach", total_value: { value: 1200 } }] };
    expect(parseAccountInsights(raw).reach).toBe(1200);
  });

  it("values[] toplamına düşer", () => {
    const raw = { data: [{ name: "reach", values: [{ value: 100 }, { value: 50 }] }] };
    expect(parseAccountInsights(raw).reach).toBe(150);
  });

  it("impressions VE views → views (hangisi varsa)", () => {
    const withViews = { data: [{ name: "views", total_value: { value: 9 } }] };
    const withImpressions = { data: [{ name: "impressions", total_value: { value: 7 } }] };
    expect(parseAccountInsights(withViews).views).toBe(9);
    expect(parseAccountInsights(withImpressions).views).toBe(7);
  });

  it("saved VE saves alias'ını çözer", () => {
    const raw = { data: [{ name: "saved", total_value: { value: 33 } }] };
    expect(parseAccountInsights(raw).saves).toBe(33);
  });

  it("bilinmeyen/eksik → 0; boş → tüm sıfır", () => {
    expect(parseAccountInsights({ data: [] })).toEqual({
      reach: 0,
      views: 0,
      accountsEngaged: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      shares: 0,
    });
    expect(parseAccountInsights(null).reach).toBe(0);
  });
});

describe("parseMediaInsights", () => {
  it("insight metriklerini okur, eksikte like_count fallback", () => {
    const raw = {
      data: [
        {
          id: "x1",
          caption: "Color Combos #3",
          permalink: "https://ig/x1",
          media_type: "CAROUSEL_ALBUM",
          like_count: 42,
          insights: { data: [{ name: "reach", values: [{ value: 500 }] }, { name: "saved", values: [{ value: 20 }] }] },
        },
      ],
    };
    const out = parseMediaInsights(raw);
    expect(out[0]).toMatchObject({ mediaId: "x1", reach: 500, saves: 20, likes: 42 });
  });

  it("id'siz medyayı atlar", () => {
    expect(parseMediaInsights({ data: [{ caption: "no id" }] })).toEqual([]);
  });
});

describe("topMediaByReach", () => {
  it("reach'e göre azalan, topN keser", () => {
    const items = [
      { mediaId: "a", reach: 10 },
      { mediaId: "b", reach: 90 },
      { mediaId: "c", reach: 50 },
    ] as MediaInsightItem[];
    const out = topMediaByReach(items, 2);
    expect(out.map((m) => m.mediaId)).toEqual(["b", "c"]);
  });
});

describe("groupMediaBySeries", () => {
  const config: SeriesConfigEntry[] = [
    { label: "Color Combos", keywords: ["color combo", "renk"] },
    { label: "Best AI Prompts", keywords: ["prompt"] },
  ];
  const mk = (id: string, caption: string, reach: number, saves: number, shares: number): MediaInsightItem => ({
    mediaId: id,
    caption,
    permalink: "",
    mediaType: "",
    reach,
    likes: 0,
    saves,
    shares,
    comments: 0,
  });

  it("caption'ı seriye eşler, engagement'a göre sıralar", () => {
    const items = [
      mk("1", "En iyi renk paleti — Color Combo", 1000, 100, 50),
      mk("2", "Bu prompt harika", 1000, 5, 1),
    ];
    const out = groupMediaBySeries(items, config);
    expect(out[0].label).toBe("Color Combos"); // yüksek engagement önce
    expect(out[0].postCount).toBe(1);
    expect(out[0].totalSaves).toBe(100);
    expect(out[0].avgEngagement).toBeGreaterThan(out[1].avgEngagement);
  });

  it("eşleşmeyeni Diğer'e koyar (düşürmez)", () => {
    const items = [mk("9", "alakasız içerik", 100, 1, 0)];
    const out = groupMediaBySeries(items, config);
    expect(out.map((s) => s.label)).toContain("Diğer");
  });

  it("aynı seriye ait postları toplar", () => {
    const items = [
      mk("1", "renk paleti A", 500, 10, 5),
      mk("2", "renk paleti B", 500, 20, 5),
    ];
    const out = groupMediaBySeries(items, config);
    const cc = out.find((s) => s.label === "Color Combos")!;
    expect(cc.postCount).toBe(2);
    expect(cc.totalSaves).toBe(30);
    expect(cc.totalReach).toBe(1000);
  });
});
