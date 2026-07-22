import { describe, it, expect } from "vitest";
import {
  TOOLBOX_BUCKETS,
  categoriesForBucket,
  bucketForCategory,
  chipLabel,
  CATEGORY_CHIP_LABEL,
} from "./buckets";

describe("TOOLBOX_BUCKETS taxonomy", () => {
  it("has no category in more than one bucket (counts must not double-count)", () => {
    const seen = new Map<string, string>();
    for (const b of TOOLBOX_BUCKETS) {
      for (const c of b.categories) {
        expect(seen.has(c), `category "${c}" appears in both ${seen.get(c)} and ${b.key}`).toBe(false);
        seen.set(c, b.key);
      }
    }
  });

  it("keeps Araçlar as the LAST bucket (bucketForCategory fallback target)", () => {
    expect(TOOLBOX_BUCKETS[TOOLBOX_BUCKETS.length - 1].key).toBe("araclar");
  });

  it("AI bucket exposes the 5 sub-categories", () => {
    expect(categoriesForBucket("ai")).toEqual([
      "AI Eğitim",
      "LLM",
      "AI Örnekleri",
      "Design.md",
      "AI Sıralama",
    ]);
  });

  it("no longer carries the legacy 'Yapay Zeka' category", () => {
    const all = TOOLBOX_BUCKETS.flatMap((b) => b.categories);
    expect(all).not.toContain("Yapay Zeka");
  });

  it("maps each AI sub-category back to the ai bucket", () => {
    for (const c of ["AI Eğitim", "LLM", "AI Örnekleri", "Design.md", "AI Sıralama"]) {
      expect(bucketForCategory(c)).toBe("ai");
    }
  });

  it("falls back to the last bucket for an unknown category", () => {
    expect(bucketForCategory("Bilinmeyen")).toBe("araclar");
  });

  it("returns null categories for an unknown bucket key", () => {
    expect(categoriesForBucket("nope")).toBeNull();
  });
});

describe("chipLabel", () => {
  it("shortens AI sub-category labels (and disambiguates 'AI Sıralama')", () => {
    expect(chipLabel("AI Eğitim")).toBe("Eğitim");
    expect(chipLabel("AI Örnekleri")).toBe("Örnekler");
    expect(chipLabel("AI Sıralama")).toBe("Sıralama");
  });

  it("falls back to the raw category when unmapped", () => {
    expect(chipLabel("Tasarım")).toBe("Tasarım");
  });

  it("only defines chip labels for the 5 AI sub-categories", () => {
    expect(Object.keys(CATEGORY_CHIP_LABEL).sort()).toEqual(
      ["AI Eğitim", "AI Örnekleri", "AI Sıralama", "Design.md", "LLM"].sort()
    );
  });
});
