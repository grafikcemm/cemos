import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/usageLogRepo", () => ({
  usageLogRepo: {
    create: vi.fn().mockResolvedValue({}),
    findMonthRowsWithPurpose: vi.fn().mockResolvedValue([]),
    sumCostByDate: vi.fn().mockResolvedValue(0),
    sumCostByMonth: vi.fn().mockResolvedValue(0),
    sumCostByProviderMonth: vi.fn().mockResolvedValue(0),
    sumTweetsByDate: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock("@/lib/config/costLimits", () => ({
  getCostLimits: () => ({ dailyTweetBudget: 100 }),
}));

import { usageService } from "./usageService";
import { usageLogRepo } from "@/lib/db/usageLogRepo";

const mockedRepo = vi.mocked(usageLogRepo);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usageService.getMonthlySpendByPurpose", () => {
  it("should_sum_only_rows_with_matching_purpose_prefix_when_prefix_given", async () => {
    mockedRepo.findMonthRowsWithPurpose.mockResolvedValue([
      { estimatedCostUsd: 0.1, meta: JSON.stringify({ purpose: "yt_brief" }) },
      { estimatedCostUsd: 0.2, meta: JSON.stringify({ purpose: "yt_sync" }) },
      { estimatedCostUsd: 0.4, meta: JSON.stringify({ purpose: "news_translate" }) },
    ]);
    const total = await usageService.getMonthlySpendByPurpose("yt_");
    expect(total).toBeCloseTo(0.3);
  });

  it("should_skip_row_when_meta_is_invalid_json", async () => {
    mockedRepo.findMonthRowsWithPurpose.mockResolvedValue([
      { estimatedCostUsd: 0.5, meta: '{"purpose":"yt_brief"' }, // kırık JSON
      { estimatedCostUsd: 0.25, meta: JSON.stringify({ purpose: "yt_brief" }) },
    ]);
    const total = await usageService.getMonthlySpendByPurpose("yt_");
    expect(total).toBeCloseTo(0.25);
  });

  it("should_skip_row_when_purpose_is_not_string", async () => {
    mockedRepo.findMonthRowsWithPurpose.mockResolvedValue([
      { estimatedCostUsd: 0.5, meta: JSON.stringify({ purpose: 42 }) },
      { estimatedCostUsd: 0.5, meta: JSON.stringify({ other: "yt_x" }) },
    ]);
    const total = await usageService.getMonthlySpendByPurpose("yt_");
    expect(total).toBe(0);
  });

  it("should_return_zero_when_no_rows_in_month", async () => {
    mockedRepo.findMonthRowsWithPurpose.mockResolvedValue([]);
    expect(await usageService.getMonthlySpendByPurpose("ig_")).toBe(0);
  });
});

describe("usageService platform attribution", () => {
  it("should_pass_platform_to_repo_when_recordScan_called_with_platform", async () => {
    await usageService.recordScan({ tweetCount: 5, estimatedCostUsd: 0.01, platform: "instagram" });
    expect(mockedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "scan", platform: "instagram" })
    );
  });

  it("should_pass_platform_to_repo_when_recordOpenRouter_called_with_platform", async () => {
    await usageService.recordOpenRouter({
      estimatedCostUsd: 0.02,
      meta: { purpose: "yt_brief" },
      platform: "youtube",
    });
    expect(mockedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "openrouter",
        platform: "youtube",
        meta: JSON.stringify({ purpose: "yt_brief" }),
      })
    );
  });

  it("should_leave_platform_undefined_when_not_given", async () => {
    await usageService.recordGeneration({ estimatedCostUsd: 0.01 });
    expect(mockedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "generation", platform: undefined })
    );
  });
});
