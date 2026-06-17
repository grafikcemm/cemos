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
  subTabsOfArea,
  type PrimaryAreaId,
} from "@/components/nav/navConfig";
import Sidebar from "./Sidebar";
import TopStrip from "./TopStrip";
import { renderScreen } from "./screenRegistry";

const COLLAPSE_KEY = "cemos-ui-collapsed";

type AppShellProps = {
  /** Standalone /dashboard/* routes seed their tab once on mount. */
  initialTab?: string;
};

export default function AppShell({ initialTab }: AppShellProps) {
  const activeTab = useXAgentStore((s) => s.activeTab);
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastTabByArea = useRef<Partial<Record<PrimaryAreaId, string>>>({});
  const seeded = useRef(false);

  // Restore collapse preference (separate key — never touches "xagent-store").
  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  // Standalone route seeding: force the route's tab once.
  useEffect(() => {
    if (initialTab && !seeded.current) {
      seeded.current = true;
      setActiveTab(initialTab);
    }
  }, [initialTab, setActiveTab]);

  // Unknown persisted id (ne birincil alan ne utility) → morning'e düş; shell asla alansız render etmez.
  useEffect(() => {
    if (resolveAreaForTab(activeTab) === null && !isUtilityTab(activeTab)) setActiveTab("morning");
  }, [activeTab, setActiveTab]);

  const normalizedTab = normalizeTabId(activeTab);
  const utilityActive = isUtilityTab(activeTab);
  const area: PrimaryAreaId | null = utilityActive ? null : resolveAreaForTab(activeTab) ?? "bugun";
  const subTabs = area ? subTabsOfArea(area) : [];
  const areaMeta = area ? PRIMARY_AREAS.find((a) => a.id === area) : null;
  const utilityMeta = utilityActive ? UTILITY_TABS.find((u) => u.id === normalizedTab) : null;
  const activeSubLabel = subTabs.find((t) => t.id === normalizedTab)?.label;
  const activeUtility = utilityActive ? normalizedTab : null;

  // Remember the last sub-tab visited per area (utility hariç) for nicer area switching.
  useEffect(() => {
    if (area) lastTabByArea.current[area] = normalizedTab;
  }, [area, normalizedTab]);

  const handleSelectArea = (areaId: PrimaryAreaId) => {
    const target = lastTabByArea.current[areaId] ?? firstTabOfArea(areaId);
    setActiveTab(target);
  };

  const handleSelectUtility = (tabId: string) => setActiveTab(tabId);

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
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <AutomationManager />

      {/* Desktop sidebar */}
      <div className="app-sidebar-desktop">
        <Sidebar
          activeArea={area}
          onSelectArea={handleSelectArea}
          activeTab={normalizedTab}
          onSelectTab={setActiveTab}
          activeUtility={activeUtility}
          onSelectUtility={handleSelectUtility}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>

      {/* Mobile off-canvas sidebar */}
      {mobileOpen && (
        <div className="app-mobile-overlay" onClick={() => setMobileOpen(false)} style={MOBILE_OVERLAY}>
          <div onClick={(e) => e.stopPropagation()}>
            <Sidebar
              activeArea={area}
              onSelectArea={handleSelectArea}
              activeTab={normalizedTab}
              onSelectTab={setActiveTab}
              activeUtility={activeUtility}
              onSelectUtility={handleSelectUtility}
              collapsed={false}
              onToggleCollapse={toggleCollapse}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      <div
        className="app-main"
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-base)",
        }}
      >
        <TopStrip
          areaLabel={utilityMeta?.label ?? areaMeta?.label ?? "Bugün"}
          subTabLabel={activeSubLabel}
          onOpenMobileNav={() => setMobileOpen(true)}
        />
        <main style={{ flex: 1, minWidth: 0, width: "100%" }}>
          {/* Genesis: içerik 1280px max + ortalı + 24px gutter; topstrip/zemin full-bleed kalır. */}
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 80px", minWidth: 0 }}>
            {renderScreen(activeTab)}
          </div>
        </main>
      </div>
    </div>
  );
}

const MOBILE_OVERLAY: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
};
