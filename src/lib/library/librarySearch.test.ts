import { describe, it, expect } from "vitest";
import {
  flattenKeywords,
  compareLibItems,
  mergeAndPaginate,
  type LibItem,
  type KeywordJson,
} from "./librarySearch";

const KW: KeywordJson = {
  categories: [
    { name: "Işık", keywords: [["Sinematik ışık", "Cinematic lighting"], ["Neon ışık", "Neon lighting"]] },
    { name: "Stil", keywords: [["Lüks", "Luxury"]] },
  ],
};

function item(over: Partial<LibItem>): LibItem {
  return { id: "x", type: "viral", title: "t", body: "b", tags: [], ...over };
}

describe("flattenKeywords", () => {
  it("tüm anahtar kelimeleri düzleştirir (sorgu yok)", () => {
    expect(flattenKeywords(KW, "").length).toBe(3);
  });

  it("Türkçe-duyarlı sorguyla süzer (tr veya en eşleşir)", () => {
    expect(flattenKeywords(KW, "ışık").map((k) => k.title)).toEqual(["Sinematik ışık", "Neon ışık"]);
    expect(flattenKeywords(KW, "luxury").map((k) => k.title)).toEqual(["Lüks"]);
  });

  it("kategori adını meta ve tag olarak taşır", () => {
    const k = flattenKeywords(KW, "lüks")[0];
    expect(k.type).toBe("keyword");
    expect(k.meta).toBe("Stil");
    expect(k.tags).toEqual(["Stil"]);
  });
});

describe("compareLibItems", () => {
  it("yeni tarih önce gelir", () => {
    const older = item({ id: "a", createdAt: "2026-01-01T00:00:00Z" });
    const newer = item({ id: "b", createdAt: "2026-06-01T00:00:00Z" });
    expect([older, newer].sort(compareLibItems).map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("tarihsiz (keyword) sona düşer", () => {
    const dated = item({ id: "a", createdAt: "2026-01-01T00:00:00Z" });
    const undat = item({ id: "b" });
    expect([undat, dated].sort(compareLibItems).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("eşit tarihte id tie-break → deterministik", () => {
    const a = item({ id: "a", createdAt: "2026-01-01T00:00:00Z" });
    const b = item({ id: "b", createdAt: "2026-01-01T00:00:00Z" });
    expect([b, a].sort(compareLibItems).map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("mergeAndPaginate", () => {
  const items = Array.from({ length: 30 }, (_, i) =>
    item({ id: `id${String(i).padStart(2, "0")}`, createdAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z` }),
  );

  it("offset/limit dilimini döndürür", () => {
    const page1 = mergeAndPaginate(items, 0, 10);
    expect(page1.length).toBe(10);
    const page2 = mergeAndPaginate(items, 10, 10);
    expect(page2.length).toBe(10);
    // Sayfalar örtüşmez
    expect(page1.some((p) => page2.map((q) => q.id).includes(p.id))).toBe(false);
  });
});
