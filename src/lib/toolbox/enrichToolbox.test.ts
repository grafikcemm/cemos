import { describe, it, expect } from "vitest";
import { applyEnrichment, buildEnrichPrompt } from "./enrichToolbox";

describe("applyEnrichment", () => {
  const valid = {
    platform: "X",
    useCase: "Mockup",
    contentFormat: "görsel",
    sourceReliability: "high",
    xValueScore: 82,
  };

  it("normalizes a valid LLM object", () => {
    expect(applyEnrichment(valid)).toEqual(valid);
  });

  it("clamps xValueScore into 0..100 and rounds", () => {
    expect(applyEnrichment({ ...valid, xValueScore: 999 })?.xValueScore).toBe(100);
    expect(applyEnrichment({ ...valid, xValueScore: -5 })?.xValueScore).toBe(0);
    expect(applyEnrichment({ ...valid, xValueScore: 73.6 })?.xValueScore).toBe(74);
  });

  it("defaults a non-numeric score to 0", () => {
    expect(applyEnrichment({ ...valid, xValueScore: "abc" })?.xValueScore).toBe(0);
  });

  it("falls back to 'genel' for an unknown platform", () => {
    expect(applyEnrichment({ ...valid, platform: "TikTok" })?.platform).toBe("genel");
  });

  it("falls back to 'medium' for an unknown reliability", () => {
    expect(applyEnrichment({ ...valid, sourceReliability: "perfect" })?.sourceReliability).toBe("medium");
  });

  it("returns null when useCase is missing (treated as not-enriched)", () => {
    expect(applyEnrichment({ ...valid, useCase: "" })).toBeNull();
    expect(applyEnrichment({ ...valid, useCase: "   " })).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(applyEnrichment(null)).toBeNull();
    expect(applyEnrichment("nope")).toBeNull();
    expect(applyEnrichment(42)).toBeNull();
  });

  it("trims long free-text fields to 80 chars", () => {
    const long = "x".repeat(200);
    const out = applyEnrichment({ ...valid, useCase: long, contentFormat: long });
    expect(out?.useCase.length).toBe(80);
    expect(out?.contentFormat.length).toBe(80);
  });
});

describe("buildEnrichPrompt", () => {
  it("includes the resource fields in the user prompt", () => {
    const { system, user } = buildEnrichPrompt({
      title: "Figma",
      url: "https://figma.com",
      category: "design",
      description: "Tasarım aracı",
      whyUseful: "Mockup üretir",
    });
    expect(system).toContain("xValueScore");
    expect(user).toContain("Figma");
    expect(user).toContain("https://figma.com");
    expect(user).toContain("Mockup üretir");
  });

  it("omits empty optional lines", () => {
    const { user } = buildEnrichPrompt({
      title: "T",
      url: "https://t.co",
      category: "x",
      description: "",
      whyUseful: null,
    });
    expect(user).not.toContain("Açıklama:");
    expect(user).not.toContain("Neden faydalı:");
  });
});
