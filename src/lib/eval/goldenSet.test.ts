import { describe, it, expect } from "vitest";
import { buildGoldenSeedCases } from "./goldenSet";
import { scoreDraftFallback } from "@/lib/growth-engine/scorer";

/**
 * Golden set standı (FIRST-SPRINT item 19) — LLM'siz doğrulama:
 * seed verisi + score_direct kapısının kendisi deterministik test edilir.
 * `eval:run --all` (generation testleri) gerçek LLM + DB ister; oradaki
 * doğrulama ayrı raporlanır.
 */
describe("eval golden set (item 19)", () => {
  const cases = buildGoldenSeedCases();

  it("toplam vaka sayısı ≥ 40 (kabul kriteri)", () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });

  it("her iki hesap da iyi + kötü vakalara sahip", () => {
    for (const handle of ["grafikcem", "maskulenkod"] as const) {
      const forAccount = cases.filter((c) => c.accountHandle === handle);
      expect(forAccount.filter((c) => c.kind === "good_generate").length).toBeGreaterThanOrEqual(4);
      expect(forAccount.filter((c) => c.kind === "good_direct").length).toBeGreaterThanOrEqual(9);
      expect(forAccount.filter((c) => c.kind === "bad_direct").length).toBe(10);
    }
  });

  it("her vaka PASS satırı taşır; direct vakalar MODE: score_direct işaretli", () => {
    for (const c of cases) {
      expect(c.expectedBehavior, c.testName).toMatch(/PASS:/);
      if (c.kind !== "good_generate") {
        expect(c.expectedBehavior, c.testName).toMatch(/MODE:\s*score_direct/);
      }
    }
  });

  it("testName benzersiz (idempotent seed anahtarı)", () => {
    const names = cases.map((c) => c.testName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("bilinen-KÖTÜ vakalar deterministik skorlayıcıda DÜŞÜK skorlar (publish<=55 OR risk>=45)", () => {
    const bad = cases.filter((c) => c.kind === "bad_direct");
    for (const c of bad) {
      const score = scoreDraftFallback({
        content: c.sourceContent,
        accountHandle: c.accountHandle,
      });
      const lowEnough = score.publishScore <= 55 || score.riskScore >= 45;
      expect(
        lowEnough,
        `${c.testName}: publish=${score.publishScore} risk=${score.riskScore}\n"${c.sourceContent.slice(0, 60)}..."`,
      ).toBe(true);
    }
  });

  it("bilinen-İYİ direct vakalar deterministik skorlayıcıda geçer (publish>=50, risk<=40)", () => {
    const good = cases.filter((c) => c.kind === "good_direct");
    for (const c of good) {
      const score = scoreDraftFallback({
        content: c.sourceContent,
        accountHandle: c.accountHandle,
      });
      expect(
        score.publishScore >= 50 && score.riskScore <= 40,
        `${c.testName}: publish=${score.publishScore} risk=${score.riskScore}\n"${c.sourceContent.slice(0, 60)}..."`,
      ).toBe(true);
    }
  });
});
