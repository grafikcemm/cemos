import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildGenerationContext,
  buildGenerationContextFallback,
  resolveSourceContent,
  getRelevantPatterns
} from "./context-builder";

vi.mock("../db/sourcePostRepo", () => ({
  sourcePostRepo: {
    findById: vi.fn((id: string) => {
      if (id === "valid-id") {
        return Promise.resolve({
          id: "valid-id",
          text: "Mocked Source Post Text content",
          url: "https://x.com/mock/status/123",
          likeCount: 150,
          retweetCount: 45,
          viewCount: 3000,
          publishedAt: new Date()
        });
      }
      return Promise.resolve(null);
    })
  }
}));

vi.mock("../db/viralPatternRepo", () => ({
  viralPatternRepo: {
    listByAccount: vi.fn(() => Promise.resolve([
      { id: "p1", patternName: "Hook Hook", hookType: "question", successScore: 90 },
      { id: "p2", patternName: "Claims", hookType: "mirror", successScore: 80 }
    ])),
    findById: vi.fn((id: string) => {
      if (id === "p1") return Promise.resolve({ id: "p1", patternName: "Hook Hook", successScore: 90 });
      return Promise.resolve(null);
    })
  }
}));

vi.mock("../db/accountRepo", () => ({
  accountRepo: {
    findByHandle: vi.fn((handle: string) => Promise.resolve({ id: `acc-${handle}`, handle }))
  }
}));

describe("Context Builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully build context for valid inputs", async () => {
    const ctx = await buildGenerationContext({
      accountHandle: "grafikcem",
      actionType: "tweet",
      sourceContent: "Test content is here"
    });

    expect(ctx.accountProfile).toBeDefined();
    expect(ctx.accountProfile.handle).toBe("grafikcem");
    expect(ctx.actionType).toBe("tweet");
    expect(ctx.sourceContent).toBe("Test content is here");
    expect(ctx.constraints.maxChars).toBe(1500);
    expect(ctx.relevantPatterns.length).toBeGreaterThan(0);
  });

  it("should throw error if account handle is invalid", async () => {
    await expect(
      buildGenerationContext({
        accountHandle: "invalid" as any,
        actionType: "tweet",
        sourceContent: "Valid content"
      })
    ).rejects.toThrow("Invalid account handle: invalid");
  });

  it("should resolve sourcePostId content correctly", async () => {
    const ctx = await buildGenerationContext({
      accountHandle: "grafikcem",
      actionType: "tweet",
      sourcePostId: "valid-id"
    });

    expect(ctx.sourceContent).toBe("Mocked Source Post Text content");
    expect(ctx.sourceUrl).toBe("https://x.com/mock/status/123");
    expect(ctx.sourceScore).toBeDefined();
    expect(ctx.sourceScore?.opportunityScore).toBeGreaterThanOrEqual(0);
  });

  it("should fallback to manual content if sourcePostId is missing or null in db", async () => {
    const ctx = await buildGenerationContext({
      accountHandle: "grafikcem",
      actionType: "tweet",
      sourcePostId: "nonexistent",
      sourceContent: "Manual backup content"
    });

    expect(ctx.sourceContent).toBe("Manual backup content");
  });

  it("should throw error if no content is provided at all", async () => {
    await expect(
      buildGenerationContext({
        accountHandle: "grafikcem",
        actionType: "tweet"
      })
    ).rejects.toThrow("No source content or manual idea provided.");
  });

  it("should apply manual pattern override using patternId", async () => {
    const ctx = await buildGenerationContext({
      accountHandle: "grafikcem",
      actionType: "tweet",
      sourceContent: "Let's do this",
      patternId: "p1"
    });

    expect(ctx.relevantPatterns[0].patternName).toBe("Hook Hook");
  });

  it("should apply manual pattern override using patternName", async () => {
    const ctx = await buildGenerationContext({
      accountHandle: "grafikcem",
      actionType: "tweet",
      sourceContent: "Let's do this",
      patternName: "My Custom Pattern"
    });

    expect(ctx.relevantPatterns[0].patternName).toBe("My Custom Pattern");
  });

  it("should correctly compile constraints for different accounts", async () => {
    const ctx = await buildGenerationContext({
      accountHandle: "maskulenkod",
      actionType: "reply",
      sourceContent: "Masculinity"
    });

    expect(ctx.constraints.maxChars).toBe(1200);
  });

  it("should produce a valid fallback context in buildGenerationContextFallback", () => {
    const ctx = buildGenerationContextFallback({
      accountHandle: "grafikcem",
      actionType: "quote",
      sourceContent: "Heuristic data"
    });

    expect(ctx.accountProfile.handle).toBe("grafikcem");
    expect(ctx.actionType).toBe("quote");
    expect(ctx.sourceContent).toBe("Heuristic data");
  });

  it("should resolve source content using resolveSourceContent helper", () => {
    const text = resolveSourceContent({
      accountHandle: "grafikcem",
      actionType: "tweet",
      manualIdea: "My idea"
    });
    expect(text).toBe("My idea");

    expect(() => resolveSourceContent({ accountHandle: "grafikcem", actionType: "tweet" })).toThrow();
  });
});
