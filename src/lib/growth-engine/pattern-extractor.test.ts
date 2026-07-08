import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractPattern,
  extractPatternSyncFallback,
  normalizePatternExtraction,
  patternExtractionToViralPatternInput
} from "./pattern-extractor";
import type { PatternExtractionInput, PatternExtractionResult } from "./types";
import { ACCOUNT_HANDLES } from "./account-adapter";

// ---------------------------------------------------------------------------
// Mock AI module — all tests run with fallback by default
// ---------------------------------------------------------------------------

vi.mock("@/lib/ai/openrouter", () => ({
  generateJson: vi.fn().mockRejectedValue(new Error("AI disabled in tests"))
}));
// Dalga 2: pattern-extractor AI yolu artık budget-gated sarmalayıcıdan geçer.
vi.mock("@/lib/ai/generateGated", () => ({
  generateJsonGated: vi.fn().mockRejectedValue(new Error("AI disabled in tests"))
}));

vi.mock("@/lib/db/viralPatternRepo", () => ({
  viralPatternRepo: {
    create: vi.fn().mockResolvedValue({ id: "test-pattern-id" })
  }
}));

// ---------------------------------------------------------------------------
// Sample texts for each account
// ---------------------------------------------------------------------------

const GRAFIKCEM_TEXT =
  "OpenAI yeni bir güncelleme ile tasarımcılar için görsel üretim araçlarını tamamen değiştiriyor. " +
  "Bu güncelleme, grafik tasarım iş akışlarını köklü şekilde etkileyecek. " +
  "Freelance çalışanlar bu aracı şimdiden denemeliler.";

const MASKULENKOD_TEXT =
  "Hâlâ ondan mesaj bekliyorsan, zaten kaybetmişsin. " +
  "Bir kadının ilgisi sana geliyorsa gelir. Peşinden koşmak erkekliğe değil zayıflığa işaret. " +
  "Disiplin bu konuda da geçerli.";

// ---------------------------------------------------------------------------
// extractPatternSyncFallback tests
// ---------------------------------------------------------------------------

describe("extractPatternSyncFallback", () => {
  it("extracts pattern from grafikcem text", () => {
    const result = extractPatternSyncFallback({
      text: GRAFIKCEM_TEXT,
      accountHandle: "grafikcem"
    });

    expect(result.hook).toBeTruthy();
    expect(result.mainClaim).toBeTruthy();
    expect(result.emotionalTrigger).toBe("bunu bilmem gerekiyordu");
    expect(result.tone).toContain("operatör");
    expect(result.suggestedAccounts).toContain("grafikcem");
    expect(result.suggestedPatterns.length).toBeGreaterThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(40);
    expect(result.confidence).toBeLessThanOrEqual(60);
  });

  it("extracts pattern from maskulenkod text with correct suggestedPatterns", () => {
    const result = extractPatternSyncFallback({
      text: MASKULENKOD_TEXT,
      accountHandle: "maskulenkod"
    });

    expect(result.hook).toBeTruthy();
    expect(result.emotionalTrigger).toBe("rahatsız edici gerçek");
    // Sprint 2: tone artık CANLI profil toneRules'undan gelir (ASCII yazım).
    expect(result.tone.toLowerCase()).toContain("dogrudan");
    expect(result.suggestedAccounts).toContain("maskulenkod");
    // Should match maskulenkod-specific patterns
    const validPatterns = [
      "Hâlâ Buna İnanıyorsan",
      "Ayna Tutan Gerçek",
      "Modern Erkek Gerçeği",
      "Yumuşatılmamış İlişki Gerçeği",
      "Disiplin Eksikliği"
    ];
    for (const pattern of result.suggestedPatterns) {
      expect(validPatterns).toContain(pattern);
    }
  });

  it("throws on empty text", () => {
    expect(() =>
      extractPatternSyncFallback({ text: "" })
    ).toThrow();
  });

  it("ignores invalid accountHandle and auto-detects from text", () => {
    // Invalid handle is treated as null — falls back to auto-detection
    const result = extractPatternSyncFallback({
      text: GRAFIKCEM_TEXT,
      accountHandle: "invalid_handle"
    });
    // Should still produce a result, detecting account from keywords
    expect(result).toBeDefined();
    expect(result.hook).toBeTruthy();
    expect(result.suggestedAccounts.length).toBeGreaterThanOrEqual(1);
  });

  it("auto-detects account from text when no accountHandle provided", () => {
    const result = extractPatternSyncFallback({ text: GRAFIKCEM_TEXT });

    // Text contains design/AI tooling keywords — should detect grafikcem
    expect(result.suggestedAccounts).toContain("grafikcem");
  });

  it("confidence is between 40-60 for fallback", () => {
    for (const handle of ACCOUNT_HANDLES) {
      const result = extractPatternSyncFallback({
        text: "Bu bir test metnidir. Bir şeyler hakkında konuşuyoruz. İlginç bir gelişme var.",
        accountHandle: handle
      });
      expect(result.confidence).toBeGreaterThanOrEqual(40);
      expect(result.confidence).toBeLessThanOrEqual(60);
    }
  });

  it("suggestedAccounts contains only valid AccountHandle values", () => {
    const result = extractPatternSyncFallback({
      text: GRAFIKCEM_TEXT,
      accountHandle: "grafikcem"
    });

    for (const account of result.suggestedAccounts) {
      expect(ACCOUNT_HANDLES).toContain(account);
    }
  });

  it("structure always follows expected format", () => {
    const result = extractPatternSyncFallback({
      text: MASKULENKOD_TEXT,
      accountHandle: "maskulenkod"
    });

    expect(result.structure).toBe("hook -> claim -> context -> closing");
  });

  it("audience matches account description", () => {
    const result = extractPatternSyncFallback({
      text: GRAFIKCEM_TEXT,
      accountHandle: "grafikcem"
    });

    // Sprint 2: audience artık CANLI profil concept'inden gelir (accounts.ts).
    expect(result.audience).toContain("Türk yaratıcı");
    expect(result.audience).toContain("araç testleri");
  });
});

// ---------------------------------------------------------------------------
// normalizePatternExtraction tests
// ---------------------------------------------------------------------------

describe("normalizePatternExtraction", () => {
  it("normalizes valid AI response", () => {
    const raw = {
      hook: "Test hook",
      mainClaim: "Test claim",
      emotionalTrigger: "test trigger",
      structure: "hook -> body",
      tone: "sert",
      audience: "herkes",
      viralityReason: "merak uyandırıyor",
      suggestedAccounts: ["grafikcem", "maskulenkod"],
      suggestedPatterns: ["Sessiz Değişim"],
      confidence: 78
    };

    const result = normalizePatternExtraction(raw);

    expect(result.hook).toBe("Test hook");
    expect(result.mainClaim).toBe("Test claim");
    expect(result.confidence).toBe(78);
    expect(result.suggestedAccounts).toEqual(["grafikcem", "maskulenkod"]);
  });

  it("handles null input safely", () => {
    const result = normalizePatternExtraction(null);
    expect(result.hook).toBe("");
    expect(result.confidence).toBe(0);
    expect(result.suggestedPatterns).toEqual(["Genel Pattern"]);
  });

  it("handles undefined input safely", () => {
    const result = normalizePatternExtraction(undefined);
    expect(result.hook).toBe("");
    expect(result.confidence).toBe(0);
  });

  it("handles broken JSON object safely", () => {
    const raw = {
      hook: 123, // wrong type
      mainClaim: null,
      confidence: "not a number", // wrong type
      suggestedAccounts: "not an array"
    };

    const result = normalizePatternExtraction(raw);
    expect(result.hook).toBe(""); // coerced to empty
    expect(result.mainClaim).toBe(""); // coerced to empty
    expect(result.confidence).toBe(50); // fallback to 50
    expect(result.suggestedAccounts).toEqual([]); // invalid ignored
  });

  it("filters out invalid account handles from suggestedAccounts", () => {
    const raw = {
      hook: "x",
      mainClaim: "y",
      emotionalTrigger: "z",
      structure: "a",
      tone: "b",
      audience: "c",
      viralityReason: "d",
      suggestedAccounts: ["grafikcem", "invalid_handle", 42],
      suggestedPatterns: ["Test"],
      confidence: 70
    };

    const result = normalizePatternExtraction(raw);
    expect(result.suggestedAccounts).toEqual(["grafikcem"]);
  });

  it("clamps confidence to 0-100 range", () => {
    expect(
      normalizePatternExtraction({ confidence: 150 }).confidence
    ).toBe(100);
    expect(
      normalizePatternExtraction({ confidence: -30 }).confidence
    ).toBe(0);
  });

  it("provides default suggestedPatterns when none given", () => {
    const result = normalizePatternExtraction({
      hook: "x",
      suggestedPatterns: []
    });
    expect(result.suggestedPatterns).toEqual(["Genel Pattern"]);
  });

  it("stores rawJson reference", () => {
    const raw = { hook: "test", confidence: 80 };
    const result = normalizePatternExtraction(raw);
    expect(result.rawJson).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// extractPattern (async, uses fallback since AI is mocked to fail)
// ---------------------------------------------------------------------------

describe("extractPattern", () => {
  it("extracts pattern from grafikcem text via fallback", async () => {
    const result = await extractPattern({
      text: GRAFIKCEM_TEXT,
      accountHandle: "grafikcem"
    });

    expect(result.hook).toBeTruthy();
    expect(result.mainClaim).toBeTruthy();
    expect(result.suggestedAccounts).toContain("grafikcem");
    expect(result.confidence).toBeGreaterThanOrEqual(40);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it("throws ZodError for empty text", async () => {
    await expect(
      extractPattern({ text: "" })
    ).rejects.toThrow();
  });

  it("throws for invalid accountHandle", async () => {
    await expect(
      extractPattern({ text: "Test", accountHandle: "badhandle" })
    ).rejects.toThrow("Invalid accountHandle");
  });

  it("falls back gracefully when AI fails", async () => {
    // AI is mocked to reject — should still return a result
    const result = await extractPattern({
      text: MASKULENKOD_TEXT,
      accountHandle: "maskulenkod"
    });

    expect(result).toBeDefined();
    expect(result.hook).toBeTruthy();
    expect(result.suggestedAccounts).toContain("maskulenkod");
  });

  it("uses AI result when available", async () => {
    const { generateJsonGated } = await import("@/lib/ai/generateGated");
    const mockGenerateJson = vi.mocked(generateJsonGated);

    const aiResponse = {
      hook: "AI generated hook",
      mainClaim: "AI generated claim",
      emotionalTrigger: "merak",
      structure: "hook -> claim -> cta",
      tone: "editöryal",
      audience: "tasarımcılar",
      viralityReason: "Yeni bilgi içeriyor",
      suggestedAccounts: ["grafikcem"],
      suggestedPatterns: ["Workflow Değişimi"],
      confidence: 82
    };

    mockGenerateJson.mockResolvedValueOnce({
      data: aiResponse,
      model: "test-model",
      inputTokens: 100,
      outputTokens: 200,
      estimatedCostUsd: 0.001,
      actualCostUsd: 0.001
    });

    const result = await extractPattern({
      text: GRAFIKCEM_TEXT,
      accountHandle: "grafikcem"
    });

    expect(result.hook).toBe("AI generated hook");
    expect(result.mainClaim).toBe("AI generated claim");
    expect(result.confidence).toBe(82);
    expect(result.suggestedPatterns).toContain("Workflow Değişimi");
  });

  it("default sourceType is manual", async () => {
    const result = await extractPattern({ text: "Test metin bir şey" });
    // Should not throw — sourceType defaults to "manual"
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// patternExtractionToViralPatternInput
// ---------------------------------------------------------------------------

describe("patternExtractionToViralPatternInput", () => {
  const sampleResult: PatternExtractionResult = {
    hook: "Test hook cümlesi",
    mainClaim: "Test ana iddia",
    emotionalTrigger: "bunu bilmem gerekiyordu",
    structure: "hook -> claim -> context -> closing",
    tone: "editöryal",
    audience: "tasarımcılar",
    viralityReason: "Bilgi değeri yüksek",
    suggestedAccounts: ["grafikcem"],
    suggestedPatterns: ["Sessiz Değişim", "Workflow Değişimi"],
    confidence: 75
  };

  it("produces correct CreateViralPatternInput shape", () => {
    const input = patternExtractionToViralPatternInput(sampleResult, "account-123");

    expect(input.accountId).toBe("account-123");
    expect(input.patternName).toBe("Sessiz Değişim");
    expect(input.emotion).toBe("bunu bilmem gerekiyordu");
    expect(input.viralityTrigger).toBe("Bilgi değeri yüksek");
    expect(input.exampleGood).toBe("Test hook cümlesi");
    expect(input.successScore).toBe(75);
    expect(input.usageCount).toBe(0);
    expect(input.isActive).toBe(true);
  });

  it("structureJson contains extraction details", () => {
    const input = patternExtractionToViralPatternInput(sampleResult, "account-123");

    expect(input.structureJson).toBeDefined();
    expect(input.structureJson!.hook).toBe("Test hook cümlesi");
    expect(input.structureJson!.mainClaim).toBe("Test ana iddia");
    expect(input.structureJson!.tone).toBe("editöryal");
  });

  it("throws when accountId is empty", () => {
    expect(() =>
      patternExtractionToViralPatternInput(sampleResult, "")
    ).toThrow("accountId is required");
  });

  it("throws when accountId is whitespace", () => {
    expect(() =>
      patternExtractionToViralPatternInput(sampleResult, "   ")
    ).toThrow("accountId is required");
  });

  it("uses first suggestedPattern as patternName", () => {
    const resultWithPatterns: PatternExtractionResult = {
      ...sampleResult,
      suggestedPatterns: ["Hype Değil Kullanım Değeri"]
    };

    const input = patternExtractionToViralPatternInput(resultWithPatterns, "acc-1");
    expect(input.patternName).toBe("Hype Değil Kullanım Değeri");
  });

  it("uses fallback name when no patterns suggested", () => {
    const resultNoPatterns: PatternExtractionResult = {
      ...sampleResult,
      suggestedPatterns: []
    };

    const input = patternExtractionToViralPatternInput(resultNoPatterns, "acc-1");
    expect(input.patternName).toBe("Extracted Pattern");
  });

  it("hookType is 'extracted' when hook is non-empty", () => {
    const input = patternExtractionToViralPatternInput(sampleResult, "acc-1");
    expect(input.hookType).toBe("extracted");
  });

  it("hookType is 'unknown' when hook is empty", () => {
    const emptyHookResult: PatternExtractionResult = {
      ...sampleResult,
      hook: ""
    };
    const input = patternExtractionToViralPatternInput(emptyHookResult, "acc-1");
    expect(input.hookType).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Edge cases & integration
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("handles very short text", async () => {
    const result = await extractPattern({ text: "Kısa metin." });
    expect(result).toBeDefined();
    expect(result.hook).toBeTruthy();
    expect(result.confidence).toBeGreaterThanOrEqual(40);
  });

  it("handles very long text", async () => {
    const longText = "Bu bir test cümlesidir. ".repeat(100);
    const result = await extractPattern({ text: longText });
    expect(result).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(40);
  });

  it("handles text with special characters", async () => {
    const result = await extractPattern({
      text: 'Özel karakterler: ş, ç, ğ, ü, ö, ı. Tırnak: "test" ve \'test\'.'
    });
    expect(result).toBeDefined();
    expect(result.hook).toBeTruthy();
  });

  it("all ACCOUNT_HANDLES have patterns defined", () => {
    // Importing pattern catalog indirectly via fallback
    for (const handle of ACCOUNT_HANDLES) {
      const result = extractPatternSyncFallback({
        text: "Test metin ile pattern çıkarımı yapılıyor.",
        accountHandle: handle
      });
      expect(result.suggestedPatterns.length).toBeGreaterThanOrEqual(1);
    }
  });
});
