import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLiveEvalGate, isOpenRouterKeyRotated } from "./liveGates";

/**
 * Canlı eval güvenlik kapıları (ADR-034 §J) — dört koşul birlikte gerekli;
 * default'lar KAPALI; tavan 0.50 USD'yi aşamaz.
 */

const KEYS = [
  "OPENROUTER_KEY_ROTATED_AT",
  "AI_EVAL_SPEND_ENABLED",
  "PHASE2E_LIVE_EVAL_APPROVED",
  "PHASE2E_LIVE_MAX_USD",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function openAllGates() {
  process.env.OPENROUTER_KEY_ROTATED_AT = "2026-07-17T00:00:00Z";
  process.env.AI_EVAL_SPEND_ENABLED = "true";
  process.env.PHASE2E_LIVE_EVAL_APPROVED = "true";
  process.env.PHASE2E_LIVE_MAX_USD = "0.25";
}

describe("liveGates (ADR-034 §J)", () => {
  it("default (hiç env yok) → KAPALI, dört eksik", () => {
    const gate = getLiveEvalGate();
    expect(gate.allowed).toBe(false);
    expect(gate.maxUsd).toBe(0);
    expect(gate.missing).toEqual([
      "OPENROUTER_KEY_ROTATED_AT",
      "AI_EVAL_SPEND_ENABLED",
      "PHASE2E_LIVE_EVAL_APPROVED",
      "PHASE2E_LIVE_MAX_USD",
    ]);
  });

  it("rotasyon marker'ı tek başına yetmez", () => {
    process.env.OPENROUTER_KEY_ROTATED_AT = "2026-07-17";
    const gate = getLiveEvalGate();
    expect(isOpenRouterKeyRotated()).toBe(true);
    expect(gate.allowed).toBe(false);
    expect(gate.missing).not.toContain("OPENROUTER_KEY_ROTATED_AT");
  });

  it("dört kapı birlikte → AÇIK, tavan aynen", () => {
    openAllGates();
    const gate = getLiveEvalGate();
    expect(gate.allowed).toBe(true);
    expect(gate.missing).toEqual([]);
    expect(gate.maxUsd).toBe(0.25);
  });

  it("tavan 0.50'yi aşarsa geçersiz (mutlak üst sınır)", () => {
    openAllGates();
    process.env.PHASE2E_LIVE_MAX_USD = "0.51";
    const gate = getLiveEvalGate();
    expect(gate.allowed).toBe(false);
    expect(gate.missing).toContain("PHASE2E_LIVE_MAX_USD");
  });

  it("tavan 0 veya sayı-dışı → geçersiz", () => {
    openAllGates();
    for (const bad of ["0", "-1", "abc", ""]) {
      process.env.PHASE2E_LIVE_MAX_USD = bad;
      expect(getLiveEvalGate().allowed, `PHASE2E_LIVE_MAX_USD=${bad}`).toBe(false);
    }
  });

  it("boşluk-dolu rotasyon marker'ı mevcut SAYILMAZ", () => {
    process.env.OPENROUTER_KEY_ROTATED_AT = "   ";
    expect(isOpenRouterKeyRotated()).toBe(false);
  });
});
