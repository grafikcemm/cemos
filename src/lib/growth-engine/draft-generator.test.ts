import { describe, it, expect, vi } from "vitest";
import {
  generateDrafts,
  generateDraftsFallback,
  normalizeDraftVariants,
  buildDraftGenerationPrompt
} from "./draft-generator";

vi.mock("../db/sourcePostRepo", () => ({
  sourcePostRepo: {
    findById: vi.fn(() => Promise.resolve(null))
  }
}));

vi.mock("../db/viralPatternRepo", () => ({
  viralPatternRepo: {
    listByAccount: vi.fn(() => Promise.resolve([])),
    findById: vi.fn(() => Promise.resolve(null))
  }
}));

vi.mock("../db/accountRepo", () => ({
  accountRepo: {
    findByHandle: vi.fn((handle: string) => Promise.resolve({ id: `acc-${handle}`, handle }))
  }
}));

describe("Draft Generator Suite", () => {
  it("should assemble a complete draft generation prompt with constraints", () => {
    const context = {
      accountProfile: {
        handle: "grafikcem",
        persona: "Bilge Editör",
        description: "AI news branding freelance"
      },
      actionType: "tweet",
      sourceContent: "Bazı ilginç yapay zeka haberleri burda.",
      modeId: "ai_news",
      relevantPatterns: [
        { patternName: "My Pattern", structureJson: "{}", exampleGood: "Hook example" }
      ],
      constraints: {
        maxChars: 280,
        forbidden: ["clickbait", "panik"],
        tone: "net ve sade",
        language: "Turkish"
      }
    } as any;

    const prompt = buildDraftGenerationPrompt(context);
    expect(prompt.system).toContain("@grafikcem");
    expect(prompt.system).toContain("Bilge Editör");
    expect(prompt.system).toContain("clickbait");
    expect(prompt.system).toContain("280");
    expect(prompt.user).toContain("Bazı ilginç yapay zeka haberleri burda.");
  });

  it("should successfully generate fallback drafts for grafikcem tweet", () => {
    const context = {
      accountProfile: { handle: "grafikcem" },
      actionType: "tweet",
      sourceContent: "Source"
    } as any;

    const drafts = generateDraftsFallback(context, 3);
    expect(drafts.length).toBe(3);
    expect(drafts[0].angle).toBe("safe");
    expect(drafts[0].content).toContain("faturada");
    expect(drafts[1].angle).toBe("strong");
    expect(drafts[1].content).toContain("→");
    expect(drafts[2].angle).toBe("provocative");
  });

  it("should generate fallback drafts for maskulenkod", () => {
    const context = {
      accountProfile: { handle: "maskulenkod" },
      actionType: "tweet",
      sourceContent: "Source"
    } as any;

    const drafts = generateDraftsFallback(context, 3);
    expect(drafts.length).toBe(3);
    expect(drafts[0].content.toLowerCase()).toContain("disiplin");
    expect(drafts[1].content.toLowerCase()).toContain("zihniyet");
  });

  it("should normalize raw draft response reliably inside normalizeDraftVariants", () => {
    const raw = {
      drafts: [
        { content: "Draft content safe", angle: "safe", reasoning: "Ok" },
        { content: "Draft content strong", angle: "invalid-angle", reasoning: "Ok" }
      ]
    };

    const context = {
      accountProfile: { handle: "grafikcem" },
      actionType: "tweet"
    } as any;

    const drafts = normalizeDraftVariants(raw, context);
    expect(drafts.length).toBe(2);
    expect(drafts[0].content).toBe("Draft content safe");
    expect(drafts[0].angle).toBe("safe");
    expect(drafts[1].angle).toBe("strong"); // fallback to i=1 strong
  });

  it("should successfully run end-to-end generateDrafts returning candidates", async () => {
    const result = await generateDrafts({
      accountHandle: "grafikcem",
      actionType: "tweet",
      sourceContent: "Manual creative idea input"
    });

    expect(result.success).toBe(true);
    expect(result.context).toBeDefined();
    expect(result.drafts.length).toBeGreaterThan(0);
    expect(result.drafts[0].draft).toBeDefined();
    expect(result.drafts[0].critic).toBeDefined();
    expect(result.drafts[0].critic.personaMatchScore).toBeGreaterThanOrEqual(0);
  });

  // Additional 5 tests

  it("should handle custom counts in fallback generation", () => {
    const context = {
      accountProfile: { handle: "grafikcem" },
      actionType: "tweet",
      sourceContent: "Source"
    } as any;

    const drafts = generateDraftsFallback(context, 1);
    expect(drafts.length).toBe(1);
  });

  it("should generate correct replies fallback for maskulenkod", () => {
    const context = {
      accountProfile: { handle: "maskulenkod" },
      actionType: "reply",
      sourceContent: "Source"
    } as any;

    const drafts = generateDraftsFallback(context, 3);
    expect(drafts.length).toBe(3);
    expect(drafts[0].content.toLowerCase()).toContain("disiplin");
  });

  it("should handle null or invalid drafts list in normalizer", () => {
    const context = {
      accountProfile: { handle: "grafikcem" },
      actionType: "tweet"
    } as any;

    const drafts = normalizeDraftVariants(null, context);
    expect(drafts.length).toBe(0);
  });

  it("should generate drafts using custom manualIdea", async () => {
    const result = await generateDrafts({
      accountHandle: "grafikcem",
      actionType: "tweet",
      manualIdea: "My manual idea contents"
    });
    expect(result.success).toBe(true);
    expect(result.context.sourceContent).toBe("My manual idea contents");
  });
});
