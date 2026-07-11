import { describe, expect, it } from "vitest";
import {
  DIRECT_TABS,
  NAV_GROUPS,
  PRIMARY_AREAS,
  UTILITY_TABS,
  firstTabOfArea,
  isUtilityTab,
  resolveAreaForTab,
  subTabsOfArea,
} from "./navConfig";

/** DIRECT_TABS + NAV_GROUPS birleşimindeki tüm sekme id'leri. */
const ALL_TAB_IDS = new Set<string>([
  ...DIRECT_TABS.map((t) => t.id),
  ...NAV_GROUPS.flatMap((g) => g.tabs.map((t) => t.id)),
]);

describe("PRIMARY_AREAS + UTILITY_TABS projeksiyonu (IA v3)", () => {
  it("her area sekmesi gerçek bir sekme id'sine karşılık gelir", () => {
    for (const area of PRIMARY_AREAS) {
      for (const id of area.tabIds) {
        // learn-dashboard NAV_GROUPS dışında yaşar (env-koşullu projeksiyon).
        if (id === "learn-dashboard") continue;
        expect(ALL_TAB_IDS.has(id), `${id} bilinen bir sekme değil`).toBe(true);
      }
    }
  });

  it("primary alanlar tüm grup+direkt sekmeleri tam bir kez kapsar (drift yok)", () => {
    const primaryIds = PRIMARY_AREAS.flatMap((a) => a.tabIds).filter((id) => id !== "learn-dashboard");
    // Tekrar yok
    expect(new Set(primaryIds).size).toBe(primaryIds.length);
    // Kapsam birebir (utility sekmeleri alan dışında)
    expect(primaryIds.length).toBe(ALL_TAB_IDS.size);
    for (const id of ALL_TAB_IDS) {
      expect(primaryIds, `${id} hiçbir alana atanmamış`).toContain(id);
    }
  });

  it("4 ana alan tanımlı, id'leri benzersiz", () => {
    expect(PRIMARY_AREAS).toHaveLength(4);
    expect(PRIMARY_AREAS.map((a) => a.id)).toEqual(["bugun", "uretim", "kesif", "hafiza"]);
  });

  it("4 utility sekmesi tanımlı (Toolbox/Maliyetler/Sistem/Ayarlar)", () => {
    expect(UTILITY_TABS).toHaveLength(4);
    expect(UTILITY_TABS.map((t) => t.id)).toEqual(["toolbox", "costs", "system", "settings"]);
  });
});

describe("resolveAreaForTab", () => {
  it("doğrudan sekmeleri çözer", () => {
    expect(resolveAreaForTab("morning")).toBe("bugun");
    expect(resolveAreaForTab("daily-queue")).toBe("bugun");
    expect(resolveAreaForTab("news-pool")).toBe("bugun");
    expect(resolveAreaForTab("flow-radar")).toBe("kesif");
    expect(resolveAreaForTab("viral-library")).toBe("hafiza");
    expect(resolveAreaForTab("keyword-library")).toBe("hafiza");
    expect(resolveAreaForTab("instagram")).toBe("uretim");
    expect(resolveAreaForTab("youtube")).toBe("uretim");
  });

  it("legacy alias'ları doğru alana çözer", () => {
    expect(resolveAreaForTab("flow")).toBe("kesif"); // → flow-radar
    expect(resolveAreaForTab("queue")).toBe("bugun"); // → daily-queue
    expect(resolveAreaForTab("patterns")).toBe("hafiza"); // → pattern-library
    expect(resolveAreaForTab("library")).toBe("hafiza"); // → viral-library
    expect(resolveAreaForTab("content-intel")).toBe("kesif"); // → discovery-engine
  });

  it("utility sekmeleri ana alana çözülmez (null)", () => {
    expect(resolveAreaForTab("toolbox")).toBeNull();
    expect(resolveAreaForTab("costs")).toBeNull();
    expect(resolveAreaForTab("settings")).toBeNull();
  });

  it("bilinmeyen id → null", () => {
    expect(resolveAreaForTab("does-not-exist")).toBeNull();
  });
});

describe("isUtilityTab", () => {
  it("utility sekmeleri için true", () => {
    expect(isUtilityTab("toolbox")).toBe(true);
    expect(isUtilityTab("costs")).toBe(true);
    expect(isUtilityTab("settings")).toBe(true);
  });

  it("alias'lı utility (ai-rankings→toolbox) için true", () => {
    expect(isUtilityTab("ai-rankings")).toBe(true);
  });

  it("ana alan sekmeleri ve bilinmeyenler için false", () => {
    expect(isUtilityTab("morning")).toBe(false);
    expect(isUtilityTab("viral-library")).toBe(false);
    expect(isUtilityTab("does-not-exist")).toBe(false);
  });
});

describe("firstTabOfArea / subTabsOfArea", () => {
  it("firstTabOfArea alanın ilk sekmesini verir", () => {
    expect(firstTabOfArea("bugun")).toBe("morning");
    expect(firstTabOfArea("uretim")).toBe("instagram");
    expect(firstTabOfArea("kesif")).toBe("flow-radar");
    expect(firstTabOfArea("hafiza")).toBe("viral-library");
  });

  it("subTabsOfArea etiketleri tek-kaynaktan doldurur", () => {
    const kesif = subTabsOfArea("kesif");
    expect(kesif.map((s) => s.id)).toEqual([
      "flow-radar",
      "discovery-engine",
      "source-intelligence",
    ]);
    expect(kesif.find((s) => s.id === "flow-radar")?.label).toBe("Viral Radar");

    const hafiza = subTabsOfArea("hafiza");
    expect(hafiza.find((s) => s.id === "viral-library")?.label).toBe("Viral Kütüphane");

    const bugun = subTabsOfArea("bugun");
    expect(bugun.find((s) => s.id === "news-pool")?.label).toBe("Haber Havuzu");
    expect(bugun.find((s) => s.id === "morning")?.label).toBe("Bugün");
  });
});
