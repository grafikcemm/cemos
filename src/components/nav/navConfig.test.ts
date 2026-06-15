import { describe, it, expect } from "vitest";
import {
  DIRECT_TABS,
  NAV_GROUPS,
  TAB_ALIASES,
  normalizeTabId,
  resolveGroupForTab,
} from "./navConfig";

describe("resolveGroupForTab", () => {
  it("should_resolve_group_for_every_tab_in_every_group", () => {
    for (const group of NAV_GROUPS) {
      for (const tab of group.tabs) {
        expect(resolveGroupForTab(tab.id)).toBe(group.id);
      }
    }
  });

  it("should_return_null_when_tab_is_direct_morning", () => {
    expect(resolveGroupForTab("morning")).toBeNull();
  });

  it("should_return_null_when_tab_is_unknown", () => {
    expect(resolveGroupForTab("does-not-exist")).toBeNull();
  });

  it("should_resolve_alias_when_legacy_id_given", () => {
    expect(resolveGroupForTab("flow")).toBe("x"); // flow-radar
    expect(resolveGroupForTab("patterns")).toBe("x"); // pattern-library
    expect(resolveGroupForTab("queue")).toBe("x"); // daily-queue
  });
});

describe("normalizeTabId", () => {
  it("should_map_every_alias_to_an_existing_tab", () => {
    const allTabIds = new Set([
      ...DIRECT_TABS.map((t) => t.id),
      ...NAV_GROUPS.flatMap((g) => g.tabs.map((t) => t.id)),
    ]);
    for (const [alias, target] of Object.entries(TAB_ALIASES)) {
      expect(normalizeTabId(alias)).toBe(target);
      expect(allTabIds.has(target)).toBe(true);
    }
  });

  it("should_pass_through_when_id_has_no_alias", () => {
    expect(normalizeTabId("settings")).toBe("settings");
  });
});

describe("NAV_GROUPS config", () => {
  it("should_have_no_hidden_groups_after_instagram_opened", () => {
    // Faz D: Instagram grubu açıldı; gizli grup kalmadı.
    const hidden = NAV_GROUPS.filter((g) => g.hidden).map((g) => g.id);
    expect(hidden).toEqual([]);
  });

  it("should_resolve_instagram_tab_to_instagram_group", () => {
    expect(resolveGroupForTab("instagram")).toBe("instagram");
  });

  it("should_have_unique_tab_ids_when_all_groups_and_direct_tabs_combined", () => {
    const ids = [
      ...DIRECT_TABS.map((t) => t.id),
      ...NAV_GROUPS.flatMap((g) => g.tabs.map((t) => t.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should_expose_20_tabs_after_instagram_opened", () => {
    // Faz D: 19 + Instagram "Yorumlar" = 20.
    const visibleCount =
      DIRECT_TABS.length +
      NAV_GROUPS.filter((g) => !g.hidden).reduce((n, g) => n + g.tabs.length, 0);
    expect(visibleCount).toBe(20);
  });
});
