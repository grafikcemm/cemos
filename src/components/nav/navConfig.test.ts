import { describe, it, expect } from "vitest";
import {
  DIRECT_TABS,
  NAV_GROUPS,
  TAB_ALIASES,
  normalizeTabId,
  resolveGroupForTab,
  seedTargetForTab,
} from "./navConfig";

describe("resolveGroupForTab", () => {
  it("should_resolve_group_for_every_tab_in_every_group", () => {
    for (const group of NAV_GROUPS) {
      for (const tab of group.tabs) {
        expect(resolveGroupForTab(tab.id)).toBe(group.id);
      }
    }
  });

  it("should_resolve_morning_to_bugun_group_area", () => {
    // morning DIRECT_TABS'ta ama grup çözümü null (grup dışı direkt sekme).
    expect(resolveGroupForTab("morning")).toBeNull();
  });

  it("should_return_null_when_tab_is_unknown", () => {
    expect(resolveGroupForTab("does-not-exist")).toBeNull();
  });

  it("should_resolve_alias_when_legacy_id_given", () => {
    expect(resolveGroupForTab("flow")).toBe("twitter"); // flow-radar
    expect(resolveGroupForTab("patterns")).toBe("kutuphane"); // → pattern-library
    expect(resolveGroupForTab("queue")).toBe("bugun"); // daily-queue
    expect(resolveGroupForTab("library")).toBe("twitter"); // → viral-library
    expect(resolveGroupForTab("learn-dashboard")).toBe("youtube");
  });
});

describe("normalizeTabId", () => {
  it("should_map_every_alias_to_an_existing_live_tab_or_utility", () => {
    const allTabIds = new Set([
      ...DIRECT_TABS.map((t) => t.id),
      ...NAV_GROUPS.flatMap((g) => g.tabs.map((t) => t.id)),
      "toolbox",
      "costs",
      "settings",
      "learn-dashboard",
    ]);
    for (const [alias, target] of Object.entries(TAB_ALIASES)) {
      expect(normalizeTabId(alias)).toBe(target);
      expect(allTabIds.has(target), `alias ${alias} → ${target} canlı değil`).toBe(true);
    }
  });

  it("should_never_have_alias_keys_that_shadow_live_tab_ids", () => {
    // KRİTİK: pattern-library gibi bir id hem alias anahtarı hem canlı sekme
    // olursa normalizeTabId gerçek ekranı gölgeler. Bu asla olmamalı.
    const liveIds = new Set([
      ...DIRECT_TABS.map((t) => t.id),
      ...NAV_GROUPS.flatMap((g) => g.tabs.map((t) => t.id)),
      "toolbox",
      "costs",
      "settings",
      "learn-dashboard",
    ]);
    for (const alias of Object.keys(TAB_ALIASES)) {
      expect(liveIds.has(alias), `alias anahtarı ${alias} canlı bir sekme id'sini gölgeliyor`).toBe(false);
    }
  });

  it("should_pass_through_when_id_has_no_alias", () => {
    expect(normalizeTabId("settings")).toBe("settings");
  });

  it("should_map_retired_tabs_to_live_screens", () => {
    // Sprint 8: "instagram" alias'ı kalktı — canlı ekran (kendine geçer).
    expect(normalizeTabId("instagram")).toBe("instagram");
    expect(normalizeTabId("training-center")).toBe("morning");
    expect(normalizeTabId("weekly-learning-report")).toBe("morning");
    expect(normalizeTabId("ai-rankings")).toBe("toolbox");
    expect(normalizeTabId("content-intel")).toBe("discovery-engine");
  });
});

describe("seedTargetForTab", () => {
  it("should_seed_radar_deep_links_to_news_pool_views", () => {
    expect(seedTargetForTab("repo-radar")).toEqual({ host: "news-pool", view: "repo" });
    expect(seedTargetForTab("content-radar")).toEqual({ host: "news-pool", view: "news" });
  });

  it("should_fall_back_to_normalized_host_without_view", () => {
    expect(seedTargetForTab("pattern-library")).toEqual({ host: "pattern-library" });
    expect(seedTargetForTab("library")).toEqual({ host: "viral-library" });
  });
});

describe("NAV_GROUPS config (IA v2 + Sprint 8 Instagram)", () => {
  it("should_have_five_platform_groups", () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual([
      "bugun",
      "twitter",
      "instagram",
      "kutuphane",
      "youtube",
    ]);
  });

  it("should_have_no_hidden_groups", () => {
    expect(NAV_GROUPS.filter((g) => g.hidden)).toEqual([]);
  });

  it("should_have_unique_tab_ids_when_all_groups_and_direct_tabs_combined", () => {
    const ids = [
      ...DIRECT_TABS.map((t) => t.id),
      ...NAV_GROUPS.flatMap((g) => g.tabs.map((t) => t.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should_expose_12_grouped_and_direct_tabs", () => {
    // morning + (daily-queue, news-pool) + (flow-radar, discovery-engine,
    // source-intelligence, viral-library) + (instagram) + (keyword-library,
    // prompt-library, pattern-library) + (youtube). learn-dashboard env-koşullu.
    const visibleCount =
      DIRECT_TABS.length +
      NAV_GROUPS.filter((g) => !g.hidden).reduce((n, g) => n + g.tabs.length, 0);
    expect(visibleCount).toBe(12);
  });
});
