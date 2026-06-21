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

describe("PRIMARY_AREAS + UTILITY_TABS projeksiyonu", () => {
  it("her area sekmesi gerçek bir sekme id'sine karşılık gelir", () => {
    for (const area of PRIMARY_AREAS) {
      for (const id of area.tabIds) {
        expect(ALL_TAB_IDS.has(id), `${id} bilinen bir sekme değil`).toBe(true);
      }
    }
  });

  it("her utility sekmesi gerçek bir sekme id'sine karşılık gelir", () => {
    for (const tab of UTILITY_TABS) {
      expect(ALL_TAB_IDS.has(tab.id), `${tab.id} bilinen bir sekme değil`).toBe(true);
    }
  });

  it("primary + utility birleşimi tüm 20 sekmeyi tam bir kez kapsar (drift yok)", () => {
    const primaryIds = PRIMARY_AREAS.flatMap((a) => a.tabIds);
    const utilityIds = UTILITY_TABS.map((t) => t.id);
    const allIds = [...primaryIds, ...utilityIds];
    // Tekrar yok (primary ve utility çakışmaz)
    expect(new Set(allIds).size).toBe(allIds.length);
    // Sayı eşleşir
    expect(allIds.length).toBe(ALL_TAB_IDS.size);
    // Kapsam birebir
    for (const id of ALL_TAB_IDS) {
      expect(allIds, `${id} hiçbir alana/utility'ye atanmamış`).toContain(id);
    }
  });

  it("5 ana alan tanımlı, id'leri benzersiz", () => {
    expect(PRIMARY_AREAS).toHaveLength(5);
    const ids = PRIMARY_AREAS.map((a) => a.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("3 utility sekmesi tanımlı (Maliyet/Ayarlar/AI Sıralama)", () => {
    expect(UTILITY_TABS).toHaveLength(3);
    expect(UTILITY_TABS.map((t) => t.id)).toEqual(["costs", "settings", "ai-rankings"]);
  });
});

describe("resolveAreaForTab", () => {
  it("doğrudan sekmeleri çözer", () => {
    expect(resolveAreaForTab("morning")).toBe("bugun");
    expect(resolveAreaForTab("toolbox")).toBe("uret");
    expect(resolveAreaForTab("news-pool")).toBe("kesfet");
    expect(resolveAreaForTab("training-center")).toBe("ogren");
    expect(resolveAreaForTab("instagram")).toBe("sosyal-medya");
    expect(resolveAreaForTab("youtube")).toBe("sosyal-medya");
  });

  it("legacy alias'ları doğru alana çözer", () => {
    expect(resolveAreaForTab("flow")).toBe("kesfet"); // → flow-radar
    expect(resolveAreaForTab("queue")).toBe("uret"); // → daily-queue
    expect(resolveAreaForTab("patterns")).toBe("uret"); // → library (Kütüphane host, uret alanı)
  });

  it("utility sekmeleri ana alana çözülmez (null)", () => {
    expect(resolveAreaForTab("costs")).toBeNull();
    expect(resolveAreaForTab("settings")).toBeNull();
    expect(resolveAreaForTab("ai-rankings")).toBeNull();
  });

  it("bilinmeyen id → null", () => {
    expect(resolveAreaForTab("does-not-exist")).toBeNull();
  });
});

describe("isUtilityTab", () => {
  it("utility sekmeleri için true", () => {
    expect(isUtilityTab("costs")).toBe(true);
    expect(isUtilityTab("settings")).toBe(true);
    expect(isUtilityTab("ai-rankings")).toBe(true);
  });

  it("ana alan sekmeleri ve bilinmeyenler için false", () => {
    expect(isUtilityTab("morning")).toBe(false);
    expect(isUtilityTab("instagram")).toBe(false);
    expect(isUtilityTab("does-not-exist")).toBe(false);
  });
});

describe("firstTabOfArea / subTabsOfArea", () => {
  it("firstTabOfArea alanın ilk sekmesini verir", () => {
    expect(firstTabOfArea("bugun")).toBe("morning");
    expect(firstTabOfArea("uret")).toBe("daily-queue");
    expect(firstTabOfArea("kesfet")).toBe("discovery-engine");
    expect(firstTabOfArea("sosyal-medya")).toBe("instagram");
  });

  it("subTabsOfArea etiketleri tek-kaynaktan doldurur", () => {
    const subs = subTabsOfArea("uret");
    expect(subs.map((s) => s.id)).toEqual([
      "daily-queue",
      "toolbox",
      "library",
    ]);
    const dailyQueue = subs.find((s) => s.id === "daily-queue");
    expect(dailyQueue?.label).toBe("Günlük Kuyruk");
  });
});
