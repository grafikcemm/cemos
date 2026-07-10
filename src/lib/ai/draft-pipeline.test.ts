import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runDraftPipeline } from "./draft-pipeline";
import { generateJsonGated } from "./generateGated";
import { accountProfiles } from "@/lib/accounts";

// Mock the gated generation layer completely to prevent network/DB requests
// (dalga-1 migration: pipeline artık generateJsonGated + preset kullanır).
vi.mock("./generateGated", () => ({
  generateJsonGated: vi.fn(),
}));

describe("runDraftPipeline smoke test under operator_quality", () => {
  const originalEnv = { ...process.env };

  const mockProfile = accountProfiles.grafikcem;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.OPENROUTER_API_KEY = "mock-key";
    
    // Squelch warnings/logs in tests
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("runs the final editor only when explicitly enabled", async () => {
    delete process.env.MODEL_PROFILE;
    process.env.ENABLE_FINAL_EDITOR = "true";

    const mockWriterResponse = {
      model: "google/gemini-2.5-flash",
      data: {
        drafts: [
          { content: "Taslak 1: Tasarım tüyoları harika.", mode: "expert", angle: "tip" },
          { content: "Taslak 2: Renk paletleri çok önemli.", mode: "expert", angle: "creative" },
        ],
      },
      estimatedCostUsd: 0.001,
      modelFallbackUsed: false,
    };

    const mockJudgeResponse = {
      model: "google/gemini-2.5-pro",
      data: {
        rankedCandidates: [
          {
            content: "Taslak 1: Tasarım tüyoları harika.",
            mode: "expert",
            angle: "tip",
            hookStrength: 85,
            viralPotential: 80,
            accountFit: 90,
            turkishNaturalness: 88,
            noveltyScore: 75,
            risk: 10,
            sourceFaithfulness: 95,
            verdict: "approve",
            reason: "Çok dengeli.",
          },
        ],
        winnerIndex: 0,
        publishDecision: "queue",
      },
      estimatedCostUsd: 0.002,
      modelFallbackUsed: false,
    };

    const mockEditorResponse = {
      model: "google/gemini-2.5-flash",
      data: {
        content: "Cilalanmış Taslak 1: Tasarım tüyoları harika!",
      },
      estimatedCostUsd: 0.0005,
      modelFallbackUsed: false,
    };

    // Make generateJson mock return custom values sequentially
    const mockGenerateJson = generateJsonGated as any;
    mockGenerateJson
      .mockResolvedValueOnce(mockWriterResponse)  // writer call
      .mockResolvedValueOnce(mockJudgeResponse)   // judge call
      .mockResolvedValueOnce(mockEditorResponse); // editor call

    const result = await runDraftPipeline(mockProfile, "Tasarım tüyoları girdisi");

    expect(result.account).toBe("grafikcem");
    // Verify that the final editor was triggered and returned the expected polished content
    expect(result.winner.content).toBe("Cilalanmış Taslak 1: Tasarım tüyoları harika!");
    expect(result.modelUsed.writer).toBe("google/gemini-2.5-flash");
    expect(result.modelUsed.judge).toBe("google/gemini-2.5-pro");
    expect(result.modelUsed.finalEditor).toBe("google/gemini-2.5-flash");
    expect(result.timings!.finalEditorMs).toBeGreaterThanOrEqual(0);
    expect(mockGenerateJson).toHaveBeenCalledTimes(3);
  });

  it("does not spend on the final editor by default", async () => {
    delete process.env.MODEL_PROFILE;
    delete process.env.ENABLE_FINAL_EDITOR;

    const mockWriterResponse = {
      model: "google/gemini-2.5-flash",
      data: {
        drafts: [{ content: "Taslak 1: Tasarım tüyoları.", mode: "expert", angle: "tip" }],
      },
      estimatedCostUsd: 0.001,
      modelFallbackUsed: false,
    };

    const mockJudgeResponse = {
      model: "google/gemini-2.5-pro",
      data: {
        rankedCandidates: [
          {
            content: "Taslak 1: Tasarım tüyoları.",
            mode: "expert",
            angle: "tip",
            hookStrength: 80,
            viralPotential: 75,
            accountFit: 85,
            turkishNaturalness: 80,
            noveltyScore: 70,
            risk: 15,
            sourceFaithfulness: 90,
            verdict: "approve",
            reason: "Dengeli.",
          },
        ],
        winnerIndex: 0,
        publishDecision: "queue",
      },
      estimatedCostUsd: 0.002,
      modelFallbackUsed: false,
    };

    const mockGenerateJson = generateJsonGated as any;
    mockGenerateJson
      .mockResolvedValueOnce(mockWriterResponse) // writer call
      .mockResolvedValueOnce(mockJudgeResponse);  // judge call

    const result = await runDraftPipeline(mockProfile, "Tasarım tüyoları girdisi");

    expect(result.winner.content).toBe("Taslak 1: Tasarım tüyoları.");
    expect(result.modelUsed.finalEditor).toBe("none");
    expect(mockGenerateJson).toHaveBeenCalledTimes(2);
  });
});
