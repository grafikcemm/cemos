import { describe, it, expect } from "vitest";
import { deriveTrainingPlatform, deriveViralPlatform } from "@/lib/db/platformDerive";

describe("deriveTrainingPlatform", () => {
  it("maps yt_ inputType prefixes to youtube", () => {
    expect(deriveTrainingPlatform("yt_brief")).toBe("youtube");
  });

  it("maps ig_ inputType prefixes to instagram", () => {
    expect(deriveTrainingPlatform("ig_reply")).toBe("instagram");
    expect(deriveTrainingPlatform("ig_dm")).toBe("instagram");
  });

  it("falls back to x for engagement and draft inputs", () => {
    expect(deriveTrainingPlatform("engagement_metric")).toBe("x");
    expect(deriveTrainingPlatform("approved_draft")).toBe("x");
    expect(deriveTrainingPlatform("")).toBe("x");
  });
});

describe("deriveViralPlatform", () => {
  it("maps youtube sourceType to youtube", () => {
    expect(deriveViralPlatform("youtube")).toBe("youtube");
    expect(deriveViralPlatform("yt")).toBe("youtube");
  });

  it("maps instagram sourceType to instagram", () => {
    expect(deriveViralPlatform("instagram")).toBe("instagram");
    expect(deriveViralPlatform("ig_comment")).toBe("instagram");
  });

  it("keeps reddit/rss/x sources on x", () => {
    expect(deriveViralPlatform("reddit")).toBe("x");
    expect(deriveViralPlatform("rss")).toBe("x");
    expect(deriveViralPlatform("x")).toBe("x");
  });

  it("defaults to x when sourceType is missing", () => {
    expect(deriveViralPlatform(undefined)).toBe("x");
    expect(deriveViralPlatform(null)).toBe("x");
  });
});
