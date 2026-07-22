import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateDrafts,
  generateDraftsFallback,
  normalizeDraftVariants,
  buildDraftGenerationPrompt
} from "./draft-generator";
import { generateJsonGated } from "@/lib/ai/generateGated";
import { critiqueDrafts } from "./draft-critic";

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

// Closure D: writer + critic mocked so the e2e path exercises real
// (mocked-success) generation and its HONEST failure modes — never the removed
// canned marketing fallback. buildGenerationContext does not call the LLM, so a
// single writer `...Once` maps to the writer call.
vi.mock("@/lib/ai/generateGated", () => ({ generateJsonGated: vi.fn() }));
vi.mock("./draft-critic", () => ({ critiqueDrafts: vi.fn() }));

const aiWriterOk = {
  data: {
    drafts: [
      { content: "Gercek uretilmis taslak 1", angle: "safe", reasoning: "r1" },
      { content: "Gercek uretilmis taslak 2", angle: "strong", reasoning: "r2" },
      { content: "Gercek uretilmis taslak 3", angle: "provocative", reasoning: "r3" },
    ],
  },
  model: "test/model",
  inputTokens: 10,
  outputTokens: 20,
  estimatedCostUsd: 0.001,
  actualCostUsd: 0.002,
};

beforeEach(() => {
  vi.clearAllMocks();
});

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

  it("AI başarısında GERÇEK taslakları döndürür (canned fallback DEĞİL)", async () => {
    vi.mocked(generateJsonGated).mockResolvedValueOnce(aiWriterOk as never);
    vi.mocked(critiqueDrafts).mockImplementationOnce(async (drafts) =>
      (drafts as { id: string }[]).map((draft) => ({
        draft,
        critic: { publishRecommendation: "publish", publishScore: 80, reason: "ok" },
      })) as never,
    );

    const result = await generateDrafts({
      accountHandle: "grafikcem",
      actionType: "tweet",
      sourceContent: "Manual creative idea input",
    });

    expect(result.success).toBe(true);
    expect(result.drafts.length).toBe(3);
    expect(result.drafts[0].draft.content).toContain("Gercek uretilmis");
    // No canned marketing copy leaked from the removed fallback.
    for (const d of result.drafts) {
      expect(d.draft.content).not.toContain("faturada");
      expect(d.draft.content.toLowerCase()).not.toContain("disiplin");
    }
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

  it("manualIdea ile context kurar (AI mock başarı)", async () => {
    vi.mocked(generateJsonGated).mockResolvedValueOnce(aiWriterOk as never);
    vi.mocked(critiqueDrafts).mockImplementationOnce(async (drafts) =>
      (drafts as { id: string }[]).map((draft) => ({ draft, critic: { publishRecommendation: "publish" } })) as never,
    );

    const result = await generateDrafts({
      accountHandle: "grafikcem",
      actionType: "tweet",
      manualIdea: "My manual idea contents",
    });
    expect(result.success).toBe(true);
    expect(result.context.sourceContent).toBe("My manual idea contents");
  });

  it("closure D: writer başarısızsa canned metin DÖNMEZ, hata fırlatır", async () => {
    vi.mocked(generateJsonGated).mockRejectedValueOnce(new Error("OpenRouter error 402: credit"));

    await expect(
      generateDrafts({ accountHandle: "grafikcem", actionType: "tweet", sourceContent: "Kaynak" }),
    ).rejects.toThrow(/402|credit|OpenRouter/i);
    // Critic is never reached because the writer threw first — no canned content.
    expect(critiqueDrafts).not.toHaveBeenCalled();
  });

  it("closure D: kritik başarısızsa sahte 'publish' değil dürüst 'rewrite' verdisi", async () => {
    vi.mocked(generateJsonGated).mockResolvedValueOnce(aiWriterOk as never);
    vi.mocked(critiqueDrafts).mockRejectedValueOnce(new Error("critic down"));

    const result = await generateDrafts({
      accountHandle: "grafikcem",
      actionType: "tweet",
      sourceContent: "Kaynak",
    });

    expect(result.success).toBe(true);
    expect(result.drafts.length).toBe(3);
    for (const d of result.drafts) {
      expect(d.critic.publishRecommendation).toBe("rewrite");
      expect(d.critic.publishScore).toBe(0);
      expect((d.critic as { degraded?: boolean }).degraded).toBe(true);
    }
  });
});
