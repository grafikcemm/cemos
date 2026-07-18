import { describe, it, expect } from "vitest";
import {
  buildRepetitionHistogram,
  matchesAnyTopic,
  isExactTopicMatch,
  REPEAT_PILLAR_WARN,
  REPEAT_TOOL_WARN,
  type RepetitionSignal,
} from "./repetition";

function sig(partial: Partial<RepetitionSignal> & { pillar: string }): RepetitionSignal {
  return {
    seriesKey: null,
    topic: "",
    origin: "new",
    ...partial,
  };
}

describe("isExactTopicMatch — Türkçe normalize", () => {
  it("büyük/küçük + Türkçe karakter farkı aynı sayılır", () => {
    expect(isExactTopicMatch("Görsel Üretim", "gorsel uretim")).toBe(true);
    expect(isExactTopicMatch("ChatGPT ipuçları", "midjourney rehberi")).toBe(false);
  });
  it("boş string eşleşmez", () => {
    expect(isExactTopicMatch("", "")).toBe(false);
  });
});

describe("matchesAnyTopic", () => {
  it("near-duplicate konuyu bulur", () => {
    const hit = matchesAnyTopic("en iyi yapay zeka araçları 2026", [
      "en iyi yapay zeka araclari 2026",
    ]);
    expect(hit).not.toBeNull();
  });
  it("ilgisiz konu null döner", () => {
    expect(matchesAnyTopic("palet uyumu", ["video kurgu ipuçları"])).toBeNull();
  });
});

describe("buildRepetitionHistogram — çok boyut", () => {
  it("pillar eşiği aşınca uyarı üretir (ay + geçmiş toplamı)", () => {
    const signals: RepetitionSignal[] = [];
    for (let i = 0; i < REPEAT_PILLAR_WARN; i++) {
      signals.push(sig({ pillar: "arac_testi", origin: i < 2 ? "new" : "history" }));
    }
    const h = buildRepetitionHistogram(signals);
    expect(h.byPillar["arac_testi"]).toBe(REPEAT_PILLAR_WARN);
    expect(h.findings.some((f) => f.dimension === "pillar" && f.key === "arac_testi")).toBe(true);
  });

  it("aynı canonical araç URL'i farklı yazımlarda tek anahtar sayılır", () => {
    const signals: RepetitionSignal[] = [
      sig({ pillar: "a", toolUrl: "https://www.midjourney.com/" }),
      sig({ pillar: "b", toolUrl: "http://midjourney.com" }),
    ];
    const h = buildRepetitionHistogram(signals);
    expect(h.byTool["midjourney.com"]).toBe(REPEAT_TOOL_WARN);
    expect(h.findings.some((f) => f.dimension === "tool")).toBe(true);
  });

  it("near-duplicate konular tek kümede toplanır", () => {
    const signals: RepetitionSignal[] = [
      sig({ pillar: "a", topic: "en iyi yapay zeka araçları" }),
      sig({ pillar: "b", topic: "en iyi yapay zeka araclari" }),
      sig({ pillar: "c", topic: "renk paleti uyumu" }),
    ];
    const h = buildRepetitionHistogram(signals);
    const cluster = h.topicClusters.find((c) => c.count >= 2);
    expect(cluster).toBeDefined();
    expect(h.findings.some((f) => f.dimension === "topic")).toBe(true);
  });

  it("çeşitli sinyaller uyarı üretmez", () => {
    const signals: RepetitionSignal[] = [
      sig({ pillar: "a", topic: "konu bir" }),
      sig({ pillar: "b", topic: "konu iki" }),
      sig({ pillar: "c", topic: "konu uc" }),
    ];
    const h = buildRepetitionHistogram(signals);
    expect(h.findings).toHaveLength(0);
  });

  it("deterministik — aynı girdi aynı histogram", () => {
    const signals: RepetitionSignal[] = [
      sig({ pillar: "a", topic: "x", seriesKey: "s1" }),
      sig({ pillar: "a", topic: "y", seriesKey: "s1" }),
    ];
    expect(buildRepetitionHistogram(signals)).toEqual(buildRepetitionHistogram(signals));
  });
});
