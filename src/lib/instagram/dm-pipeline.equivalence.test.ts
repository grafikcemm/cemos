import { describe, it, expect, vi, beforeEach } from "vitest";

// Proves the runner instrumentation kept generateDmVariants byte-identical:
// generateJson is still called with the SAME payload, and a trace is emitted.
// Dalga 2: çağrı gated sarmalayıcıdan geçer — getMonthlyCost mock'u bütçe
// kapısını açık tutar; UsageLog yazımı gated içindeki recordOpenRouter'dır.
vi.mock("@/lib/ai/openrouter", () => ({
  generateJson: vi.fn(),
  estimateGenerateJsonCeiling: vi.fn(() => 0.01),
}));
vi.mock("@/lib/ai/openrouter-key-status", () => ({
  getOpenRouterKeyStatus: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/db/pipelineTraceRepo", () => ({
  pipelineTraceRepo: { create: vi.fn(() => Promise.resolve({ id: "pt" })) },
}));
vi.mock("@/lib/services/usageService", () => ({
  usageService: {
    recordOpenRouter: vi.fn(() => Promise.resolve()),
    getMonthlyCost: vi.fn(() => Promise.resolve(0)),
    getMonthlyOpenRouterCost: vi.fn(() => Promise.resolve(0)),
    getMonthlySpendByBudgetClass: vi.fn(() => Promise.resolve(0)),
  },
}));
// generateJsonGated reserves atomically before spending; mock the reservation so
// this unit test needs no DB (reserveAiSpend fails CLOSED on the unset test
// DATABASE_URL otherwise). Budget/reservation logic is covered by its own tests.
vi.mock("@/lib/services/aiSpendReservationService", () => ({
  reserveAiSpend: vi.fn(async () => ({ id: "res-test" })),
  settleAiSpend: vi.fn(),
  releaseAiSpend: vi.fn(),
}));

import { generateJson } from "@/lib/ai/openrouter";
import { pipelineTraceRepo } from "@/lib/db/pipelineTraceRepo";
import { usageService } from "@/lib/services/usageService";
import { generateDmVariants } from "@/lib/instagram/dm-pipeline";
import { IG_DM_DRAFT_PURPOSE } from "@/lib/instagram/igConfig";

function mkResult(data: unknown, model = "m", cost = 0.02) {
  return { data, model, actualCostUsd: cost, estimatedCostUsd: cost, inputTokens: 1, outputTokens: 1 };
}

const INPUT = {
  rollingSummary: "Kullanıcı fiyat sordu.",
  recentMessages: [{ fromMe: false, text: "fiyat?", trText: "fiyat?" }],
  lang: "tr",
};

describe("generateDmVariants — runner instrumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateJson).mockResolvedValue(mkResult({ variants: [] }) as never);
  });

  it("calls generateJson with the original creativeWriter payload", async () => {
    await generateDmVariants({ ...INPUT, conversationId: "conv-1" });
    expect(generateJson).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(generateJson).mock.calls[0][0];
    expect(arg.role).toBe("creativeWriter");
    expect(arg.temperature).toBe(0.8);
    expect(typeof arg.system).toBe("string");
    expect(typeof arg.user).toBe("string");
    expect(usageService.recordOpenRouter).toHaveBeenCalledTimes(1);
  });

  it("writes a single-stage pipeline trace when a conversationId is supplied", async () => {
    await generateDmVariants({ ...INPUT, conversationId: "conv-1" });
    expect(pipelineTraceRepo.create).toHaveBeenCalledTimes(1);
    const t = vi.mocked(pipelineTraceRepo.create).mock.calls[0][0];
    expect(t).toMatchObject({
      platform: "instagram",
      pipelineId: IG_DM_DRAFT_PURPOSE,
      subjectType: "ig_conversation",
      subjectId: "conv-1",
    });
    expect(t.stages).toHaveLength(1);
    expect(t.stages[0].stage).toBe("taslak");
  });

  it("skips the trace write for ad-hoc calls without a conversationId", async () => {
    await generateDmVariants(INPUT);
    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(pipelineTraceRepo.create).not.toHaveBeenCalled();
  });
});
