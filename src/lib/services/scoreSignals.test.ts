import { describe, it, expect } from "vitest";
import {
  extractSubSignals,
  applyQualityGate,
  TURKISH_NATURALNESS_MIN,
  type SubSignals,
} from "./scoreSignals";
import type { Leak } from "@/lib/growth-engine/leak-detector";

const fullWinner = {
  content: "x",
  mode: "hot_take",
  personaMatch: 85,
  turkishNaturalness: 90,
  hookStrength: 78,
  clarity: 82,
  novelty: 70,
  viralPotential: 80,
  risk: 12,
  sourceFaithfulness: 95,
  verdict: "approve" as const,
  reason: "ok",
  payoff: "save" as const,
};

const highLeak: Leak = { kind: "weak_hook", severity: "high", note: "Kanca çok zayıf." };
const medLeak: Leak = { kind: "generic", severity: "med", note: "Jenerik ifade." };

describe("extractSubSignals — scores şeması (FIRST-SPRINT item 7)", () => {
  const REQUIRED_KEYS: (keyof SubSignals)[] = [
    "personaMatch", "hookStrength", "clarity", "turkishNaturalness",
    "novelty", "risk", "sourceFaithfulness", "payoff", "leaks",
  ];

  it("8 alt-sinyal + payoff + leaks anahtarları HER ZAMAN mevcut", () => {
    const signals = extractSubSignals(fullWinner, [medLeak]);
    for (const key of REQUIRED_KEYS) {
      expect(signals).toHaveProperty(key);
    }
    expect(signals.novelty).toBe(70);
    expect(signals.leaks).toEqual([medLeak]);
  });

  it("eksik/bozuk winner alanları 0'a düşer, anahtar eksik KALMAZ", () => {
    const signals = extractSubSignals({}, []);
    for (const key of REQUIRED_KEYS) {
      expect(signals).toHaveProperty(key);
    }
    expect(signals.personaMatch).toBe(0);
    expect(signals.novelty).toBe(0);
    expect(signals.payoff).toBe("none");
    expect(signals.leaks).toEqual([]);
  });

  it("skorlar 0-100'e clamp edilir", () => {
    const signals = extractSubSignals({ ...fullWinner, risk: 250, clarity: -5 }, []);
    expect(signals.risk).toBe(100);
    expect(signals.clarity).toBe(0);
  });
});

describe("applyQualityGate — bloklayıcı kapı (FIRST-SPRINT item 8)", () => {
  it("yüksek-şiddet leak → needs_edit + Türkçe not", () => {
    const gate = applyQualityGate({
      leaks: [highLeak],
      judged: true,
      turkishNaturalness: 90,
      lintIssues: [],
    });
    expect(gate.status).toBe("needs_edit");
    expect(gate.notes.some((n) => n.includes("Yüksek riskli sızıntı"))).toBe(true);
    expect(gate.notes.some((n) => n.includes("Kanca çok zayıf"))).toBe(true);
  });

  it("orta/düşük şiddet leak tek başına gate'i tetiklemez", () => {
    const gate = applyQualityGate({
      leaks: [medLeak],
      judged: true,
      turkishNaturalness: 90,
      lintIssues: [],
    });
    expect(gate.status).toBe("new");
  });

  it("cap-altı turkishNaturalness (judged) → needs_edit + Türkçe neden", () => {
    const gate = applyQualityGate({
      leaks: [],
      judged: true,
      turkishNaturalness: TURKISH_NATURALNESS_MIN - 1,
      lintIssues: [],
    });
    expect(gate.status).toBe("needs_edit");
    expect(gate.notes.some((n) => n.includes("Türkçe doğallık düşük"))).toBe(true);
  });

  it("judge koşmadıysa (fast-path, skorlar 0) TR cap uygulanmaz", () => {
    const gate = applyQualityGate({
      leaks: [],
      judged: false,
      turkishNaturalness: 0,
      lintIssues: [],
    });
    expect(gate.status).toBe("new");
  });

  it("banned_phrase / question_cta lint bulgusu → needs_edit", () => {
    const gate = applyQualityGate({
      leaks: [],
      judged: true,
      turkishNaturalness: 90,
      lintIssues: [
        { code: "banned_phrase", severity: "warning", message: 'Yasak klişe ifade: "çığır açan".' },
      ],
    });
    expect(gate.status).toBe("needs_edit");
    expect(gate.notes[0]).toContain("çığır açan");
  });

  it("temiz taslak → new (gate sessiz)", () => {
    const gate = applyQualityGate({
      leaks: [],
      judged: true,
      turkishNaturalness: 88,
      lintIssues: [{ code: "url_present", severity: "warning", message: "URL var." }],
    });
    expect(gate.status).toBe("new");
    expect(gate.notes).toEqual([]);
  });
});
