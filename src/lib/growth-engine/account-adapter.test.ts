import { describe, it, expect } from "vitest";
import {
  getScoringIdentity,
  getAllScoringIdentities,
  getForbiddenTermsFromLive,
  isKnownAccountHandle,
} from "./account-adapter";
import { accountProfiles } from "@/lib/accounts";

describe("account-adapter — tek hesap kimliği (FIRST-SPRINT item 6)", () => {
  it("her canlı hesap için scoring identity üretir", () => {
    const identities = getAllScoringIdentities();
    expect(identities.map((i) => i.handle).sort()).toEqual(["grafikcem", "maskulenkod"]);
  });

  it("identity alanları CANLI accounts.ts profilinden türetilir (kopya değil)", () => {
    const id = getScoringIdentity("grafikcem");
    const live = accountProfiles.grafikcem;
    expect(id.persona).toBe(live.persona);
    expect(id.maxChars).toBe(live.maxChars);
    expect(id.forbidden).toEqual(live.forbiddenRules);
    expect(id.pillarIds).toEqual(live.modes.map((m) => m.id));
    // Ton/format kural listelerinden birleştirilir.
    for (const rule of live.toneRules) expect(id.tone).toContain(rule);
  });

  it("scoring identity şekli: scorer'ın ihtiyaç duyduğu tüm alanlar mevcut", () => {
    for (const id of getAllScoringIdentities()) {
      expect(typeof id.persona).toBe("string");
      expect(typeof id.tone).toBe("string");
      expect(typeof id.format).toBe("string");
      expect(typeof id.viralMechanic).toBe("string");
      expect(typeof id.maxChars).toBe("number");
      expect(Array.isArray(id.forbidden)).toBe(true);
      expect(Array.isArray(id.pillarIds)).toBe(true);
      expect(id.pillarIds.length).toBeGreaterThan(0);
      expect(typeof id.noHashtags).toBe("boolean");
    }
  });

  it("bilinmeyen handle reddedilir", () => {
    expect(isKnownAccountHandle("pixelspor")).toBe(false);
    expect(() => getScoringIdentity("pixelspor")).toThrow(/Bilinmeyen hesap/);
  });

  it("getForbiddenTermsFromLive eşlenebilir kısa terimler döndürür (fold'lu)", () => {
    const terms = getForbiddenTermsFromLive("maskulenkod");
    expect(terms).toContain("terapist dili");
    expect(terms).toContain("kisisel gelisim klisesi");
    // Cümle formatındaki canlı kural DEĞİL, substring-eşlenebilir terim.
    expect(terms.every((t) => !t.endsWith("."))).toBe(true);
  });

  it("fold'lu eşleşme: gerçek Türkçe yazım ASCII kuralı bulur", async () => {
    const { foldTurkish } = await import("./account-adapter");
    expect(foldTurkish("Kişisel gelişim klişesi")).toBe("kisisel gelisim klisesi");
    expect(foldTurkish("İNANILMAZ")).toBe("inanilmaz");
  });
});
