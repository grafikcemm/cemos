import { describe, it, expect } from "vitest";
import { detectLeaks } from "./leak-detector";

const GRAFIKCEM_PILLARS = ["tool_spotlight", "visual_drop", "hot_take", "thread", "repo_kaynak"];

describe("detectLeaks", () => {
  it("returns no leaks for a clean, on-pillar draft with a payoff", () => {
    const leaks = detectLeaks({
      content: "OpenWA çıktı: Twilio faturasını sıfıra çekiyor, tek Docker komutu.",
      mode: "tool_spotlight",
      payoff: "save",
      hookStrength: 80,
      knownPillars: GRAFIKCEM_PILLARS,
    });
    expect(leaks).toEqual([]);
  });

  it("flags weak_hook med below 55 and high below 40", () => {
    const med = detectLeaks({ content: "x", mode: "hot_take", payoff: "reply", hookStrength: 50, knownPillars: GRAFIKCEM_PILLARS });
    expect(med.find((l) => l.kind === "weak_hook")?.severity).toBe("med");

    const high = detectLeaks({ content: "x", mode: "hot_take", payoff: "reply", hookStrength: 30, knownPillars: GRAFIKCEM_PILLARS });
    expect(high.find((l) => l.kind === "weak_hook")?.severity).toBe("high");
  });

  it("skips weak_hook entirely when hookStrength is undefined (not judged)", () => {
    const leaks = detectLeaks({ content: "OpenWA 4 sent", mode: "tool_spotlight", payoff: "save", knownPillars: GRAFIKCEM_PILLARS });
    expect(leaks.some((l) => l.kind === "weak_hook")).toBe(false);
  });

  it("flags no_payoff high for a high-leverage mode, med otherwise", () => {
    const thread = detectLeaks({ content: "uzun döküm 7 madde", mode: "thread", payoff: "none", hookStrength: 80, knownPillars: GRAFIKCEM_PILLARS });
    expect(thread.find((l) => l.kind === "no_payoff")?.severity).toBe("high");

    const hot = detectLeaks({ content: "kısa görüş 12", mode: "hot_take", payoff: "none", hookStrength: 80, knownPillars: GRAFIKCEM_PILLARS });
    expect(hot.find((l) => l.kind === "no_payoff")?.severity).toBe("med");
  });

  it("flags off_pillar high when mode is not a known pillar", () => {
    const leaks = detectLeaks({ content: "Spor yorumu 1-0", mode: "futbol", payoff: "reply", hookStrength: 80, knownPillars: GRAFIKCEM_PILLARS });
    expect(leaks.find((l) => l.kind === "off_pillar")?.severity).toBe("high");
  });

  it("flags off_pillar low when on-pillar but no concept keyword hit", () => {
    const leaks = detectLeaks({
      content: "Bugün hava çok güzel ve sakin geçti.",
      mode: "hot_take",
      payoff: "reply",
      hookStrength: 80,
      knownPillars: GRAFIKCEM_PILLARS,
      conceptKeywords: ["ai", "tasarım", "araç"],
    });
    expect(leaks.find((l) => l.kind === "off_pillar")?.severity).toBe("low");
  });

  it("flags naked_link high when a URL has almost no context", () => {
    const leaks = detectLeaks({ content: "https://github.com/foo/bar", mode: "repo_kaynak", payoff: "save", hookStrength: 80, knownPillars: GRAFIKCEM_PILLARS });
    expect(leaks.find((l) => l.kind === "naked_link")?.severity).toBe("high");
  });

  it("flags generic low only when requireConcreteAnchor and no anchor", () => {
    const generic = detectLeaks({
      content: "yapay zeka iş akışını tamamen dönüştürüyor ve her şeyi kolaylaştırıyor",
      mode: "hot_take",
      payoff: "reply",
      hookStrength: 80,
      knownPillars: GRAFIKCEM_PILLARS,
      requireConcreteAnchor: true,
    });
    expect(generic.some((l) => l.kind === "generic")).toBe(true);

    const anchored = detectLeaks({
      content: "ChatGPT aylık 20$ alıyor; aynı işi 0₺ açık kaynakla yaptım",
      mode: "hot_take",
      payoff: "reply",
      hookStrength: 80,
      knownPillars: GRAFIKCEM_PILLARS,
      requireConcreteAnchor: true,
    });
    expect(anchored.some((l) => l.kind === "generic")).toBe(false);
  });
});
