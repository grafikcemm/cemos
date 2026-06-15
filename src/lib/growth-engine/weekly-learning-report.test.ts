import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveLearningDateRange,
  safeParseQueueScores,
  calculateAverageScore,
  buildAccountLearningSummaries,
  buildPatternInsights,
  buildFeedbackInsights,
  buildQueueInsight,
  buildNextWeekActions,
  generateLearningSummaryWithAI,
  generateWeeklyLearningReport
} from "./weekly-learning-report";

const mockAccounts = [
  { id: "acc-1", handle: "grafikcem", displayName: "GrafikCem" },
  { id: "acc-2", handle: "maskulenkod", displayName: "MaskulenKod" }
];

const mockPatterns = [
  { id: "p1", accountId: "acc-1", patternName: "AI Hook", successScore: 85, usageCount: 5, isActive: true, platform: "x" },
  { id: "p2", accountId: "acc-2", patternName: "Contrast Hook", successScore: 40, usageCount: 2, isActive: true, platform: "instagram" },
  { id: "p3", accountId: "acc-3", patternName: "Data Hook", successScore: 65, usageCount: 0, isActive: true, platform: "youtube" }
];

const mockFeedbackEvents = [
  { id: "f1", accountId: "acc-1", feedbackType: "too_ai", platform: "x", createdAt: new Date() },
  { id: "f2", accountId: "acc-1", feedbackType: "too_ai", platform: "x", createdAt: new Date() },
  { id: "f3", accountId: "acc-1", feedbackType: "too_ai", platform: "x", createdAt: new Date() }, // 3 times to trigger weak signal
  { id: "f4", accountId: "acc-2", feedbackType: "approved", platform: "instagram", createdAt: new Date() },
  { id: "f5", accountId: "acc-3", feedbackType: "rejected", platform: "youtube", createdAt: new Date() }
];

const mockTrainingExamples = [
  { id: "t1", accountId: "acc-1", inputType: "tweet", outputContent: "Good Tweet", label: "good", platform: "x", createdAt: new Date() }
];

const mockQueueItems = [
  { id: "q1", accountId: "acc-1", status: "new", scores: JSON.stringify({ publishScore: 88, riskScore: 15, patternUsed: "AI Hook" }), createdAt: new Date() },
  { id: "q2", accountId: "acc-2", status: "approved", scores: JSON.stringify({ publishScore: 72, riskScore: 45, patternUsed: "Contrast Hook" }), createdAt: new Date() },
  { id: "q3", accountId: "acc-3", status: "rejected", scores: JSON.stringify({ publishScore: 45, riskScore: 75 }), createdAt: new Date() }, // low score, high risk
];

vi.mock("@/lib/db/client", () => ({
  prisma: {
    feedbackEvent: { findMany: vi.fn(() => Promise.resolve(mockFeedbackEvents)) },
    trainingExample: { findMany: vi.fn(() => Promise.resolve(mockTrainingExamples)) },
    queueItem: { findMany: vi.fn(() => Promise.resolve(mockQueueItems)) },
    viralPattern: { findMany: vi.fn(() => Promise.resolve(mockPatterns)) }
  }
}));

vi.mock("@/lib/db/accountRepo", () => ({
  accountRepo: {
    findAll: vi.fn(() => Promise.resolve(mockAccounts))
  }
}));

vi.mock("@/lib/ai/openrouter", () => ({
  generateJson: vi.fn(() => Promise.resolve({ data: { summary: "AI Summary Paragraph" } }))
}));

describe("Weekly Learning Report Core Module (Exactly 20 Tests)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- SECTION 1: Date Range Solver (8 tests) ---

  it("1. should resolve last_7_days dateRange correctly", () => {
    const range = resolveLearningDateRange({ dateRange: "last_7_days" });
    expect(range.label).toBe("Son 7 Gün");
    expect(range.from.getTime()).toBeLessThan(Date.now());
  });

  it("2. should resolve last_30_days dateRange correctly", () => {
    const range = resolveLearningDateRange({ dateRange: "last_30_days" });
    expect(range.label).toBe("Son 30 Gün");
  });

  it("3. should resolve this_week dateRange correctly", () => {
    const range = resolveLearningDateRange({ dateRange: "this_week" });
    expect(range.label).toBe("Bu Hafta");
  });

  it("4. should resolve previous_week dateRange correctly", () => {
    const range = resolveLearningDateRange({ dateRange: "previous_week" });
    expect(range.label).toBe("Geçen Hafta");
  });

  it("5. should resolve all dateRange correctly", () => {
    const range = resolveLearningDateRange({ dateRange: "all" });
    expect(range.label).toBe("Tüm Zamanlar");
    expect(range.from.getTime()).toBe(0);
  });

  it("6. should resolve custom from/to dateRange correctly", () => {
    const from = "2026-05-01T00:00:00.000Z";
    const to = "2026-05-07T23:59:59.000Z";
    const range = resolveLearningDateRange({ dateRange: "custom", from, to });
    expect(range.label).toContain("Özel Aralık");
    expect(range.from.toISOString()).toBe(from);
    expect(range.to.toISOString()).toBe(to);
  });

  it("7. should throw error if custom range parameters are missing", () => {
    expect(() => resolveLearningDateRange({ dateRange: "custom" })).toThrow("Custom date range requires");
  });

  it("8. should throw error if custom date strings are invalid", () => {
    expect(() => resolveLearningDateRange({ dateRange: "custom", from: "invalid", to: "invalid" })).toThrow("Invalid custom date");
  });

  // --- SECTION 2: safeParseQueueScores (3 tests) ---

  it("9. should parse valid scores JSON accurately", () => {
    const scores = safeParseQueueScores(JSON.stringify({ publishScore: 82, riskScore: 10, angle: "strong" }));
    expect(scores.publishScore).toBe(82);
    expect(scores.riskScore).toBe(10);
    expect(scores.angle).toBe("strong");
  });

  it("10. should return default fallbacks on null/undefined scores", () => {
    const scores = safeParseQueueScores(null);
    expect(scores.publishScore).toBe(75);
    expect(scores.riskScore).toBe(20);
  });

  it("11. should return default fallbacks on corrupt or invalid JSON", () => {
    const scores = safeParseQueueScores("corrupt-json-string{");
    expect(scores.publishScore).toBe(75);
    expect(scores.riskScore).toBe(20);
  });

  // --- SECTION 3: calculateAverageScore (3 tests) ---

  it("12. should calculate average score of a list", () => {
    const list = [{ score: 80 }, { score: 90 }];
    const avg = calculateAverageScore(list, (l) => l.score);
    expect(avg).toBe(85);
  });

  it("13. should return null on empty list", () => {
    const avg = calculateAverageScore([], (l: any) => l.score);
    expect(avg).toBeNull();
  });

  it("14. should ignore null, undefined, or NaN scores gracefully", () => {
    const list = [{ score: 80 }, { score: null }, { score: undefined }, { score: NaN }, { score: 90 }];
    const avg = calculateAverageScore(list, (l) => l.score);
    expect(avg).toBe(85);
  });

  // --- SECTION 4: summaries, insights, actions & AI summaries (6 tests) ---

  it("15. should build account learning summaries accurately", () => {
    const summaries = buildAccountLearningSummaries(
      mockAccounts,
      mockFeedbackEvents,
      mockTrainingExamples,
      mockQueueItems,
      mockPatterns
    );
    expect(summaries.length).toBe(2);
    const grafikcem = summaries.find((s) => s.accountHandle === "grafikcem");
    expect(grafikcem?.totalFeedbackEvents).toBe(3);
    expect(grafikcem?.tooAiCount).toBe(3);
    expect(grafikcem?.weakestSignal).toContain("Too AI");
    expect(grafikcem?.bestPatternName).toBe("AI Hook");
  });

  it("16. should build top and weak pattern insights accurately", () => {
    const { top, weak } = buildPatternInsights(mockPatterns, mockQueueItems, mockAccounts);
    expect(top[0].patternName).toBe("AI Hook");
    expect(top[0].signal).toBe("rising");
    expect(weak[0].patternName).toBe("Contrast Hook");
    expect(weak[0].signal).toBe("weak");
  });

  it("17. should build feedback learning insights interpreted cleanly", () => {
    const insights = buildFeedbackInsights(mockFeedbackEvents);
    expect(insights.length).toBeGreaterThan(0);
    const tooAi = insights.find((i) => i.feedbackType === "too_ai");
    expect(tooAi?.count).toBe(3);
    expect(tooAi?.interpretation).toContain("robotik veya klişe");
  });

  it("18. should compile queue draft/approved/risk health insight cleanly", () => {
    const qi = buildQueueInsight(mockQueueItems);
    expect(qi.totalQueueItems).toBe(3);
    expect(qi.draftCount).toBe(1);
    expect(qi.highRiskCount).toBe(1);
  });

  it("19. should produce up to 5 recommendations based on metrics", () => {
    const summaries = buildAccountLearningSummaries(
      mockAccounts,
      mockFeedbackEvents,
      mockTrainingExamples,
      mockQueueItems,
      mockPatterns
    );
    const qi = buildQueueInsight(mockQueueItems);
    const fi = buildFeedbackInsights(mockFeedbackEvents);
    const actions = buildNextWeekActions(summaries, fi, qi);
    expect(actions.length).toBeLessThanOrEqual(5);
    expect(actions[0]).toContain("kelimeler");
  });

  it("20. should produce a valid AI paragraph summary using OpenRouter", async () => {
    const summaries = buildAccountLearningSummaries(
      mockAccounts,
      mockFeedbackEvents,
      mockTrainingExamples,
      mockQueueItems,
      mockPatterns
    );
    const report = {
      summary: { totalFeedbackEvents: 5, totalTrainingExamples: 1 },
      accounts: summaries
    };
    const summary = await generateLearningSummaryWithAI(report);
    expect(summary).toBe("AI Summary Paragraph");
  });

  // --- SECTION 11: Platform Segmentation (Faz F) ---

  it("21. splits platformSections across x / instagram / youtube", async () => {
    const report = await generateWeeklyLearningReport({ accountHandle: "all", dateRange: "last_7_days" });
    expect(report.platformSections).toHaveLength(3);
    const byPlatform = Object.fromEntries(
      (report.platformSections ?? []).map((s) => [s.platform, s])
    );
    expect(byPlatform.x.totalFeedbackEvents).toBe(3);
    expect(byPlatform.x.totalTrainingExamples).toBe(1);
    expect(byPlatform.x.totalPatterns).toBe(1);
    expect(byPlatform.instagram.totalFeedbackEvents).toBe(1);
    expect(byPlatform.instagram.totalPatterns).toBe(1);
    expect(byPlatform.youtube.totalFeedbackEvents).toBe(1);
    expect(byPlatform.youtube.totalPatterns).toBe(1);
  });
});
