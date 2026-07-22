import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertSelectionsBoundToInput,
  CuratorInputSchema,
  runAgentCuration,
  runDeterministicCuration,
} from "./opportunityCurator";
import { AgentBlockedError } from "./types";
import { fixtureById } from "./fixtures";

/**
 * Opportunity Curator fixture-eval paketi (ADR-027 §11) — ücretsiz, ağ yok.
 */

function parseFixture(id: string) {
  const fx = fixtureById(id);
  if (!fx) throw new Error(`fixture yok: ${id}`);
  return CuratorInputSchema.parse(fx.input);
}

beforeEach(() => {
  delete process.env.ENABLE_AGENT_CURATION;
  delete process.env.OPENROUTER_KEY_ROTATED_AT;
});

describe("deterministik kürasyon (güvenli fallback)", () => {
  it("sıralama deterministik ve skor-azalan", () => {
    const input = parseFixture("curation-basic");
    const a = runDeterministicCuration(input);
    const b = runDeterministicCuration(input);
    expect(a).toEqual(b); // aynı girdi → bit-bit aynı çıktı
    const scores = a.selections.map((s) => s.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
    expect(a.method).toBe("deterministic");
  });

  it("her seçim giriş adaylarından birine bağlı + 5 gerekçe alanı dolu", () => {
    const input = parseFixture("curation-basic");
    const out = runDeterministicCuration(input);
    expect(() => assertSelectionsBoundToInput(input, out)).not.toThrow();
    for (const s of out.selections) {
      expect(s.reasons.personaFit.length).toBeGreaterThan(0);
      expect(s.reasons.freshness.length).toBeGreaterThan(0);
      expect(s.reasons.sourceDiversity.length).toBeGreaterThan(0);
      expect(s.reasons.concreteness.length).toBeGreaterThan(0);
      expect(s.reasons.risk.length).toBeGreaterThan(0);
    }
  });

  it("yetersiz örneklem çarpanı buzz'a şişirilmez (insufficient ×9 taze aday, ×3.2'yi geçemez)", () => {
    const input = parseFixture("curation-insufficient-sample");
    const out = runDeterministicCuration(input);
    const insufficient = out.selections.find((s) => s.sourceId === "radar-insufficient");
    const normal = out.selections.find((s) => s.sourceId === "radar-1");
    expect(insufficient).toBeTruthy();
    expect(normal).toBeTruthy();
    // ×9 çarpan insufficient işaretli → buzz'a çevrilmez; ×3.2 gerçek outlier
    // daha eski olmasına rağmen buzz avantajıyla önde kalmalı.
    expect(normal!.score).toBeGreaterThan(insufficient!.score);
    expect(insufficient!.reasons.concreteness).toContain("Yetersiz örneklem");
  });

  it("kaynak-başına tavan uygulanır", () => {
    const input = parseFixture("curation-source-cap");
    const out = runDeterministicCuration(input);
    const newsCount = out.selections.filter((s) => s.sourceId.startsWith("news")).length;
    expect(newsCount).toBeLessThanOrEqual(2);
  });
});

describe("LLM kürasyon yolu (kapalı — blocked-external)", () => {
  it("flag kapalıyken AgentBlockedError; ağ çağrısı YOK", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const input = parseFixture("curation-basic");
    await expect(runAgentCuration(input)).rejects.toThrow(AgentBlockedError);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("Faz 2E: flag açık ama rotasyon marker'ı yok → openrouter_key_not_rotated; ağ çağrısı YOK", async () => {
    process.env.ENABLE_AGENT_CURATION = "1";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const input = parseFixture("curation-basic");
    await expect(runAgentCuration(input)).rejects.toMatchObject({
      reason: "openrouter_key_not_rotated",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("uydurma sourceId fail-closed reddedilir", () => {
    const input = parseFixture("curation-basic");
    const hallucinated = {
      method: "agent" as const,
      selections: [
        {
          sourceId: "uydurma-id-999",
          score: 99,
          reasons: {
            personaFit: "x",
            freshness: "x",
            sourceDiversity: "x",
            concreteness: "x",
            risk: "x",
          },
        },
      ],
    };
    expect(() => assertSelectionsBoundToInput(input, hallucinated)).toThrow(/geçersiz sourceId/);
  });
});
