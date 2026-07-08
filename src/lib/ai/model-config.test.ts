import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveModel } from "./model-config";

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
    expect(model).toBe("deepseek/deepseek-v4-flash-20260423");
  });

  it("should resolve paid gemini model in operator_quality profile", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    const model = resolveModel("cheapWriter");
    expect(model).toBe("google/gemini-3.1-flash-lite-20260507");
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
    expect(model).toBe("google/gemini-3.1-flash-lite-20260507");
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
    expect(resolveModel("creativeWriter")).toBe("google/gemini-3.5-flash-20260519");
  });

  it("should route the final editor to pinned claude-sonnet-5 in operator_quality for Turkish polish", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    expect(resolveModel("finalEditor")).toBe("anthropic/claude-sonnet-5-20260630");
  });

  it("should keep the viral judge on cheap pinned gemini-3.1-flash-lite in operator_quality", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    expect(resolveModel("viralJudge")).toBe("google/gemini-3.1-flash-lite-20260507");
  });

  it("should keep the quality judge on pinned gemini-3.5-flash in operator_quality", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    expect(resolveModel("qualityJudge")).toBe("google/gemini-3.5-flash-20260519");
  });

  it("operator_quality defaults never resolve to a floating or :free slug", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    const roles = [
      "cheapWriter", "creativeWriter", "viralJudge",
      "qualityJudge", "finalEditor", "premiumCreative",
    ] as const;
    for (const role of roles) {
      const slug = resolveModel(role);
      expect(slug).not.toMatch(/:free|-latest/);
      // Pinned dated slug (2026-07 map).
      expect(slug).toMatch(/-\d{8}$/);
    }
  });
});
