import { describe, it, expect } from "vitest";
import { X_COUNCIL_SPEC } from "@/lib/agents/council-config";
import { accountProfiles } from "@/lib/accounts";

const lens = (name: string) => {
  const found = X_COUNCIL_SPEC.lenses.find((l) => l.lens === name);
  if (!found) throw new Error(`lens ${name} missing`);
  return found;
};

describe("X_COUNCIL_SPEC", () => {
  it("has the 4 lenses in order with the original weights and defaults", () => {
    expect(X_COUNCIL_SPEC.lenses.map((l) => l.lens)).toEqual(["hook", "persona", "risk", "novelty"]);
    expect(X_COUNCIL_SPEC.lenses.map((l) => l.weight)).toEqual([0.3, 0.3, 0.2, 0.2]);
    expect(X_COUNCIL_SPEC.lenses.map((l) => l.defaultScore)).toEqual([55, 55, 70, 55]);
  });

  it("keeps the synthesis thresholds at 70/45", () => {
    expect(X_COUNCIL_SPEC.strongAt).toBe(70);
    expect(X_COUNCIL_SPEC.maybeAt).toBe(45);
  });

  it("builds the exact hook/risk/novelty instructions (golden, byte-identical)", () => {
    expect(lens("hook").buildInstruction("grafikcem")).toBe(
      `Bu içerik @grafikcem için ne kadar güçlü bir HOOK/viral potansiyel taşıyor? (0=zayıf, 100=patlama). Tek cümle gerekçe.`
    );
    expect(lens("risk").buildInstruction("grafikcem")).toBe(
      `Bu içeriğe dayalı bir tweet @grafikcem için ne kadar GÜVENLİ? (100=tamamen güvenli, 0=hakaret/iftira/asılsız iddia riski yüksek). Tek cümle gerekçe.`
    );
    expect(lens("novelty").buildInstruction("grafikcem")).toBe(
      `Bu içerik ne kadar ÖZGÜN/taze/zamanlı? (0=bayat klişe, 100=yeni ve dikkat çekici). Tek cümle gerekçe.`
    );
  });

  it("persona instruction interpolates the live account profile", () => {
    const p = accountProfiles.grafikcem;
    expect(lens("persona").buildInstruction("grafikcem")).toBe(
      `Bu içerik @grafikcem personasına ("${p.persona}", konsept: ${p.concept}) ne kadar uyuyor? (0=alakasız, 100=tam ses). Tek cümle gerekçe.`
    );
  });
});
