import { describe, it, expect } from "vitest";
import { CATEGORIES, STATUSES, canGenerate } from "./NewsPoolTab";
import { DEFAULT_SOURCES } from "@/lib/news/sources";

describe("NewsPoolTab category filter", () => {
  it("only offers categories that real sources actually write to the DB", () => {
    // product_tools is also set by the synthetic Hacker News source
    // (src/lib/news/hackernews.ts), which isn't part of DEFAULT_SOURCES.
    const dbCategories = new Set([...DEFAULT_SOURCES.map((s) => s.category), "product_tools"]);
    for (const opt of CATEGORIES) {
      if (opt.value === "all") continue;
      expect(dbCategories.has(opt.value), `UI kategorisi DB'de yok: ${opt.value}`).toBe(true);
    }
  });

  it("includes an 'all' option", () => {
    expect(CATEGORIES.some((o) => o.value === "all")).toBe(true);
  });
});

describe("canGenerate", () => {
  it("allows drafting only from analyzed items", () => {
    expect(canGenerate({ processingStatus: "analyzed" })).toBe(true);
    expect(canGenerate({ processingStatus: "raw" })).toBe(false);
    expect(canGenerate({ processingStatus: "translated" })).toBe(false);
    expect(canGenerate({ processingStatus: "failed" })).toBe(false);
    expect(canGenerate({ processingStatus: "quarantined" })).toBe(false);
    expect(canGenerate({ processingStatus: "low_score" })).toBe(false);
  });
});

describe("STATUSES filter options", () => {
  it("offers the low_score archive as an explicit filter", () => {
    expect(STATUSES.some((o) => o.value === "low_score")).toBe(true);
  });

  it("keeps quarantined reachable via explicit filter", () => {
    expect(STATUSES.some((o) => o.value === "quarantined")).toBe(true);
  });
});
