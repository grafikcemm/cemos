import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateBrief, YtBriefDailyLimitError } from "./brief-generator";
import { generateJson } from "@/lib/ai/openrouter";
import { usageService } from "@/lib/services/usageService";
import { ytBriefRepo } from "@/lib/db/ytBriefRepo";
import { pipelineTraceRepo } from "@/lib/db/pipelineTraceRepo";
import { BudgetExceededError } from "@/lib/config/costGate";
import type { ModelRole } from "@/lib/ai/model-config";

vi.mock("@/lib/ai/openrouter", () => ({
  generateJson: vi.fn(),
  estimateGenerateJsonCeiling: vi.fn(() => 0.01),
}));
vi.mock("@/lib/ai/openrouter-key-status", () => ({
  getOpenRouterKeyStatus: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/services/usageService", () => ({
  usageService: {
    getMonthlySpendByPurpose: vi.fn(() => Promise.resolve(0)),
    recordOpenRouter: vi.fn(() => Promise.resolve()),
    // Dalga 2: runStage gated'e geçti — bütçe kapısı bu mock'la açık kalır.
    getMonthlyCost: vi.fn(() => Promise.resolve(0)),
    getMonthlyOpenRouterCost: vi.fn(() => Promise.resolve(0)),
    getMonthlySpendByBudgetClass: vi.fn(() => Promise.resolve(0)),
  },
}));
vi.mock("@/lib/db/ytBriefRepo", () => ({
  ytBriefRepo: {
    create: vi.fn(() => Promise.resolve({ id: "b1" })),
    update: vi.fn(() => Promise.resolve({})),
    countCreatedToday: vi.fn(() => Promise.resolve(0)),
  },
}));
vi.mock("@/lib/db/pipelineTraceRepo", () => ({
  pipelineTraceRepo: { create: vi.fn(() => Promise.resolve({ id: "pt-1" })) },
}));

type Gj = { role: ModelRole; system: string; user: string; temperature?: number };
function mkResult(data: unknown, model = "test-model") {
  return { data, model, actualCostUsd: 0.01, estimatedCostUsd: 0.01, inputTokens: 1, outputTokens: 1 };
}

const VIDEO = {
  videoId: "v1",
  title: "Test",
  description: "desc",
  channelTitle: "Rakip",
  category: "ai_haber",
};

function happyImpl({ role }: Gj) {
  switch (role) {
    case "viralJudge":
      return Promise.resolve(
        mkResult({ whyItWorked: "w", hookPattern: "h", channelPersona: "p", structure: "s" })
      );
    case "qualityJudge":
      return Promise.resolve(mkResult({ differentiationAnalysis: "fark", pillar: "p1" }));
    case "creativeWriter":
      return Promise.resolve(
        mkResult({
          outline: [{ heading: "Giriş", targetSec: 30, talkingPoints: ["x"] }],
          titleVariants: ["A", "B"],
          thumbnailConcept: "konsept",
          seoDescription: "seo",
          hookScript: "hook",
          fullScript: "TAM METİN",
        })
      );
    case "premiumCreative":
      return Promise.resolve(mkResult({ hookScript: "hook", fullScript: "PREMIUM METİN" }, "premium-x"));
    case "finalEditor":
      return Promise.resolve(
        mkResult({ fullScript: "CİLALI", editingNotes: "edit", shootingNotes: "çekim" })
      );
    default:
      return Promise.resolve(mkResult({}));
  }
}

describe("generateBrief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usageService.getMonthlySpendByPurpose).mockResolvedValue(0);
    vi.mocked(ytBriefRepo.countCreatedToday).mockResolvedValue(0);
    vi.mocked(ytBriefRepo.create).mockResolvedValue({ id: "b1" } as never);
    vi.mocked(generateJson).mockImplementation(happyImpl as never);
  });

  it("mutlu yol: 5 aşama, transcriptUsed true, maliyet toplanır", async () => {
    const res = await generateBrief({ video: VIDEO, transcript: "uzun transkript" });
    expect(res.briefId).toBe("b1");
    expect(res.stagesCompleted).toBe(5);
    expect(res.transcriptUsed).toBe(true);
    expect(res.costUsd).toBeCloseTo(0.05, 5);
    expect(res.warnings).toHaveLength(0);
  });

  it("aşama patlarsa devam eder (fail-open): stage3 atılır, diğerleri kaydedilir", async () => {
    vi.mocked(generateJson).mockImplementation((opts) => {
      const o = opts as Gj;
      if (o.role === "creativeWriter") return Promise.reject(new Error("stage3 boom")) as never;
      return happyImpl(o) as never;
    });
    const res = await generateBrief({ video: VIDEO, transcript: "t" });
    // stage1, stage2, stage4(premium), stage5 başarılı = 4; stage3 atlandı
    expect(res.stagesCompleted).toBe(4);
    expect(res.warnings.some((w) => w.startsWith("stage3_iskelet"))).toBe(true);
  });

  it("premium patlar → creativeWriter fallback ile tam metin yine üretilir", async () => {
    vi.mocked(generateJson).mockImplementation((opts) => {
      const o = opts as Gj;
      if (o.role === "premiumCreative") return Promise.reject(new Error("premium kapalı")) as never;
      return happyImpl(o) as never;
    });
    const res = await generateBrief({ video: VIDEO, transcript: "t" });
    expect(res.warnings.some((w) => w.startsWith("stage4"))).toBe(false);
    // stage4 creativeWriter fallback ile tamamlandı → 5 aşama
    expect(res.stagesCompleted).toBe(5);
  });

  it("transcript yok → transcriptUsed false + 'transcript_unavailable' uyarısı", async () => {
    const res = await generateBrief({ video: VIDEO, transcript: null });
    expect(res.transcriptUsed).toBe(false);
    expect(res.warnings).toContain("transcript_unavailable");
  });

  it("her LLM stage'i runner'dan geçer (payload sırası birebir) + tek pipeline izi yazar", async () => {
    await generateBrief({ video: VIDEO, transcript: "t" });
    const roles = vi.mocked(generateJson).mock.calls.map((c) => (c[0] as Gj).role);
    expect(roles).toEqual(["viralJudge", "qualityJudge", "creativeWriter", "premiumCreative", "finalEditor"]);
    expect(pipelineTraceRepo.create).toHaveBeenCalledTimes(1);
    const trace = vi.mocked(pipelineTraceRepo.create).mock.calls[0][0];
    expect(trace).toMatchObject({
      platform: "youtube",
      pipelineId: "yt_brief",
      subjectType: "yt_video",
      subjectId: "v1",
    });
    expect(trace.stages).toHaveLength(5);
    expect(trace.stages.map((s) => s.stage)).toEqual(["analiz", "fark", "iskelet", "tammetin", "cila"]);
  });

  it("aylık bütçe aşıldıysa LLM çağrılmadan BudgetExceededError", async () => {
    vi.mocked(usageService.getMonthlySpendByPurpose).mockResolvedValue(99);
    await expect(generateBrief({ video: VIDEO, transcript: "t" })).rejects.toBeInstanceOf(
      BudgetExceededError
    );
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("günlük limit doluysa LLM çağrılmadan YtBriefDailyLimitError", async () => {
    vi.mocked(ytBriefRepo.countCreatedToday).mockResolvedValue(3);
    await expect(generateBrief({ video: VIDEO, transcript: "t" })).rejects.toBeInstanceOf(
      YtBriefDailyLimitError
    );
    expect(generateJson).not.toHaveBeenCalled();
  });
});
