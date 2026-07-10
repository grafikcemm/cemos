 
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database/external dependencies
vi.mock("@/lib/ai/openrouter", () => ({
  generateJson: vi.fn(),
  estimateGenerateJsonCeiling: vi.fn(() => 0.01),
}));

vi.mock("@/lib/db/accountRepo", () => ({
  accountRepo: { findByHandle: vi.fn() },
}));

vi.mock("@/lib/db/queueRepo", () => ({
  queueRepo: { create: vi.fn(), findById: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/db/generationRunRepo", () => ({
  generationRunRepo: { create: vi.fn() },
}));

vi.mock("@/lib/services/usageService", () => ({
  usageService: {
    recordGeneration: vi.fn(),
    recordOpenRouter: vi.fn(),
    getMonthlyCost: vi.fn().mockResolvedValue(0),
    getMonthlyOpenRouterCost: vi.fn().mockResolvedValue(0),
    getMonthlySpendByBudgetClass: vi.fn().mockResolvedValue(0),
    getTodayCost: vi.fn().mockResolvedValue(0),
  },
}));

// generateJsonGated now wraps generateJson with a budget gate; keep the gate open
// in this unit test so the LLM judge path runs (budget logic covered elsewhere).
vi.mock("@/lib/config/costGate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/costGate")>(
    "@/lib/config/costGate",
  );
  return {
    ...actual,
    assertGenerationAllowed: vi.fn(),
    getBudgetStatus: vi.fn(async () => ({
      allowed: true,
      spentUsd: 0,
      limitUsd: 10,
      remainingUsd: 10,
    })),
  };
});

vi.mock("@/lib/ai/draft-pipeline", () => ({
  runDraftPipeline: vi.fn(),
}));

import { qualityLintService } from "./qualityLintService";
import { generateJson } from "@/lib/ai/openrouter";
import { draftService } from "./draftService";
import { runDraftPipeline } from "@/lib/ai/draft-pipeline";
import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";

describe("qualityLintService & draftService Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test_key";
    process.env.MOCK_BENCHMARK = "false";
    process.env.ENABLE_LLM_LINT = "true";
  });

  it("should return passed report when text is clean and LLM does not find blockers", async () => {
    vi.mocked(generateJson).mockResolvedValue({
      data: { blockers: [], warnings: [], cleanedText: null },
      model: "test-model",
      inputTokens: 10,
      outputTokens: 10,
      estimatedCostUsd: 0.0001,
    } as any);

    const report = await qualityLintService.lint("Bu tamamen temiz ve kurallara uygun bir X taslağıdır.", "TWEET");
    expect(report.passed).toBe(true);
    expect(report.blockers.length).toBe(0);
  });

  it("should apply cleanedText when it is returned and passes heuristics", async () => {
    vi.mocked(generateJson).mockResolvedValue({
      data: { blockers: [], warnings: [], cleanedText: "Düzeltilmiş ve temiz bir X taslağı." },
      model: "test-model",
      inputTokens: 10,
      outputTokens: 10,
      estimatedCostUsd: 0.0001,
    } as any);

    const report = await qualityLintService.lint("Düzeltilmemis ama temiz bir X taslağı.", "TWEET");
    expect(report.passed).toBe(true);
    expect(report.cleanedText).toBe("Düzeltilmiş ve temiz bir X taslağı.");
  });

  it("should fail LLM check and append warning if LLM judge fails", async () => {
    vi.mocked(generateJson).mockRejectedValue(new Error("Network error"));

    const report = await qualityLintService.lint("Normal bir taslak metni.", "TWEET");
    expect(report.passed).toBe(true); // Deterministic passed, so still passed
    expect(report.warnings.some((w) => w.includes("LLM Judge kontrolü yapılamadı"))).toBe(true);
  });

  it("should persist lintReport and apply cleanedText in draftService", async () => {
    const mockAccount = { id: "acc_001", handle: "grafikcem", maxChars: 280, persona: "x", concept: "y" };
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(mockAccount as any);

    vi.mocked(runDraftPipeline).mockResolvedValue({
      winner: { content: "Ham üretilmiş taslak metni", scores: {} },
      estimatedCostUsd: 0.001,
      usedMock: false,
      modelUsed: "claude-haiku",
    } as any);

    vi.mocked(generateJson).mockResolvedValue({
      data: { blockers: [], warnings: [], cleanedText: "Temizlenmiş taslak metni." },
      model: "test-model",
      inputTokens: 10,
      outputTokens: 10,
      estimatedCostUsd: 0.0001,
    } as any);

    vi.mocked(queueRepo.create).mockResolvedValue({
      id: "qi_001",
      content: "Temizlenmiş taslak metni.",
      status: "new",
      lintReport: "{}",
    } as any);

    const result = await draftService.generateDraft({
      accountHandle: "grafikcem",
      sourceTweet: "Kaynak tweet",
      draftType: "TWEET",
    });

    expect(result.generated).toBe("Temizlenmiş taslak metni.");
    expect(queueRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Temizlenmiş taslak metni.",
        lintReport: expect.any(String),
      })
    );
  });

  it("should not create queueItem if lintReport fails (passed=false) in draftService", async () => {
    const mockAccount = { id: "acc_001", handle: "grafikcem", maxChars: 280, persona: "x", concept: "y" };
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(mockAccount as any);

    vi.mocked(runDraftPipeline).mockResolvedValue({
      winner: { content: "Ham yarım cümle sonu,", scores: {} }, // deterministic blocker
      estimatedCostUsd: 0.001,
      usedMock: false,
      modelUsed: "claude-haiku",
    } as any);

    const result = await draftService.generateDraft({
      accountHandle: "grafikcem",
      sourceTweet: "Kaynak tweet",
      draftType: "TWEET",
    });

    expect(result.queueItem).toBeUndefined();
  });
});
