import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveModel,
  estimateModelCost,
  hasVerifiedPrice,
  MODEL_PRICING,
  MODEL_PRICING_VERIFIED_AT,
} from "./model-config";

describe("model-config resolution and overrides", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.MODEL_PROFILE;
    delete process.env.ENABLE_FREE_MODELS;
    delete process.env.OPENROUTER_CHEAP_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should resolve pinned deepseek default in dev profile (2026-07 map)", () => {
    process.env.MODEL_PROFILE = "dev";
    const model = resolveModel("cheapWriter");
    expect(model).toBe("deepseek/deepseek-v4-flash");
  });

  it("should resolve paid gemini model in operator_quality profile", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    const model = resolveModel("cheapWriter");
    expect(model).toBe("google/gemini-3.1-flash-lite");
  });

  it("should respect free env overrides under dev profile", () => {
    process.env.MODEL_PROFILE = "dev";
    process.env.OPENROUTER_CHEAP_MODEL = "deepseek/deepseek-chat:free";
    const model = resolveModel("cheapWriter");
    expect(model).toBe("deepseek/deepseek-chat:free");
  });

  it("should IGNORE free env overrides under operator_quality profile to protect quality", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    process.env.OPENROUTER_CHEAP_MODEL = "deepseek/deepseek-chat:free";
    const model = resolveModel("cheapWriter");
    // Should ignore free and return the high-quality paid model
    expect(model).toBe("google/gemini-3.1-flash-lite");
  });

  it("should respect free env overrides under operator_quality if ENABLE_FREE_MODELS is explicitly true", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    process.env.OPENROUTER_CHEAP_MODEL = "deepseek/deepseek-chat:free";
    process.env.ENABLE_FREE_MODELS = "true";
    const model = resolveModel("cheapWriter");
    expect(model).toBe("deepseek/deepseek-chat:free");
  });

  it("should route the creative writer to pinned gemini-3.5-flash in operator_quality", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    expect(resolveModel("creativeWriter")).toBe("google/gemini-3.5-flash");
  });

  it("should route the final editor to pinned claude-sonnet-5 in operator_quality for Turkish polish", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    expect(resolveModel("finalEditor")).toBe("anthropic/claude-sonnet-5");
  });

  it("should keep the viral judge on cheap pinned gemini-3.1-flash-lite in operator_quality", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    expect(resolveModel("viralJudge")).toBe("google/gemini-3.1-flash-lite");
  });

  it("should keep the quality judge on pinned gemini-3.5-flash in operator_quality", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    expect(resolveModel("qualityJudge")).toBe("google/gemini-3.5-flash");
  });

  it("operator_quality defaults never resolve to a floating or :free slug", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    const roles = [
      "cheapWriter", "creativeWriter", "viralJudge",
      "qualityJudge", "finalEditor", "premiumCreative",
    ] as const;
    for (const role of roles) {
      const slug = resolveModel(role);
      // Canlı katalog canonical slug'ları tarihsizdir (2026-07-09 kararı);
      // floating/preview/:free marker yasak.
      expect(slug).not.toMatch(/:free|-latest|-fast|preview|fable/);
    }
  });
});

describe("model-config pricing provenance (Phase 5F §7)", () => {
  it("carries a catalog-verified date marker", () => {
    expect(MODEL_PRICING_VERIFIED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("prices claude-opus-4.8 (premium fallback) from the verified catalog", () => {
    expect(hasVerifiedPrice("anthropic/claude-opus-4.8")).toBe(true);
    expect(MODEL_PRICING["anthropic/claude-opus-4.8"]).toEqual({
      inputCostPerMillion: 5,
      outputCostPerMillion: 25,
    });
  });

  it("estimates a KNOWN model from MODEL_PRICING, not the role fallback", () => {
    // 1M in + 1M out on gpt-5.4-mini (judge) = 0.75 + 4.5 = 5.25
    const cost = estimateModelCost(1_000_000, 1_000_000, "openai/gpt-5.4-mini", "viralJudge");
    expect(cost).toBeCloseTo(5.25, 5);
  });

  it("never returns $0 for an UNKNOWN slug — falls back to a positive role estimate", () => {
    expect(hasVerifiedPrice("some/unlisted-model")).toBe(false);
    const cost = estimateModelCost(1_000_000, 1_000_000, "some/unlisted-model", "creativeWriter");
    // creativeWriter role cost = 1.5 in + 9 out = 10.5, strictly > 0
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeCloseTo(10.5, 5);
  });
});
