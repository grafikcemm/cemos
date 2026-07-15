import { describe, expect, it } from "vitest";
import {
  PRIMARY_AREAS,
  ADVANCED_TABS,
  UTILITY_TABS,
  PROFILE_TABS,
  labelForTab,
  resolveAreaForTab,
  isAdvancedTab,
  isUtilityTab,
  isProfileTab,
} from "./navConfig";

/**
 * Nav yüzey bütünlüğü / drift guard: her CANLI sekme TAM BİR nav sınıfına
 * (birincil alan · advanced · utility · profil) aittir; etiketler tek-kaynak
 * TAB_LABELS ile tutarlıdır. navConfig.test.ts çözümleme fonksiyonlarını,
 * bu dosya sınıflandırma bütünlüğünü test eder.
 */

const PRIMARY_IDS = PRIMARY_AREAS.flatMap((a) => a.tabIds);
const ADVANCED_IDS = ADVANCED_TABS.map((t) => t.id);
const UTILITY_IDS = UTILITY_TABS.map((t) => t.id);
const PROFILE_IDS = PROFILE_TABS.map((t) => t.id);
const ALL_LIVE = [...PRIMARY_IDS, ...ADVANCED_IDS, ...UTILITY_IDS, ...PROFILE_IDS];

describe("nav yüzey sınıflandırması (drift guard)", () => {
  it("her canlı id benzersiz (dört sınıf çakışmaz)", () => {
    expect(new Set(ALL_LIVE).size).toBe(ALL_LIVE.length);
  });

  it("birincil sekmeler yalnız kendi alanına çözülür, diğer sınıflara değil", () => {
    for (const id of PRIMARY_IDS) {
      expect(resolveAreaForTab(id), `${id} bir alana çözülmeli`).not.toBeNull();
      expect(isAdvancedTab(id)).toBe(false);
      expect(isUtilityTab(id)).toBe(false);
      expect(isProfileTab(id)).toBe(false);
    }
  });

  it("advanced sekmeler hiçbir birincil alana ait değil", () => {
    for (const id of ADVANCED_IDS) {
      expect(resolveAreaForTab(id), `${id} birincil alana ait olmamalı`).toBeNull();
      expect(isAdvancedTab(id)).toBe(true);
      expect(isUtilityTab(id)).toBe(false);
      expect(isProfileTab(id)).toBe(false);
    }
  });

  it("utility (Toolbox) ile profil sınıfları ayrık", () => {
    for (const id of UTILITY_IDS) {
      expect(isUtilityTab(id)).toBe(true);
      expect(isProfileTab(id)).toBe(false);
    }
    for (const id of PROFILE_IDS) {
      expect(isProfileTab(id)).toBe(true);
      expect(isUtilityTab(id)).toBe(false);
    }
  });

  it("Toolbox tek utility; Profil tam beş yüzey", () => {
    expect(UTILITY_IDS).toEqual(["toolbox"]);
    expect(PROFILE_IDS).toEqual([
      "profile-memory",
      "profile-integrations",
      "system",
      "costs",
      "settings",
    ]);
  });
});

describe("etiket tutarlılığı (tek-kaynak TAB_LABELS)", () => {
  it("her canlı id boş olmayan etiket döndürür", () => {
    for (const id of ALL_LIVE) {
      const label = labelForTab(id);
      expect(label, `${id} etiketsiz`).toBeTruthy();
      expect(label).not.toBe(id); // ham id sızmamalı
    }
  });

  it("typed dizilerdeki etiketler labelForTab ile aynı", () => {
    for (const t of ADVANCED_TABS) expect(t.label).toBe(labelForTab(t.id));
    for (const t of UTILITY_TABS) expect(t.label).toBe(labelForTab(t.id));
    for (const t of PROFILE_TABS) expect(t.label).toBe(labelForTab(t.id));
  });
});
