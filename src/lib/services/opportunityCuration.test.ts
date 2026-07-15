import { describe, it, expect } from "vitest";
import {
  curateOpportunities,
  opportunityScore,
  type OpportunityInput,
} from "./opportunityCuration";

function input(over: Partial<OpportunityInput>): OpportunityInput {
  return {
    id: "x",
    source: "news",
    title: "t",
    whyNow: "w",
    badge: "b",
    suggestedPlatform: "X",
    topicSeed: "t",
    rawTab: "news-pool",
    ...over,
  };
}

describe("opportunityScore", () => {
  it("yüksek buzz daha yüksek skor verir", () => {
    const low = opportunityScore(input({ buzz: 10, ageHours: 10 }));
    const high = opportunityScore(input({ buzz: 90, ageHours: 10 }));
    expect(high).toBeGreaterThan(low);
  });

  it("daha taze sinyal daha yüksek skor verir", () => {
    const stale = opportunityScore(input({ buzz: 50, ageHours: 70 }));
    const fresh = opportunityScore(input({ buzz: 50, ageHours: 1 }));
    expect(fresh).toBeGreaterThan(stale);
  });

  it("yetersiz örneklemli outlier çarpanı buzz'a şişirilmez", () => {
    const inflated = opportunityScore(input({ multiplier: 5, insufficient: false, ageHours: 10 }));
    const honest = opportunityScore(input({ multiplier: 5, insufficient: true, ageHours: 10 }));
    // insufficient → çarpan yok sayılır → varsayılan (40) → daha düşük skor
    expect(honest).toBeLessThan(inflated);
  });

  it("0-100 aralığında kalır", () => {
    expect(opportunityScore(input({ buzz: 100, ageHours: 0, personaFit: 1 }))).toBeLessThanOrEqual(100);
    expect(opportunityScore(input({ buzz: -50, ageHours: 999, personaFit: -1 }))).toBeGreaterThanOrEqual(0);
  });
});

describe("curateOpportunities", () => {
  it("skora göre azalan sıralar", () => {
    const out = curateOpportunities([
      input({ id: "a", buzz: 10, ageHours: 50 }),
      input({ id: "b", buzz: 95, ageHours: 1 }),
      input({ id: "c", buzz: 50, ageHours: 20 }),
    ]);
    expect(out.map((o) => o.id)).toEqual(["b", "c", "a"]);
  });

  it("kaynak-başı kap çeşitliliği korur", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      input({ id: `news-${i}`, source: "news", buzz: 90 - i }),
    );
    const one = input({ id: "yt-1", source: "youtube", buzz: 1 });
    const out = curateOpportunities([...many, one], { perSourceCap: 4, limit: 8 });
    expect(out.filter((o) => o.source === "news").length).toBeLessThanOrEqual(4);
    expect(out.some((o) => o.source === "youtube")).toBe(true);
  });

  it("limit toplam sonucu sınırlar", () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      input({ id: `s${i}`, source: (["news", "youtube", "radar", "discovery"] as const)[i % 4], buzz: 50 }),
    );
    expect(curateOpportunities(items, { limit: 6 }).length).toBe(6);
  });

  it("deterministik — aynı girdi aynı sıra (id tie-break)", () => {
    const items = [input({ id: "b", buzz: 50, ageHours: 5 }), input({ id: "a", buzz: 50, ageHours: 5 })];
    const first = curateOpportunities(items).map((o) => o.id);
    const second = curateOpportunities(items).map((o) => o.id);
    expect(first).toEqual(second);
    expect(first).toEqual(["a", "b"]); // eşit skorda id artan
  });
});
