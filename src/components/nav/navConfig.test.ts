import { describe, it, expect } from "vitest";
import {
  PRIMARY_AREAS,
  ADVANCED_TABS,
  UTILITY_TABS,
  PROFILE_TABS,
  TAB_ALIASES,
  AREA_ALIASES,
  normalizeTabId,
  normalizeAreaId,
  labelForTab,
  resolveAreaForTab,
  isAdvancedTab,
  advancedMeta,
  isUtilityTab,
  isProfileTab,
  highlightAreaForTab,
  firstTabOfArea,
  subTabsOfArea,
  seedTargetForTab,
  allNavigableTabs,
} from "./navConfig";

/** Tüm CANLI (doğrudan render edilebilir) tab id'leri. */
const LIVE_IDS = new Set<string>([
  ...PRIMARY_AREAS.flatMap((a) => a.tabIds),
  ...ADVANCED_TABS.map((t) => t.id),
  ...UTILITY_TABS.map((t) => t.id),
  ...PROFILE_TABS.map((t) => t.id),
]);

/** REDESIGNED-ADVANCED id'leri — asla alias'lanmaz, migration'da değişmez. */
const ADVANCED_IDS = ["news-pool", "youtube", "flow-radar", "discovery-engine", "source-intelligence"];

describe("PRIMARY_AREAS (3-görevli IA)", () => {
  it("üç birincil alan: Bugün/Plan/Kütüphane", () => {
    expect(PRIMARY_AREAS.map((a) => a.id)).toEqual(["bugun", "plan", "kutuphane"]);
  });

  it("alan sekmeleri beklenen id'ler", () => {
    expect(subTabsOfArea("bugun").map((t) => t.id)).toEqual(["morning"]);
    expect(subTabsOfArea("plan").map((t) => t.id)).toEqual([
      "plan-takvim",
      "plan-firsatlar",
      "plan-seriler",
    ]);
    expect(subTabsOfArea("kutuphane").map((t) => t.id)).toEqual([
      "lib-tumu",
      "lib-ilham",
      "lib-ogrenme",
    ]);
  });

  it("tüm alan+advanced+utility+profile id'leri benzersiz", () => {
    const all = [
      ...PRIMARY_AREAS.flatMap((a) => a.tabIds),
      ...ADVANCED_TABS.map((t) => t.id),
      ...UTILITY_TABS.map((t) => t.id),
      ...PROFILE_TABS.map((t) => t.id),
    ];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("normalizeTabId + TAB_ALIASES", () => {
  it("her alias canlı bir id'ye çözülür", () => {
    for (const [alias, target] of Object.entries(TAB_ALIASES)) {
      expect(normalizeTabId(alias)).toBe(target);
      expect(LIVE_IDS.has(target), `alias ${alias} → ${target} canlı değil`).toBe(true);
    }
  });

  it("alias ANAHTARI asla canlı bir id'yi gölgeleyemez", () => {
    for (const alias of Object.keys(TAB_ALIASES)) {
      expect(LIVE_IDS.has(alias), `alias anahtarı ${alias} canlı bir sekmeyi gölgeliyor`).toBe(false);
    }
  });

  it("ABSORBED ekranlar yeni evlerine çözülür", () => {
    expect(normalizeTabId("daily-queue")).toBe("morning");
    expect(normalizeTabId("viral-library")).toBe("lib-tumu");
    expect(normalizeTabId("keyword-library")).toBe("lib-tumu");
    expect(normalizeTabId("prompt-library")).toBe("lib-tumu");
    expect(normalizeTabId("pattern-library")).toBe("lib-tumu");
    expect(normalizeTabId("learn-dashboard")).toBe("lib-ogrenme");
    expect(normalizeTabId("instagram")).toBe("plan-seriler");
  });

  it("REDESIGNED-ADVANCED id'leri DEĞİŞMEDEN geçer (alias'lanmaz)", () => {
    for (const id of ADVANCED_IDS) {
      expect(normalizeTabId(id)).toBe(id);
      expect(TAB_ALIASES).not.toHaveProperty(id);
    }
  });

  it("alias'sız id kendine geçer", () => {
    expect(normalizeTabId("plan-firsatlar")).toBe("plan-firsatlar");
    expect(normalizeTabId("settings")).toBe("settings");
  });
});

describe("resolveAreaForTab", () => {
  it("birincil alan üyelerini çözer", () => {
    expect(resolveAreaForTab("morning")).toBe("bugun");
    expect(resolveAreaForTab("plan-takvim")).toBe("plan");
    expect(resolveAreaForTab("plan-seriler")).toBe("plan");
    expect(resolveAreaForTab("lib-tumu")).toBe("kutuphane");
  });

  it("ABSORBED alias'ları yeni alanlarına çözer", () => {
    expect(resolveAreaForTab("daily-queue")).toBe("bugun"); // → morning
    expect(resolveAreaForTab("viral-library")).toBe("kutuphane"); // → lib-tumu
    expect(resolveAreaForTab("instagram")).toBe("plan"); // → plan-seriler
  });

  it("advanced/utility/profile/bilinmeyen → null", () => {
    expect(resolveAreaForTab("flow-radar")).toBeNull(); // advanced
    expect(resolveAreaForTab("toolbox")).toBeNull();
    expect(resolveAreaForTab("system")).toBeNull(); // profile
    expect(resolveAreaForTab("does-not-exist")).toBeNull();
  });
});

describe("advanced ekranlar", () => {
  it("5 advanced ekran, hepsi Plan ebeveyni", () => {
    expect(ADVANCED_TABS.map((t) => t.id)).toEqual(ADVANCED_IDS);
    for (const t of ADVANCED_TABS) expect(t.parentArea).toBe("plan");
  });

  it("isAdvancedTab + advancedMeta", () => {
    expect(isAdvancedTab("flow-radar")).toBe(true);
    expect(isAdvancedTab("morning")).toBe(false);
    expect(advancedMeta("youtube")?.label).toBe("YouTube Fırsat Motoru");
    expect(advancedMeta("morning")).toBeNull();
  });

  it("eski deep-link alias'ları advanced'e çözülür", () => {
    expect(isAdvancedTab("flow")).toBe(true); // → flow-radar
    expect(isAdvancedTab("sources")).toBe(true); // → source-intelligence
    expect(isAdvancedTab("content-radar")).toBe(true); // → news-pool
  });
});

describe("isUtilityTab / isProfileTab", () => {
  it("Toolbox utility", () => {
    expect(isUtilityTab("toolbox")).toBe(true);
    expect(isUtilityTab("ai-rankings")).toBe(true); // alias → toolbox
    expect(isUtilityTab("costs")).toBe(false); // artık profil
  });

  it("Profil yüzeyleri", () => {
    expect(PROFILE_TABS.map((t) => t.id)).toEqual([
      "profile-memory",
      "profile-integrations",
      "system",
      "costs",
      "settings",
    ]);
    expect(isProfileTab("system")).toBe(true);
    expect(isProfileTab("costs")).toBe(true);
    expect(isProfileTab("settings")).toBe(true);
    expect(isProfileTab("profile-memory")).toBe(true);
    expect(isProfileTab("toolbox")).toBe(false);
    expect(isProfileTab("morning")).toBe(false);
  });
});

describe("highlightAreaForTab", () => {
  it("birincil sekme → kendi alanı", () => {
    expect(highlightAreaForTab("morning")).toBe("bugun");
    expect(highlightAreaForTab("plan-firsatlar")).toBe("plan");
    expect(highlightAreaForTab("lib-ogrenme")).toBe("kutuphane");
  });

  it("advanced ekran → araştırma ebeveyni (Plan)", () => {
    expect(highlightAreaForTab("flow-radar")).toBe("plan");
    expect(highlightAreaForTab("news-pool")).toBe("plan");
    expect(highlightAreaForTab("youtube")).toBe("plan");
  });

  it("utility/profile → null", () => {
    expect(highlightAreaForTab("toolbox")).toBeNull();
    expect(highlightAreaForTab("system")).toBeNull();
  });
});

describe("firstTabOfArea", () => {
  it("alanın ilk sekmesi", () => {
    expect(firstTabOfArea("bugun")).toBe("morning");
    expect(firstTabOfArea("plan")).toBe("plan-takvim");
    expect(firstTabOfArea("kutuphane")).toBe("lib-tumu");
  });
});

describe("labelForTab", () => {
  it("etiketleri tek kaynaktan verir (alias normalize)", () => {
    expect(labelForTab("morning")).toBe("Bugün");
    expect(labelForTab("plan-firsatlar")).toBe("Fırsatlar");
    expect(labelForTab("lib-tumu")).toBe("Tümü");
    expect(labelForTab("viral-library")).toBe("Tümü"); // alias → lib-tumu
    expect(labelForTab("system")).toBe("Sistem");
  });
});

describe("seedTargetForTab", () => {
  it("radar deep-link'leri news-pool görünümlerine tohumlar", () => {
    expect(seedTargetForTab("repo-radar")).toEqual({ host: "news-pool", view: "repo" });
    expect(seedTargetForTab("content-radar")).toEqual({ host: "news-pool", view: "news" });
  });

  it("normalize edilmiş host'a düşer (view yok)", () => {
    expect(seedTargetForTab("pattern-library")).toEqual({ host: "lib-tumu" });
    expect(seedTargetForTab("daily-queue")).toEqual({ host: "morning" });
    expect(seedTargetForTab("flow-radar")).toEqual({ host: "flow-radar" });
  });
});

describe("normalizeAreaId + AREA_ALIASES", () => {
  it("eski alan id'leri yeni alanlara çözülür", () => {
    expect(AREA_ALIASES).toEqual({ uretim: "plan", kesif: "plan", hafiza: "kutuphane" });
    expect(normalizeAreaId("uretim")).toBe("plan");
    expect(normalizeAreaId("kesif")).toBe("plan");
    expect(normalizeAreaId("hafiza")).toBe("kutuphane");
    expect(normalizeAreaId("plan")).toBe("plan");
  });
});

describe("allNavigableTabs (Cmd+K)", () => {
  it("birincil + advanced + toolbox + profil yüzeylerini içerir", () => {
    const tabs = allNavigableTabs();
    const ids = tabs.map((t) => t.id);
    // Birincil
    expect(ids).toContain("morning");
    expect(ids).toContain("plan-firsatlar");
    expect(ids).toContain("lib-tumu");
    // Advanced
    expect(ids).toContain("flow-radar");
    expect(ids).toContain("news-pool");
    // Utility + profil
    expect(ids).toContain("toolbox");
    expect(ids).toContain("system");
    expect(ids).toContain("profile-memory");
  });

  it("grup etiketleri atanmış", () => {
    const tabs = allNavigableTabs();
    expect(tabs.find((t) => t.id === "flow-radar")?.group).toBe("Araştırma");
    expect(tabs.find((t) => t.id === "system")?.group).toBe("Profil");
    expect(tabs.find((t) => t.id === "toolbox")?.group).toBe("Toolbox");
    expect(tabs.find((t) => t.id === "morning")?.group).toBe("Bugün");
  });
});
