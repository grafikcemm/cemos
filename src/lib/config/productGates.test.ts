import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  INSTAGRAM_GENERATION_MAX_USD_CEILING,
  getInstagramGenerationGate,
} from "./productGates";

/** Ürün üretim kapısı (ADR-036) — eval kapısından ayrı; default kapalı. */

const KEYS = [
  "OPENROUTER_KEY_ROTATED_AT",
  "INSTAGRAM_GENERATION_ENABLED",
  "INSTAGRAM_GENERATION_LIVE_APPROVED",
  "INSTAGRAM_GENERATION_MAX_USD",
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

function openAll() {
  process.env.OPENROUTER_KEY_ROTATED_AT = "2026-07-17T00:00:00Z";
  process.env.INSTAGRAM_GENERATION_ENABLED = "true";
  process.env.INSTAGRAM_GENERATION_LIVE_APPROVED = "true";
  process.env.INSTAGRAM_GENERATION_MAX_USD = "0.40";
}

describe("getInstagramGenerationGate", () => {
  it("hiçbir env yokken kapalı; dört eksik ad listelenir, değer yok", () => {
    const g = getInstagramGenerationGate();
    expect(g.allowed).toBe(false);
    expect(g.maxUsd).toBe(0);
    expect(g.missing).toEqual([
      "OPENROUTER_KEY_ROTATED_AT",
      "INSTAGRAM_GENERATION_ENABLED",
      "INSTAGRAM_GENERATION_LIVE_APPROVED",
      "INSTAGRAM_GENERATION_MAX_USD",
    ]);
  });

  it("rotasyon eksikken diğer üçü açık olsa bile kapalı", () => {
    openAll();
    delete process.env.OPENROUTER_KEY_ROTATED_AT;
    const g = getInstagramGenerationGate();
    expect(g.allowed).toBe(false);
    expect(g.missing).toEqual(["OPENROUTER_KEY_ROTATED_AT"]);
  });

  it("enabled/approved 'true' dışı her değer kapalı sayılır", () => {
    openAll();
    process.env.INSTAGRAM_GENERATION_ENABLED = "1";
    expect(getInstagramGenerationGate().missing).toContain("INSTAGRAM_GENERATION_ENABLED");
    process.env.INSTAGRAM_GENERATION_ENABLED = "true";
    process.env.INSTAGRAM_GENERATION_LIVE_APPROVED = "yes";
    expect(getInstagramGenerationGate().missing).toContain("INSTAGRAM_GENERATION_LIVE_APPROVED");
  });

  it("max usd: 0, negatif, NaN ve tavan üstü geçersiz", () => {
    openAll();
    for (const bad of ["0", "-1", "abc", "0.51", "5"]) {
      process.env.INSTAGRAM_GENERATION_MAX_USD = bad;
      const g = getInstagramGenerationGate();
      expect(g.allowed, `max=${bad}`).toBe(false);
      expect(g.missing).toEqual(["INSTAGRAM_GENERATION_MAX_USD"]);
    }
  });

  it("dört koşul tamken açık; maxUsd geçer, tavan 0.50", () => {
    openAll();
    const g = getInstagramGenerationGate();
    expect(g).toEqual({ allowed: true, missing: [], maxUsd: 0.4 });
    expect(INSTAGRAM_GENERATION_MAX_USD_CEILING).toBe(0.5);
  });

  it("eval kapısı env'leri üretim kapısını AÇMAZ (ayrım korunur)", () => {
    process.env.OPENROUTER_KEY_ROTATED_AT = "2026-07-17T00:00:00Z";
    process.env.AI_EVAL_SPEND_ENABLED = "true";
    process.env.PHASE2E_LIVE_EVAL_APPROVED = "true";
    process.env.PHASE2E_LIVE_MAX_USD = "0.5";
    const g = getInstagramGenerationGate();
    expect(g.allowed).toBe(false);
    expect(g.missing).toContain("INSTAGRAM_GENERATION_ENABLED");
    delete process.env.AI_EVAL_SPEND_ENABLED;
    delete process.env.PHASE2E_LIVE_EVAL_APPROVED;
    delete process.env.PHASE2E_LIVE_MAX_USD;
  });
});
