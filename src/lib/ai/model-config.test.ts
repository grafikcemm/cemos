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

  it("should resolve cheap deepseek free model by default in dev profile", () => {
    process.env.MODEL_PROFILE = "dev";
    const model = resolveModel("cheapWriter");
    expect(model).toBe("deepseek/deepseek-chat:free");
  });

  it("should resolve paid gemini model in operator_quality profile", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    const model = resolveModel("cheapWriter");
    expect(model).toBe("google/gemini-2.5-flash");
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
    expect(model).toBe("google/gemini-2.5-flash");
  });

  it("should respect free env overrides under operator_quality if ENABLE_FREE_MODELS is explicitly true", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    process.env.OPENROUTER_CHEAP_MODEL = "deepseek/deepseek-chat:free";
    process.env.ENABLE_FREE_MODELS = "true";
    const model = resolveModel("cheapWriter");
    expect(model).toBe("deepseek/deepseek-chat:free");
  });

  it("should upgrade the creative writer (quality bottleneck) to gemini-2.5-pro in operator_quality", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    expect(resolveModel("creativeWriter")).toBe("google/gemini-2.5-pro");
  });

  it("should route the final editor to claude-sonnet-4-5 in operator_quality for Turkish polish", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    expect(resolveModel("finalEditor")).toBe("anthropic/claude-sonnet-4-5");
  });

  it("should keep the viral judge on cheap gemini-2.5-flash in operator_quality", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    expect(resolveModel("viralJudge")).toBe("google/gemini-2.5-flash");
  });

  it("should keep the quality judge on gemini-2.5-pro in operator_quality", () => {
    process.env.MODEL_PROFILE = "operator_quality";
    expect(resolveModel("qualityJudge")).toBe("google/gemini-2.5-pro");
  });
});
