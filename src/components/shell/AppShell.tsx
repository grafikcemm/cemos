"use client";

import { useEffect, useRef, useState } from "react";
import { useXAgentStore } from "@/store/xagent";
import AutomationManager from "@/components/agent/AutomationManager";
import {
  PRIMARY_AREAS,
  UTILITY_TABS,
  firstTabOfArea,
  isUtilityTab,
  normalizeTabId,
  resolveAreaForTab,
  seedTargetForTab,
  subTabsOfArea,
  type PrimaryAreaId,
} from "@/components/nav/navConfig";
import Sidebar from "./Sidebar";
import TopStrip from "./TopStrip";
import CommandPalette from "./CommandPalette";
import WorkspaceSubNav from "./WorkspaceSubNav";
import MobileNav from "./MobileNav";
import { renderScreen } from "./screenRegistry";

const COLLAPSE_KEY = "cemos-ui-collapsed";

type AppShellProps = {
  /** Standalone /dashboard/* routes seed their tab once on mount. */
  initialTab?: string;
};

export default function AppShell({ initialTab }: AppShellProps) {
  const activeTab = useXAgentStore((s) => s.activeTab);
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  const setRadarView = useXAgentStore((s) => s.setRadarView);

  const [collapsed, setCollapsed] = useState(false);
  const lastTabByArea = useRef<Partial<Record<PrimaryAreaId, string>>>({});
  const lastUtility = useRef<string>("system");
  const seeded = useRef(false);

  // Restore collapse preference (separate key — never touches "xagent-store").
  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  // Standalone route seeding: force the route's tab once. Folded deep-link id'leri
  // (content-radar/repo-radar…) host + alt-görünüme yönlendirilir.
  useEffect(() => {
    if (initialTab && !seeded.current) {
      seeded.current = true;
      const { host, view } = seedTargetForTab(initialTab);
      setActiveTab(host);
      if (view && host === "news-pool") setRadarView(view);
    }
  }, [initialTab, setActiveTab, setRadarView]);

  // Unknown persisted id (ne birincil alan ne utility) → morning'e düş; shell asla alansız render etmez.
  useEffect(() => {
    if (resolveAreaForTab(activeTab) === null && !isUtilityTab(activeTab)) setActiveTab("morning");
  }, [activeTab, setActiveTab]);

  const normalizedTab = normalizeTabId(activeTab);
  const utilityActive = isUtilityTab(activeTab);
  const area: PrimaryAreaId | null = utilityActive ? null : resolveAreaForTab(activeTab) ?? "bugun";
  const areaMeta = area ? PRIMARY_AREAS.find((a) => a.id === area) : null;
  const utilityMeta = utilityActive ? UTILITY_TABS.find((u) => u.id === normalizedTab) : null;
  const activeUtility = utilityActive ? normalizedTab : null;

  // Contextual sub-nav: aktif alanın alt sayfaları / Sistem kümesi.
  const subItems = utilityActive
    ? UTILITY_TABS.map((t) => ({ id: t.id, label: t.label }))
    : area
      ? subTabsOfArea(area)
      : [];
  const activeSubLabel = subItems.find((t) => t.id === normalizedTab)?.label;

  // Remember the last sub-tab visited per area / utility for nicer switching.
  useEffect(() => {
    if (area) lastTabByArea.current[area] = normalizedTab;
    if (utilityActive) lastUtility.current = normalizedTab;
  }, [area, normalizedTab, utilityActive]);

  const handleSelectArea = (areaId: PrimaryAreaId) => {
    const target = lastTabByArea.current[areaId] ?? firstTabOfArea(areaId);
    setActiveTab(target);
  };

  const handleSelectUtility = (tabId: string) => {
    // Sidebar "Sistem" alanı → son ziyaret edilen utility sayfası.
    setActiveTab(tabId === "system" && lastUtility.current ? lastUtility.current : tabId);
  };

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      }
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)" }}>
      {/* Full-width kritik uyarı bandı — flex-row'un DIŞINDA. */}
      <AutomationManager />

      {/* Cmd/Ctrl-K komut paleti: klavye-öncelikli ekran atlama. */}
      <CommandPalette activeTab={activeTab} onNavigate={setActiveTab} />

      <div style={{ display: "flex", flex: 1, minHeight: 0, minWidth: 0 }}>
        {/* Desktop sidebar — yalnız 5 alan */}
        <div className="app-sidebar-desktop">
          <Sidebar
            activeArea={area}
            onSelectArea={handleSelectArea}
            activeUtility={activeUtility}
            onSelectUtility={handleSelectUtility}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
          />
        </div>

        <div
          className="app-main app-workspace"
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <TopStrip
            areaLabel={utilityMeta ? "Sistem" : areaMeta?.label ?? "Bugün"}
            subTabLabel={activeSubLabel}
          />
          <WorkspaceSubNav items={subItems} activeId={normalizedTab} onSelect={setActiveTab} />
          <main style={{ flex: 1, minWidth: 0, width: "100%" }}>
            <div
              className="app-content"
              style={{
                width: "100%",
                margin: 0,
                padding: "var(--space-page-top) var(--space-page-x) 48px",
                minWidth: 0,
              }}
            >
              {renderScreen(activeTab)}
            </div>
          </main>
        </div>
      </div>

      {/* Mobil: 5 alanlı bottom nav + alt-sayfa sheet (drawer YOK) */}
      <MobileNav
        activeArea={area}
        activeUtility={activeUtility}
        activeTab={normalizedTab}
        onSelectArea={handleSelectArea}
        onSelectTab={setActiveTab}
        onSelectUtility={setActiveTab}
      />
    </div>
  );
}
