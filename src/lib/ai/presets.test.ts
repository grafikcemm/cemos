import { describe, it, expect } from "vitest";
import {
  PRESETS,
  resolvePreset,
  validatePresets,
  isPinnedSlug,
  isFloatingSlug,
  familyOf,
  KNOWN_CATALOG,
} from "./presets";

describe("presets — startup lint (FIRST-SPRINT item 11)", () => {
  it("validatePresets aktif tabloda hatasız geçer (CI gate)", () => {
    expect(() => validatePresets()).not.toThrow();
  });

  it("her preset primary'si pinned dated slug (regex -\\d{8}$)", () => {
    for (const preset of Object.values(PRESETS)) {
      expect(isPinnedSlug(preset.primary), `${preset.name}: ${preset.primary}`).toBe(true);
    }
  });

  it("hiçbir primary floating değil; floating yalnız fallback'te olabilir", () => {
    for (const preset of Object.values(PRESETS)) {
      expect(isFloatingSlug(preset.primary), `${preset.name}: ${preset.primary}`).toBe(false);
    }
  });

  it("her primary katalog snapshot'ında mevcut (drift saklanmaz)", () => {
    for (const preset of Object.values(PRESETS)) {
      expect(KNOWN_CATALOG.has(preset.primary), `${preset.name}: ${preset.primary}`).toBe(true);
    }
  });

  it("her preset farklı-sağlayıcı fallback zinciri taşır", () => {
    for (const preset of Object.values(PRESETS)) {
      const primaryFamily = familyOf(preset.primary);
      expect(
        preset.fallbacks.some((f) => familyOf(f) !== primaryFamily),
        `${preset.name}: fallback zinciri tek sağlayıcı`,
      ).toBe(true);
    }
  });

  it("floating slug tespiti: -latest / -fast / fable / preview / :free", () => {
    expect(isFloatingSlug("anthropic/claude-sonnet-latest")).toBe(true);
    expect(isFloatingSlug("openai/gpt-mini-latest")).toBe(true);
    expect(isFloatingSlug("claude-fable-5")).toBe(true);
    expect(isFloatingSlug("deepseek/deepseek-chat:free")).toBe(true);
    expect(isFloatingSlug("anthropic/claude-sonnet-5-20260630")).toBe(false);
  });

  it("resolvePreset bilinen preset'i döndürür", () => {
    const writer = resolvePreset("cemos-writer");
    expect(writer.primary).toBe("anthropic/claude-sonnet-5-20260630");
    expect(writer.purposePrefix).toBe("writer_");
  });
});

describe("presets — writer ailesi ≠ judge ailesi (C3 registry testi, ZORUNLU)", () => {
  it("cemos-writer (Anthropic) ile cemos-final-judge (OpenAI) karşı ailede", () => {
    const writerFamily = familyOf(PRESETS["cemos-writer"].primary);
    const judgeFamily = familyOf(PRESETS["cemos-final-judge"].primary);
    expect(writerFamily).toBe("anthropic");
    expect(judgeFamily).toBe("openai");
    expect(writerFamily).not.toBe(judgeFamily);
  });
});
