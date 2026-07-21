import { describe, it, expect, vi, beforeEach } from "vitest";

// A failed digest generation must NEVER persist an empty DailyDigest row (which
// the health check + UI would read as "digest exists" — a false green).
vi.mock("@/lib/db/client", () => ({
  prisma: {
    newsItem: { findMany: vi.fn(async () => []) },
    repoRadarItem: { findMany: vi.fn(async () => []) },
    dailyDigest: { upsert: vi.fn(async () => ({})) },
  },
}));
vi.mock("@/lib/news/newsAi", () => ({ generateDigest: vi.fn() }));

import { buildDailyDigest } from "./digest";
import { prisma } from "@/lib/db/client";
import { generateDigest } from "@/lib/news/newsAi";

describe("buildDailyDigest — never persist an empty digest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does NOT upsert when generation fails (success:false, empty fields)", async () => {
    vi.mocked(generateDigest).mockResolvedValue({
      success: false,
      newsSummary: "",
      repoSummary: "",
      aiTips: "",
      modelUsed: null,
      costUsd: 0,
    });

    const res = await buildDailyDigest();

    expect(res.success).toBe(false);
    expect(prisma.dailyDigest.upsert).not.toHaveBeenCalled();
  });

  it("upserts a real digest when generation succeeds", async () => {
    vi.mocked(generateDigest).mockResolvedValue({
      success: true,
      newsSummary: "Bugün öne çıkanlar...",
      repoSummary: "Trend repolar...",
      aiTips: "3 ipucu",
      modelUsed: "x",
      costUsd: 0.01,
    });

    const res = await buildDailyDigest();

    expect(res.success).toBe(true);
    expect(prisma.dailyDigest.upsert).toHaveBeenCalledTimes(1);
  });
});
