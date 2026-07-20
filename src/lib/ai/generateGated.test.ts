import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/openrouter", () => ({
  generateJson: vi.fn(),
  estimateGenerateJsonCeiling: vi.fn(() => 0.05),
  classifyOpenRouterError: vi.fn((m: string) => (/json|parse/i.test(m) ? "invalid_json" : "unknown")),
}));
vi.mock("@/lib/config/costGate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/costGate")>(
    "@/lib/config/costGate",
  );
  return { ...actual, assertGenerationAllowed: vi.fn() };
});
vi.mock("@/lib/services/usageService", () => ({
  usageService: { recordOpenRouter: vi.fn() },
}));
vi.mock("@/lib/services/settingsService", () => ({
  getModelProfile: vi.fn(async () => "operator_quality"),
}));

import { generateJsonGated } from "./generateGated";
import { generateJson } from "@/lib/ai/openrouter";
import { assertGenerationAllowed, BudgetExceededError } from "@/lib/config/costGate";
import { usageService } from "@/lib/services/usageService";
import { getModelProfile } from "@/lib/services/settingsService";

const fakeResult = {
  data: { x: 1 },
  model: "test/model",
  inputTokens: 10,
  outputTokens: 5,
  estimatedCostUsd: 0.001,
  actualCostUsd: 0.002,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateJsonGated", () => {
  it("budget exceeded → throws before any spend, no usage logged", async () => {
    vi.mocked(assertGenerationAllowed).mockRejectedValueOnce(new BudgetExceededError(10, 5));

    await expect(
      generateJsonGated({ role: "cheapWriter", system: "s", user: "u", purpose: "test" }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    expect(generateJson).not.toHaveBeenCalled();
    expect(usageService.recordOpenRouter).not.toHaveBeenCalled();
  });

  it("success → calls generateJson once and logs exactly one UsageLog row", async () => {
    vi.mocked(assertGenerationAllowed).mockResolvedValueOnce(undefined);
    vi.mocked(generateJson).mockResolvedValueOnce(fakeResult as never);

    const res = await generateJsonGated({
      role: "cheapWriter",
      system: "s",
      user: "u",
      purpose: "test",
      accountId: "acc-1",
      platform: "x",
      meta: { contentItemId: "ci-1" },
    });

    expect(res).toBe(fakeResult);
    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(usageService.recordOpenRouter).toHaveBeenCalledTimes(1);
    expect(usageService.recordOpenRouter).toHaveBeenCalledWith({
      accountId: "acc-1",
      estimatedCostUsd: 0.002, // actualCostUsd
      model: "test/model",
      meta: { purpose: "test", budgetClass: "background", contentItemId: "ci-1" },
      platform: "x",
    });
  });

  it("preset → model/fallback/structured/cache/provider preset'ten forward edilir", async () => {
    vi.mocked(assertGenerationAllowed).mockResolvedValueOnce(undefined);
    vi.mocked(generateJson).mockResolvedValueOnce(fakeResult as never);

    await generateJsonGated({
      preset: "cemos-writer",
      system: "s",
      user: "u",
      purpose: "writer_x_draft",
      accountId: "acc-1",
      platform: "x",
    });

    expect(generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "creativeWriter",
        model: "anthropic/claude-sonnet-5",
        fallbacks: ["deepseek/deepseek-v4-pro", "google/gemini-3.5-flash"],
        structured: "json_object",
        cacheControl: true,
        providerOrder: ["anthropic"],
        maxPrice: { prompt: 2.25, completion: 11 },
        dataCollection: "deny",
        reasoning: "medium",
        temperature: 0.9,
        timeoutMs: 45_000,
      }),
    );
    expect(usageService.recordOpenRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          purpose: "writer_x_draft",
          preset: "cemos-writer",
          budgetClass: "essential",
        }),
      }),
    );
  });

  it("preset + purpose yok → purposePrefix'ten default purpose yazılır", async () => {
    vi.mocked(assertGenerationAllowed).mockResolvedValueOnce(undefined);
    vi.mocked(generateJson).mockResolvedValueOnce(fakeResult as never);

    await generateJsonGated({ preset: "cemos-final-judge", system: "s", user: "u" });

    expect(usageService.recordOpenRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ purpose: "judge_unlabeled" }),
      }),
    );
  });

  it("cold-start: durable model profile'ı generateJson'dan ÖNCE hydrate eder (closure B)", async () => {
    vi.mocked(assertGenerationAllowed).mockResolvedValueOnce(undefined);
    vi.mocked(generateJson).mockResolvedValueOnce(fakeResult as never);

    await generateJsonGated({
      role: "creativeWriter",
      system: "s",
      user: "u",
      purpose: "writer_x_growth",
    });

    // The sync resolveModel reads process.env.MODEL_PROFILE; hydration MUST run
    // first so a cold serverless instance honors the operator's durable choice.
    expect(getModelProfile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getModelProfile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(generateJson).mock.invocationCallOrder[0],
    );
  });

  it("budget reddi durable profile hydrate edildikten sonra bile spend yapmaz", async () => {
    vi.mocked(assertGenerationAllowed).mockRejectedValueOnce(new BudgetExceededError(10, 5));

    await expect(
      generateJsonGated({ role: "cheapWriter", system: "s", user: "u", purpose: "test" }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    // Hydration is cheap + fail-open; it runs before the budget assertion but a
    // blocked budget still stops the spend.
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("ne preset ne role → hata (budget gate'e bile gitmez)", async () => {
    await expect(generateJsonGated({ system: "s", user: "u", purpose: "p" })).rejects.toThrow(
      /preset veya role/,
    );
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("purpose'suz preset'siz çağrı → hata (UsageLog attribution zorunlu)", async () => {
    await expect(generateJsonGated({ role: "cheapWriter", system: "s", user: "u" })).rejects.toThrow(
      /purpose zorunlu/,
    );
    expect(generateJson).not.toHaveBeenCalled();
  });
});

describe("generateJsonGated billed failures", () => {
  it("logs a billed invalid response before rethrowing", async () => {
    vi.mocked(assertGenerationAllowed).mockResolvedValueOnce(undefined);
    const failure = Object.assign(new Error("invalid JSON"), {
      actualCostUsd: 0.03,
      model: "test/model",
    });
    vi.mocked(generateJson).mockRejectedValueOnce(failure);

    await expect(
      generateJsonGated({ role: "cheapWriter", system: "s", user: "u", purpose: "test" }),
    ).rejects.toBe(failure);

    expect(usageService.recordOpenRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        estimatedCostUsd: 0.03,
        model: "test/model",
        meta: expect.objectContaining({
          purpose: "test",
          budgetClass: "background",
          failed: true,
          errorClass: "invalid_json",
        }),
      }),
    );
  });
});
