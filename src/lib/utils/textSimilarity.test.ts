import { describe, it, expect } from "vitest";
import { isNearDuplicate, calculateJaccardSimilarity, calculateLevenshteinSimilarity } from "./textSimilarity";

describe("textSimilarity Utility", () => {
  it("should normalize and find exact match", () => {
    const textA = "Bu bir test tweetidir!";
    const textB = "bu bir test tweetidir.";
    expect(isNearDuplicate(textA, textB)).toBe(true);
  });

  it("should normalize Turkish characters", () => {
    const textA = "Grafikçem şampiyon olacak!";
    const textB = "grafikcem sampiyon olacak";
    expect(isNearDuplicate(textA, textB)).toBe(true);
  });

  it("should ignore URLs", () => {
    const textA = "Haber detayı burada: https://t.co/xyz123";
    const textB = "haber detayi burada";
    expect(isNearDuplicate(textA, textB)).toBe(true);
  });

  it("should identify near duplicate using Jaccard", () => {
    const textA = "Yarın hava çok güzel olacak demiştik.";
    const textB = "Yarın hava çok güzel olacak demiştik kesinlikle.";
    expect(calculateJaccardSimilarity(textA, textB)).toBeGreaterThanOrEqual(0.8);
  });

  it("should identify near duplicate using Levenshtein", () => {
    const textA = "Fenerbahçe bugün galip geldi.";
    const textB = "Fenerbahçe bugun galip geldi.";
    expect(calculateLevenshteinSimilarity(textA, textB)).toBeGreaterThan(0.9);
    expect(isNearDuplicate(textA, textB)).toBe(true);
  });

  it("should not mark totally different text as duplicate", () => {
    const textA = "Hava durumu çok kötü.";
    const textB = "Fenerbahçe transfer gündemi sıcak.";
    expect(isNearDuplicate(textA, textB)).toBe(false);
  });
});
