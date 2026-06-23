import { describe, it, expect } from "vitest";
import { buildSearchableDoc, embedText, cosine, rankBySimilarity } from "@/lib/content/search";

describe("buildSearchableDoc", () => {
  it("joins non-empty fields", () => {
    const doc = buildSearchableDoc({ title: "T", body: "B", transcript: "", author: "a", format: "x_single" });
    expect(doc).toContain("T");
    expect(doc).toContain("B");
    expect(doc).toContain("x_single");
    expect(doc.split("\n")).not.toContain(""); // boşlar atlanır
  });
});

describe("cosine", () => {
  it("identical vectors → 1", () => {
    expect(cosine([1, 0, 1], [1, 0, 1])).toBeCloseTo(1);
  });
  it("orthogonal → 0", () => {
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });
  it("length mismatch → 0", () => {
    expect(cosine([1, 2], [1, 2, 3])).toBe(0);
  });
  it("empty → 0", () => {
    expect(cosine([], [])).toBe(0);
  });
});

describe("embedText + rankBySimilarity", () => {
  it("ranks the most similar document first", () => {
    const q = embedText("yapay zeka tasarım araçları");
    const a = embedText("yapay zeka tasarım araçları çok güçlü");
    const b = embedText("futbol maç sonucu transfer haberi");
    const hits = rankBySimilarity(q.values, [
      { id: "a", values: a.values },
      { id: "b", values: b.values },
    ]);
    expect(hits[0].id).toBe("a");
    expect(hits[0].score).toBeGreaterThan(hits[1]?.score ?? 0);
  });

  it("deterministic embedding (same text → same vector)", () => {
    expect(embedText("test").values).toEqual(embedText("test").values);
  });

  it("respects limit", () => {
    const q = embedText("x");
    const cands = ["a", "b", "c", "d"].map((id) => ({ id, values: embedText(id + " x").values }));
    expect(rankBySimilarity(q.values, cands, 2).length).toBeLessThanOrEqual(2);
  });
});
