import { describe, it, expect, vi, beforeEach } from "vitest";

// Proves the runner instrumentation kept generateReplyVariants byte-identical:
// generateJson is still called with the SAME payload, and a trace is emitted.
vi.mock("@/lib/ai/openrouter", () => ({ generateJson: vi.fn() }));
vi.mock("@/lib/db/pipelineTraceRepo", () => ({
  pipelineTraceRepo: { create: vi.fn(() => Promise.resolve({ id: "pt" })) },
}));
// Dalga 2: çağrı gated sarmalayıcıdan geçer — getMonthlyCost mock'u bütçe
// kapısını açık tutar; UsageLog yazımı gated içindeki recordOpenRouter'dır.
vi.mock("@/lib/services/usageService", () => ({
  usageService: {
    recordOpenRouter: vi.fn(() => Promise.resolve()),
    getMonthlyCost: vi.fn(() => Promise.resolve(0)),
  },
}));

import { generateJson } from "@/lib/ai/openrouter";
import { pipelineTraceRepo } from "@/lib/db/pipelineTraceRepo";
import { usageService } from "@/lib/services/usageService";
import { generateReplyVariants } from "@/lib/instagram/comment-pipeline";
import { IG_REPLY_PURPOSE } from "@/lib/instagram/igConfig";

function mkResult(data: unknown, model = "m", cost = 0.01) {
  return { data, model, actualCostUsd: cost, estimatedCostUsd: cost, inputTokens: 1, outputTokens: 1 };
}

const INPUT = { caption: "cap", commentText: "Bu araç ne kadar?", trText: "Bu araç ne kadar?", lang: "tr", intent: "soru" };

describe("generateReplyVariants — runner instrumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateJson).mockResolvedValue(mkResult({ variants: [] }) as never);
  });

  it("calls generateJson with the original creativeWriter payload", async () => {
    await generateReplyVariants({ ...INPUT, commentId: "c1" });
    expect(generateJson).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(generateJson).mock.calls[0][0];
    expect(arg.role).toBe("creativeWriter");
    expect(arg.temperature).toBe(0.8);
    expect(typeof arg.system).toBe("string");
    expect(typeof arg.user).toBe("string");
    expect(usageService.recordOpenRouter).toHaveBeenCalledTimes(1);
  });

  it("writes a single-stage pipeline trace when a commentId is supplied", async () => {
    await generateReplyVariants({ ...INPUT, commentId: "c1" });
    expect(pipelineTraceRepo.create).toHaveBeenCalledTimes(1);
    const t = vi.mocked(pipelineTraceRepo.create).mock.calls[0][0];
    expect(t).toMatchObject({
      platform: "instagram",
      pipelineId: IG_REPLY_PURPOSE,
      subjectType: "ig_comment",
      subjectId: "c1",
    });
    expect(t.stages).toHaveLength(1);
    expect(t.stages[0].stage).toBe("yanit");
  });

  it("skips the trace write for ad-hoc calls without a commentId", async () => {
    await generateReplyVariants(INPUT);
    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(pipelineTraceRepo.create).not.toHaveBeenCalled();
  });
});
