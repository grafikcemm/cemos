import { describe, it, expect, vi, beforeEach } from "vitest";

// enrichRepo's success flag must reflect real content: a model response with no
// why_it_matters / tweet_hook is NOT a success (otherwise syncRepoRadar persists
// an empty repo as an "active" catalog entry).
vi.mock("@/lib/ai/generateGated", () => ({ generateJsonGated: vi.fn() }));

import { enrichRepo } from "./newsAi";
import { generateJsonGated } from "@/lib/ai/generateGated";

const repo = { name: "r", owner: "o", description: "d", language: "TS", stars: 5, topics: [] };

describe("enrichRepo — success flag reflects real content", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success:false when the model yields no why/hook content", async () => {
    vi.mocked(generateJsonGated).mockResolvedValue({
      data: { why_it_matters: "", tweet_hook: "" },
      model: "m",
      estimatedCostUsd: 0,
    } as never);

    const out = await enrichRepo(repo);
    expect(out.success).toBe(false);
  });

  it("returns success:true when the model yields real enrichment", async () => {
    vi.mocked(generateJsonGated).mockResolvedValue({
      data: { why_it_matters: "önemli", tweet_hook: "hook", x_value_score: 70 },
      model: "m",
      estimatedCostUsd: 0,
    } as never);

    const out = await enrichRepo(repo);
    expect(out.success).toBe(true);
    expect(out.tweetHook).toBe("hook");
  });
});
