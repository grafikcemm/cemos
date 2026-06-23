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
});
