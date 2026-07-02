import { describe, it, expect } from "vitest";
import {
  accountProfiles,
  resolveFormatTier,
  effectiveMaxChars,
  selectMode,
  isKnownMode,
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

  it("non-thread standard modes resolve to a tier capped at or below 280", () => {
    for (const profile of Object.values(accountProfiles)) {
      for (const mode of profile.modes) {
        const tier = resolveFormatTier(profile, mode.id);
        // thread + premium dwell-time tiers (thunder/mega) are intentionally long.
        if (tier.id === "thread" || tier.requiresPremium) continue;
        // punch/micro are the short tiers used for standard single-tweet modes.
        expect(tier.maxChars).toBeLessThanOrEqual(280);
      }
    }
  });
});

describe("selectMode + isKnownMode (DH-002 mode selection)", () => {
  it("isKnownMode is true only for real mode ids", () => {
    const p = accountProfiles.grafikcem;
    expect(isKnownMode(p, p.modes[0].id)).toBe(true);
    expect(isKnownMode(p, "nope")).toBe(false);
    expect(isKnownMode(p, undefined)).toBe(false);
    expect(isKnownMode(p, null)).toBe(false);
  });

  it("never selects a mode whose tier is the accidental micro(140) default", () => {
    for (const profile of Object.values(accountProfiles)) {
      const mode = selectMode(profile);
      const tier = resolveFormatTier(profile, mode.id);
      expect(tier.id).not.toBe("micro");
    }
  });

  it("rotates across the rotatable pool by seed for variety", () => {
    const p = accountProfiles.grafikcem;
    // selectMode rotation excludes micro + premium (thunder/mega) tiers.
    const pool = p.modes.filter((m) => {
      if (m.format === "micro") return false;
      return !FORMAT_TIERS[m.format]?.requiresPremium;
    });
    expect(selectMode(p, { seed: 0 }).id).toBe(pool[0].id);
    expect(selectMode(p, { seed: 1 }).id).toBe(pool[1 % pool.length].id);
    // Premium tiers never surface in the default rotation.
    for (let seed = 0; seed < 20; seed++) {
      expect(resolveFormatTier(p, selectMode(p, { seed }).id).requiresPremium).toBeFalsy();
    }
  });

  it("prefers a repo/source mode for repo-flavored sources", () => {
    const p = accountProfiles.grafikcem; // has a repo_kaynak mode
    const mode = selectMode(p, { sourceType: "github_repo" });
    expect(/repo|kaynak/.test(mode.id)).toBe(true);
  });
});
