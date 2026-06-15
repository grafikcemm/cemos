import { describe, it, expect } from "vitest";
import {
  accountProfiles,
  resolveFormatTier,
  effectiveMaxChars,
  FORMAT_TIERS,
} from "./accounts";

describe("accounts format tiers", () => {
  it("every mode maps to a defined format tier", () => {
    for (const profile of Object.values(accountProfiles)) {
      for (const mode of profile.modes) {
        expect(FORMAT_TIERS[mode.format]).toBeDefined();
      }
    }
  });

  it("resolveFormatTier returns the mode's tier when the mode exists", () => {
    const tier = resolveFormatTier(accountProfiles.grafikcem, "thread");
    expect(tier.id).toBe("thread");
  });

  it("resolveFormatTier falls back to the first allowed format for unknown modes", () => {
    const profile = accountProfiles.grafikcem;
    const tier = resolveFormatTier(profile, "nonexistent_mode");
    expect(tier.id).toBe(profile.formats[0]);
  });

  it("effectiveMaxChars uses the tier band for fixed tiers", () => {
    expect(effectiveMaxChars(accountProfiles.grafikcem, FORMAT_TIERS.punch)).toBe(280);
  });

  it("effectiveMaxChars falls back to account maxChars for the variable thread tier", () => {
    const profile = accountProfiles.grafikcem;
    expect(effectiveMaxChars(profile, FORMAT_TIERS.thread)).toBe(profile.maxChars);
  });

  it("non-thread modes resolve to a tier capped at or below 280", () => {
    for (const profile of Object.values(accountProfiles)) {
      for (const mode of profile.modes) {
        if (mode.format === "thread") continue;
        const tier = resolveFormatTier(profile, mode.id);
        // punch/micro are the short tiers used for single-tweet modes.
        expect(tier.maxChars).toBeLessThanOrEqual(280);
      }
    }
  });
});
