import { describe, it, expect } from "vitest";
import { aggregateTrends } from "./trend-aggregator";

describe("aggregateTrends", () => {
  it("returns empty when nothing recurs above minCount", () => {
    const r = aggregateTrends({ items: [{ text: "tek başına benzersiz kelimeler" }] });
    expect(r).toEqual([]);
  });

  it("ranks a recurring term by document frequency", () => {
    const r = aggregateTrends({
      items: [
        { text: "Claude kod yazıyor harika" },
        { text: "Claude ile otomasyon kurdum" },
        { text: "Midjourney görsel üretti" },
      ],
      minCount: 2,
    });
    expect(r[0].term).toBe("claude");
    expect(r[0].count).toBe(2);
  });

  it("counts a term once per document, not per occurrence", () => {
    const r = aggregateTrends({
      items: [
        { text: "figma figma figma tasarım" },
        { text: "figma ile prototip" },
      ],
      minCount: 2,
    });
    const figma = r.find((t) => t.term === "figma");
    expect(figma?.count).toBe(2);
  });
});
