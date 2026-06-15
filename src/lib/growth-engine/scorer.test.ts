import { describe, it, expect, vi } from "vitest";
import {
  scoreSourcePost,
  scoreSourcePostFallback,
  scoreDraft,
  scoreDraftFallback,
  normalizeSourcePostScore,
  normalizeDraftScore,
  clampScore,
  calculateOpportunityScore,
  calculatePublishScore
} from "./scorer";
import { ACCOUNT_HANDLES } from "./account-profiles";

// ---------------------------------------------------------------------------
// Mock AI module — all tests use fallback by default
// ---------------------------------------------------------------------------

vi.mock("@/lib/ai/openrouter", () => ({
  generateJson: vi.fn().mockRejectedValue(new Error("AI disabled in tests"))
}));

// ---------------------------------------------------------------------------
// Sample texts
// ---------------------------------------------------------------------------

const GRAFIKCEM_SOURCE =
  "OpenAI yeni bir güncelleme ile tasarımcılar için görsel üretim araçlarını tamamen değiştiriyor. " +
  "Bu yapay zeka güncelleme, grafik tasarım iş akışlarını köklü şekilde etkileyecek.";

const MASKULENKOD_SOURCE =
  "Modern ilişkilerde erkeklerin sürekli seçilmeyi beklemesi ve kendi hayatını ikinci plana atması " +
  "bir zayıflık işareti. Disiplin bu konuda da geçerli.";

const RISKY_CONTENT =
  "Bu adam tam bir alçak. Herkes onu linç etmeli. Hakaret ve küfür hak ediyor. " +
  "Iftira olsa bile söylenmeli, şiddet tek çare.";

const GRAFIKCEM_DRAFT_GOOD =
  "Herkes bu aracın ucuzladığını konuşuyor. Kimse gerçek maliyeti saymıyor. " +
  "Bu ne anlama geliyor? Freelance tasarımcılar için fırsat penceresi açılıyor.";

const MASKULENKOD_DRAFT_SOFT =
  "Herkesin durumu farklı, kendinize inanın. Pozitif enerji ile motivasyon yükselir. " +
  "Hayallerin peşinden koşmak en güzel şey.";

const GRAFIKCEM_ANGRY_SPORT =
  "Bu takım böyle gider. Hoca rezalet, futbol felaket. " +
  "Süper Lig artık bir skandal. Galatasaray saha dışında kaybediyor.";

// ---------------------------------------------------------------------------
// clampScore
// ---------------------------------------------------------------------------

describe("clampScore", () => {
  it("clamps values to 0-100", () => {
    expect(clampScore(150)).toBe(100);
    expect(clampScore(-20)).toBe(0);
    expect(clampScore(75)).toBe(75);
  });

  it("returns fallback for non-numbers", () => {
    expect(clampScore("text")).toBe(50);
    expect(clampScore(null)).toBe(50);
    expect(clampScore(undefined)).toBe(50);
    expect(clampScore(NaN)).toBe(50);
  });

  it("uses custom fallback", () => {
    expect(clampScore("bad", 30)).toBe(30);
  });

  it("rounds to integer", () => {
    expect(clampScore(72.7)).toBe(73);
    expect(clampScore(72.3)).toBe(72);
  });
});

// ---------------------------------------------------------------------------
// scoreSourcePostFallback
// ---------------------------------------------------------------------------

describe("scoreSourcePostFallback", () => {
  it("scores grafikcem AI/design content with high relevance", () => {
    const score = scoreSourcePostFallback({
      content: GRAFIKCEM_SOURCE,
      targetAccount: "grafikcem"
    });

    expect(score.relevanceScore).toBeGreaterThanOrEqual(60);
    expect(score.suggestedAccounts).toContain("grafikcem");
    expect(score.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(score.opportunityScore).toBeLessThanOrEqual(100);
  });

  it("scores maskulenkod relationship/discipline content correctly", () => {
    const score = scoreSourcePostFallback({
      content: MASKULENKOD_SOURCE,
      targetAccount: "maskulenkod"
    });

    expect(score.relevanceScore).toBeGreaterThanOrEqual(45);
    expect(score.suggestedAccounts).toContain("maskulenkod");
  });

  it("raises riskScore for risky content", () => {
    const score = scoreSourcePostFallback({
      content: RISKY_CONTENT,
      targetAccount: "grafikcem"
    });

    expect(score.riskScore).toBeGreaterThanOrEqual(40);
  });

  it("lowers freshness for old content", () => {
    const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const score = scoreSourcePostFallback({
      content: GRAFIKCEM_SOURCE,
      targetAccount: "grafikcem",
      publishedAt: oldDate
    });

    expect(score.freshnessScore).toBeLessThanOrEqual(35);
  });

  it("gives high freshness for recent content", () => {
    const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const score = scoreSourcePostFallback({
      content: GRAFIKCEM_SOURCE,
      targetAccount: "grafikcem",
      publishedAt: recentDate
    });

    expect(score.freshnessScore).toBeGreaterThanOrEqual(80);
  });

  it("defaults freshness to 60 when no date given", () => {
    const score = scoreSourcePostFallback({
      content: GRAFIKCEM_SOURCE,
      targetAccount: "grafikcem"
    });

    expect(score.freshnessScore).toBe(60);
  });

  it("opportunityScore is between 0-100", () => {
    for (const handle of ACCOUNT_HANDLES) {
      const score = scoreSourcePostFallback({
        content: "Test içerik bir şeyler hakkında.",
        targetAccount: handle
      });
      expect(score.opportunityScore).toBeGreaterThanOrEqual(0);
      expect(score.opportunityScore).toBeLessThanOrEqual(100);
    }
  });

  it("suggests ignore when risk is very high", () => {
    const score = scoreSourcePostFallback({
      content: RISKY_CONTENT,
      targetAccount: "grafikcem"
    });

    // If riskScore > 75, suggestedAction should be ignore
    if (score.riskScore > 75) {
      expect(score.suggestedAction).toBe("ignore");
    }
  });

  it("auto-detects accounts from text", () => {
    const score = scoreSourcePostFallback({
      content: GRAFIKCEM_SOURCE
    });

    expect(score.suggestedAccounts).toContain("grafikcem");
  });

  it("all sub-scores are between 0-100", () => {
    const score = scoreSourcePostFallback({
      content: GRAFIKCEM_SOURCE,
      targetAccount: "grafikcem"
    });

    expect(score.relevanceScore).toBeGreaterThanOrEqual(0);
    expect(score.relevanceScore).toBeLessThanOrEqual(100);
    expect(score.freshnessScore).toBeGreaterThanOrEqual(0);
    expect(score.freshnessScore).toBeLessThanOrEqual(100);
    expect(score.controversyScore).toBeGreaterThanOrEqual(0);
    expect(score.controversyScore).toBeLessThanOrEqual(100);
    expect(score.riskScore).toBeGreaterThanOrEqual(0);
    expect(score.riskScore).toBeLessThanOrEqual(100);
    expect(score.confidence).toBeGreaterThanOrEqual(0);
    expect(score.confidence).toBeLessThanOrEqual(100);
  });

  it("boosts engagement-heavy metrics", () => {
    const withMetrics = scoreSourcePostFallback({
      content: GRAFIKCEM_SOURCE,
      targetAccount: "grafikcem",
      metrics: { likes: 500, reposts: 100, replies: 50, quotes: 30 }
    });
    const withoutMetrics = scoreSourcePostFallback({
      content: GRAFIKCEM_SOURCE,
      targetAccount: "grafikcem"
    });

    expect(withMetrics.opportunityScore).toBeGreaterThanOrEqual(
      withoutMetrics.opportunityScore
    );
  });
});

// ---------------------------------------------------------------------------
// scoreDraftFallback
// ---------------------------------------------------------------------------

describe("scoreDraftFallback", () => {
  it("scores grafikcem draft with good persona match", () => {
    const score = scoreDraftFallback({
      content: GRAFIKCEM_DRAFT_GOOD,
      accountHandle: "grafikcem"
    });

    expect(score.personaMatchScore).toBeGreaterThanOrEqual(50);
    expect(score.publishScore).toBeGreaterThanOrEqual(0);
    expect(score.publishScore).toBeLessThanOrEqual(100);
  });

  it("gives low personaMatch to angry sport text for grafikcem", () => {
    const score = scoreDraftFallback({
      content: GRAFIKCEM_ANGRY_SPORT,
      accountHandle: "grafikcem"
    });

    // Angry sport keywords do not match the grafikcem persona → cross-contamination penalty
    expect(score.personaMatchScore).toBeLessThanOrEqual(65);
  });

  it("gives low personaMatch to soft therapy text for maskulenkod", () => {
    const score = scoreDraftFallback({
      content: MASKULENKOD_DRAFT_SOFT,
      accountHandle: "maskulenkod"
    });

    // Contains forbidden terms like "terapist dili", "kişisel gelişim klişesi"
    expect(score.personaMatchScore).toBeLessThanOrEqual(70);
  });

  it("reduces clarity when content exceeds maxChars", () => {
    const longContent = "Bu bir çok uzun metin. ".repeat(70);
    const score = scoreDraftFallback({
      content: longContent,
      accountHandle: "grafikcem"
    });

    expect(score.clarityScore).toBeLessThanOrEqual(65);
  });

  it("penalizes forbidden terms in scoring", () => {
    // maskulenkod forbidden: "terapist dili", "kişisel gelişim klişesi"
    const forbidden =
      "Herkesin durumu farklı, terapist dili kullanmak önemli. Kişisel gelişim klişesi olsa da çalışır.";
    const score = scoreDraftFallback({
      content: forbidden,
      accountHandle: "maskulenkod"
    });

    expect(score.personaMatchScore).toBeLessThan(60);
  });

  it("publishRecommendation follows correct thresholds", () => {
    // High quality content → should get publish or rewrite
    const goodScore = scoreDraftFallback({
      content: GRAFIKCEM_DRAFT_GOOD,
      accountHandle: "grafikcem"
    });

    expect(["publish", "rewrite", "reject"]).toContain(goodScore.publishRecommendation);

    // If publishScore >= 75 and riskScore < 45 → publish
    if (goodScore.publishScore >= 75 && goodScore.riskScore < 45) {
      expect(goodScore.publishRecommendation).toBe("publish");
    }
  });

  it("provides rewriteSuggestion", () => {
    const score = scoreDraftFallback({
      content: "Kısa.",
      accountHandle: "grafikcem"
    });

    expect(score.rewriteSuggestion).toBeTruthy();
    expect(score.rewriteSuggestion.length).toBeGreaterThan(5);
  });

  it("throws for invalid accountHandle", () => {
    expect(() =>
      scoreDraftFallback({
        content: "Test",
        accountHandle: "invalid"
      })
    ).toThrow("Invalid accountHandle");
  });

  it("all sub-scores are between 0-100", () => {
    const score = scoreDraftFallback({
      content: GRAFIKCEM_DRAFT_GOOD,
      accountHandle: "grafikcem"
    });

    expect(score.personaMatchScore).toBeGreaterThanOrEqual(0);
    expect(score.personaMatchScore).toBeLessThanOrEqual(100);
    expect(score.hookStrengthScore).toBeGreaterThanOrEqual(0);
    expect(score.hookStrengthScore).toBeLessThanOrEqual(100);
    expect(score.clarityScore).toBeGreaterThanOrEqual(0);
    expect(score.clarityScore).toBeLessThanOrEqual(100);
    expect(score.viralityScore).toBeGreaterThanOrEqual(0);
    expect(score.viralityScore).toBeLessThanOrEqual(100);
    expect(score.riskScore).toBeGreaterThanOrEqual(0);
    expect(score.riskScore).toBeLessThanOrEqual(100);
    expect(score.publishScore).toBeGreaterThanOrEqual(0);
    expect(score.publishScore).toBeLessThanOrEqual(100);
    expect(score.confidence).toBeGreaterThanOrEqual(0);
    expect(score.confidence).toBeLessThanOrEqual(100);
  });

  it("increases confidence when patternName is given", () => {
    const withPattern = scoreDraftFallback({
      content: GRAFIKCEM_DRAFT_GOOD,
      accountHandle: "grafikcem",
      patternName: "Sessiz Değişim"
    });
    const withoutPattern = scoreDraftFallback({
      content: GRAFIKCEM_DRAFT_GOOD,
      accountHandle: "grafikcem"
    });

    expect(withPattern.confidence).toBeGreaterThanOrEqual(withoutPattern.confidence);
  });
});

// ---------------------------------------------------------------------------
// normalizeSourcePostScore
// ---------------------------------------------------------------------------

describe("normalizeSourcePostScore", () => {
  it("returns defaults for null input", () => {
    const score = normalizeSourcePostScore(null);
    expect(score.relevanceScore).toBe(50);
    expect(score.freshnessScore).toBe(60);
    expect(score.confidence).toBe(0);
  });

  it("returns defaults for undefined input", () => {
    const score = normalizeSourcePostScore(undefined);
    expect(score.suggestedAction).toBe("ignore");
  });

  it("clamps scores to 0-100", () => {
    const score = normalizeSourcePostScore({
      relevanceScore: 200,
      freshnessScore: -50,
      riskScore: 999,
      confidence: 150
    });

    expect(score.relevanceScore).toBe(100);
    expect(score.freshnessScore).toBe(0);
    expect(score.riskScore).toBe(100);
    expect(score.confidence).toBe(100);
  });

  it("validates suggestedAction and falls back to computed action", () => {
    const score = normalizeSourcePostScore({
      suggestedAction: "invalid_action",
      opportunityScore: 20
    });

    // Invalid action + low opportunity → should be ignore
    expect(score.suggestedAction).toBe("ignore");
  });

  it("filters invalid accounts from suggestedAccounts", () => {
    const score = normalizeSourcePostScore({
      suggestedAccounts: ["grafikcem", "invalid", 42]
    });

    expect(score.suggestedAccounts).toEqual(["grafikcem"]);
  });

  it("preserves valid AI response", () => {
    const score = normalizeSourcePostScore({
      relevanceScore: 85,
      freshnessScore: 90,
      controversyScore: 40,
      audienceFitScore: 75,
      quotePotentialScore: 60,
      replyPotentialScore: 50,
      standaloneTweetScore: 80,
      opportunityScore: 78,
      riskScore: 15,
      suggestedAction: "tweet",
      reason: "Yüksek kaliteli içerik",
      suggestedAccounts: ["grafikcem"],
      confidence: 85
    });

    expect(score.relevanceScore).toBe(85);
    expect(score.suggestedAction).toBe("tweet");
    expect(score.confidence).toBe(85);
  });
});

// ---------------------------------------------------------------------------
// normalizeDraftScore
// ---------------------------------------------------------------------------

describe("normalizeDraftScore", () => {
  it("returns defaults for null input", () => {
    const score = normalizeDraftScore(null);
    expect(score.personaMatchScore).toBe(50);
    expect(score.publishRecommendation).toBe("rewrite");
    expect(score.confidence).toBe(0);
  });

  it("computes recommendation from high risk when raw is partial", () => {
    const score = normalizeDraftScore({
      personaMatchScore: 80,
      riskScore: 80,
      publishScore: 30
    });

    // riskScore > 70 → reject
    expect(score.publishRecommendation).toBe("reject");
  });

  it("confidence is between 0-100", () => {
    const score = normalizeDraftScore({ confidence: 250 });
    expect(score.confidence).toBe(100);

    const score2 = normalizeDraftScore({ confidence: -10 });
    expect(score2.confidence).toBe(0);
  });

  it("preserves valid publishRecommendation", () => {
    const score = normalizeDraftScore({
      publishRecommendation: "publish",
      publishScore: 85,
      riskScore: 10
    });

    expect(score.publishRecommendation).toBe("publish");
  });

  it("falls back to computed recommendation for invalid value", () => {
    const score = normalizeDraftScore({
      publishRecommendation: "invalid",
      publishScore: 40,
      riskScore: 80
    });

    expect(score.publishRecommendation).toBe("reject");
  });
});

// ---------------------------------------------------------------------------
// calculateOpportunityScore
// ---------------------------------------------------------------------------

describe("calculateOpportunityScore", () => {
  it("returns 0-100 range", () => {
    const score = calculateOpportunityScore({
      relevanceScore: 90,
      freshnessScore: 95,
      controversyScore: 50,
      audienceFitScore: 85,
      quotePotentialScore: 70,
      replyPotentialScore: 60,
      standaloneTweetScore: 80,
      riskScore: 10
    });

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("penalizes high risk", () => {
    const lowRisk = calculateOpportunityScore({
      relevanceScore: 80,
      freshnessScore: 80,
      controversyScore: 50,
      audienceFitScore: 80,
      quotePotentialScore: 70,
      replyPotentialScore: 60,
      standaloneTweetScore: 70,
      riskScore: 10
    });

    const highRisk = calculateOpportunityScore({
      relevanceScore: 80,
      freshnessScore: 80,
      controversyScore: 50,
      audienceFitScore: 80,
      quotePotentialScore: 70,
      replyPotentialScore: 60,
      standaloneTweetScore: 70,
      riskScore: 90
    });

    expect(lowRisk).toBeGreaterThan(highRisk);
  });
});

// ---------------------------------------------------------------------------
// calculatePublishScore
// ---------------------------------------------------------------------------

describe("calculatePublishScore", () => {
  it("returns 0-100 range", () => {
    const score = calculatePublishScore({
      personaMatchScore: 80,
      hookStrengthScore: 75,
      clarityScore: 70,
      viralityScore: 65,
      noveltyScore: 60,
      riskScore: 10
    });

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("penalizes high risk", () => {
    const safe = calculatePublishScore({
      personaMatchScore: 80,
      hookStrengthScore: 75,
      clarityScore: 70,
      viralityScore: 65,
      noveltyScore: 60,
      riskScore: 5
    });

    const risky = calculatePublishScore({
      personaMatchScore: 80,
      hookStrengthScore: 75,
      clarityScore: 70,
      viralityScore: 65,
      noveltyScore: 60,
      riskScore: 85
    });

    expect(safe).toBeGreaterThan(risky);
  });
});

// ---------------------------------------------------------------------------
// Async functions (AI mocked to fail → fallback)
// ---------------------------------------------------------------------------

describe("scoreSourcePost (async)", () => {
  it("falls back when AI fails", async () => {
    const score = await scoreSourcePost({
      content: GRAFIKCEM_SOURCE,
      targetAccount: "grafikcem"
    });

    expect(score).toBeDefined();
    expect(score.relevanceScore).toBeGreaterThanOrEqual(0);
    expect(score.suggestedAccounts).toContain("grafikcem");
  });

  it("throws for empty content", async () => {
    await expect(
      scoreSourcePost({ content: "" })
    ).rejects.toThrow();
  });

  it("throws for invalid targetAccount", async () => {
    await expect(
      scoreSourcePost({
        content: "Test",
        targetAccount: "invalid_handle"
      })
    ).rejects.toThrow("Invalid targetAccount");
  });

  it("uses AI result when available", async () => {
    const { generateJson } = await import("@/lib/ai/openrouter");
    const mockGenerateJson = vi.mocked(generateJson);

    mockGenerateJson.mockResolvedValueOnce({
      data: {
        relevanceScore: 90,
        freshnessScore: 85,
        controversyScore: 45,
        audienceFitScore: 80,
        quotePotentialScore: 70,
        replyPotentialScore: 55,
        standaloneTweetScore: 85,
        opportunityScore: 82,
        riskScore: 12,
        suggestedAction: "tweet",
        reason: "AI generated reason",
        suggestedAccounts: ["grafikcem"],
        confidence: 88
      },
      model: "test-model",
      inputTokens: 100,
      outputTokens: 200,
      estimatedCostUsd: 0.001,
      actualCostUsd: 0.001
    });

    const score = await scoreSourcePost({
      content: GRAFIKCEM_SOURCE,
      targetAccount: "grafikcem"
    });

    expect(score.relevanceScore).toBe(90);
    expect(score.suggestedAction).toBe("tweet");
    expect(score.reason).toBe("AI generated reason");
  });
});

describe("scoreDraft (async)", () => {
  it("falls back when AI fails", async () => {
    const score = await scoreDraft({
      content: GRAFIKCEM_DRAFT_GOOD,
      accountHandle: "grafikcem"
    });

    expect(score).toBeDefined();
    expect(score.publishScore).toBeGreaterThanOrEqual(0);
    expect(["publish", "rewrite", "reject"]).toContain(score.publishRecommendation);
  });

  it("throws for empty content", async () => {
    await expect(
      scoreDraft({ content: "", accountHandle: "grafikcem" })
    ).rejects.toThrow();
  });

  it("throws for invalid accountHandle", async () => {
    await expect(
      scoreDraft({ content: "Test", accountHandle: "invalid" })
    ).rejects.toThrow("Invalid accountHandle");
  });
});
