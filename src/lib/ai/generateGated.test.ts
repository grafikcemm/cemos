import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/openrouter", () => ({
  generateJson: vi.fn(),
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

import { generateJsonGated } from "./generateGated";
import { generateJson } from "@/lib/ai/openrouter";
import { assertGenerationAllowed, BudgetExceededError } from "@/lib/config/costGate";
import { usageService } from "@/lib/services/usageService";

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
      meta: { purpose: "test", contentItemId: "ci-1" },
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
        fallbacks: ["openai/gpt-5.5", "google/gemini-3.5-flash"],
        structured: "json_object",
        cacheControl: true,
        providerOrder: ["anthropic"],
        dataCollection: "deny",
        reasoning: "medium",
        temperature: 0.9,
        timeoutMs: 45_000,
      }),
    );
    expect(usageService.recordOpenRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ purpose: "writer_x_draft", preset: "cemos-writer" }),
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
