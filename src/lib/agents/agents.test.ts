import { describe, it, expect, beforeEach } from "vitest";
import { synthesize, deliberate, LENSES, type LensVerdict } from "@/lib/agents/council";
import { pickBest, routeItem, type AccountFit } from "@/lib/agents/router";
import { heuristicAnalysis, analyzeViralItem } from "@/lib/growth-engine/viral-analysis";

describe("council.synthesize", () => {
  it("weights lenses and classifies a strong verdict", () => {
    const lenses: LensVerdict[] = [
      { lens: "hook", score: 90, argument: "" },
      { lens: "persona", score: 85, argument: "" },
      { lens: "risk", score: 80, argument: "" },
      { lens: "novelty", score: 75, argument: "" }
    ];
    const v = synthesize(lenses);
    expect(v.score).toBeGreaterThanOrEqual(80);
    expect(v.verdict).toBe("strong");
    expect(v.lenses).toHaveLength(4);
  });

  it("classifies a weak verdict and handles empty input", () => {
    const weak = synthesize([{ lens: "hook", score: 10, argument: "" }]);
    expect(weak.verdict).toBe("weak");
    const empty = synthesize([]);
    expect(empty.score).toBe(0);
    expect(empty.verdict).toBe("weak");
  });
});

describe("council.deliberate fail-open", () => {
  beforeEach(() => delete process.env.OPENROUTER_API_KEY);
  it("returns a neutral synthesized verdict without an API key", async () => {
    const v = await deliberate("herhangi bir içerik", "grafikcem");
    expect(v.usedLlm).toBe(false);
    expect(v.lenses).toHaveLength(LENSES.length);
    expect(v.score).toBeGreaterThan(0);
  });
});

describe("router.pickBest", () => {
  it("picks the highest valid fit above the floor", () => {
    const fits: AccountFit[] = [
      { account: "grafikcem", fitScore: 80, reason: "" },
      { account: "maskulenkod", fitScore: 30, reason: "" }
    ];
    expect(pickBest(fits).best).toBe("grafikcem");
  });

  it("returns null when nothing clears the floor", () => {
    expect(pickBest([{ account: "grafikcem", fitScore: 20, reason: "" }]).best).toBeNull();
  });

  it("drops invalid account handles", () => {
    const res = pickBest([{ account: "bogus" as never, fitScore: 99, reason: "" }]);
    expect(res.best).toBeNull();
    expect(res.fits).toHaveLength(0);
  });
});

describe("router.routeItem fail-open", () => {
  beforeEach(() => delete process.env.OPENROUTER_API_KEY);
  it("returns empty routing without an API key", async () => {
    const r = await routeItem("içerik");
    expect(r.best).toBeNull();
    expect(r.usedLlm).toBe(false);
  });
});

describe("viral-analysis heuristic fallback", () => {
  beforeEach(() => delete process.env.OPENROUTER_API_KEY);

  it("scores niche keyword overlap higher", () => {
    const onTopic = heuristicAnalysis("yeni yapay zeka tasarım aracı modeli", "grafikcem");
    const offTopic = heuristicAnalysis("bugün hava çok güzel", "grafikcem");
    expect(onTopic.audienceInterest).toBeGreaterThan(offTopic.audienceInterest);
    expect(onTopic.trendingPotential).toBeGreaterThanOrEqual(1);
    expect(onTopic.trendingPotential).toBeLessThanOrEqual(10);
  });

  it("analyzeViralItem falls back to heuristic without a key", async () => {
    const a = await analyzeViralItem("yapay zeka haberi", "grafikcem");
    expect(a.usedLlm).toBe(false);
    expect(a.summary.length).toBeGreaterThan(0);
  });
});
