"use client";

import { useEffect, useRef } from "react";
import { useXAgentStore } from "@/store/xagent";
import AutomationManager from "@/components/agent/AutomationManager";
import {
  PRIMARY_AREAS,
  PROFILE_TABS,
  advancedMeta,
  firstTabOfArea,
  highlightAreaForTab,
  isAdvancedTab,
  isProfileTab,
  isUtilityTab,
  labelForTab,
  normalizeTabId,
  profileMeta,
  resolveAreaForTab,
  seedTargetForTab,
  subTabsOfArea,
  type PrimaryAreaId,
} from "@/components/nav/navConfig";
import Sidebar from "./Sidebar";
import TopStrip from "./TopStrip";
import CommandPalette from "./CommandPalette";
import MobileNav from "./MobileNav";
import SubNav from "@/components/ui/SubNav";
import { renderScreen } from "./screenRegistry";

type AppShellProps = {
  /** Standalone /dashboard/* routes seed their tab once on mount. */
  initialTab?: string;
};

/**
 * Uygulama kabuğu (05 §A1) — 3 birincil alan + Toolbox (utility) + Profil menü.
 * Collapse yok (06 §7). Aktif tab dört sınıftan biri: birincil alan sekmesi,
 * REDESIGNED-ADVANCED araştırma ekranı, Toolbox, veya Profil yüzeyi.
 */
export default function AppShell({ initialTab }: AppShellProps) {
  const activeTab = useXAgentStore((s) => s.activeTab);
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  const setRadarView = useXAgentStore((s) => s.setRadarView);

  const lastTabByArea = useRef<Partial<Record<PrimaryAreaId, string>>>({});
  const seeded = useRef(false);

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

  // Bilinmeyen persist id (hiçbir sınıfa uymuyor) → morning; shell asla boş render etmez.
  useEffect(() => {
    const known =
      resolveAreaForTab(activeTab) !== null ||
      isAdvancedTab(activeTab) ||
      isUtilityTab(activeTab) ||
      isProfileTab(activeTab);
    if (!known) setActiveTab("morning");
  }, [activeTab, setActiveTab]);

  const normalizedTab = normalizeTabId(activeTab);
  const toolboxActive = isUtilityTab(activeTab);
  const profileActive = isProfileTab(activeTab);
  const highlightArea = highlightAreaForTab(activeTab);
  const primaryArea = resolveAreaForTab(activeTab); // yalnız birincil alan üyeleri
  const advanced = advancedMeta(activeTab);

  const activeProfileId = profileActive ? normalizedTab : null;

  // Aktif birincil alanın son ziyaret edilen alt-sekmesini hatırla.
  useEffect(() => {
    if (primaryArea) lastTabByArea.current[primaryArea] = normalizedTab;
  }, [primaryArea, normalizedTab]);

  // Workspace alt-navigasyonu: Plan/Kütüphane → alan sekmeleri; Profil → 5 yüzey.
  const areaSubTabs = primaryArea ? subTabsOfArea(primaryArea) : [];
  const profileSubTabs = PROFILE_TABS.map((t) => ({ id: t.id, label: t.label }));

  // Breadcrumb (TopStrip).
  let areaLabel = "Bugün";
  let subTabLabel: string | undefined;
  if (profileActive) {
    areaLabel = "Profil";
    subTabLabel = profileMeta(activeTab)?.label;
  } else if (toolboxActive) {
    areaLabel = "Toolbox";
  } else if (advanced) {
    areaLabel = PRIMARY_AREAS.find((a) => a.id === advanced.parentArea)?.label ?? "Plan";
    subTabLabel = advanced.label;
  } else if (primaryArea) {
    areaLabel = PRIMARY_AREAS.find((a) => a.id === primaryArea)?.label ?? "Bugün";
    subTabLabel = areaSubTabs.length > 1 ? labelForTab(normalizedTab) : undefined;
  }

  const handleSelectArea = (areaId: PrimaryAreaId) => {
    setActiveTab(lastTabByArea.current[areaId] ?? firstTabOfArea(areaId));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <AutomationManager />
      <CommandPalette activeTab={activeTab} onNavigate={setActiveTab} />

      <div style={{ display: "flex", flex: 1, minHeight: 0, minWidth: 0 }}>
        <div className="app-sidebar-desktop">
          <Sidebar
            highlightArea={highlightArea}
            toolboxActive={toolboxActive}
            profileActive={profileActive}
            activeProfileId={activeProfileId}
            onSelectArea={handleSelectArea}
            onSelectToolbox={() => setActiveTab("toolbox")}
            onSelectProfileTab={setActiveTab}
          />
        </div>

        <div
          className="app-main app-workspace"
          style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}
        >
          <TopStrip areaLabel={areaLabel} subTabLabel={subTabLabel} />
          <main style={{ flex: 1, minWidth: 0, width: "100%" }}>
            <div
              className="app-content"
              style={{
                width: "100%",
                maxWidth: "var(--content-max)",
                marginInline: "auto",
                padding: "var(--space-page-top) var(--space-page-x) 48px",
                minWidth: 0,
              }}
            >
              {profileActive ? (
                <SubNav items={profileSubTabs} activeId={normalizedTab} onSelect={setActiveTab} />
              ) : areaSubTabs.length > 1 ? (
                <SubNav items={areaSubTabs} activeId={normalizedTab} onSelect={setActiveTab} />
              ) : null}
              {renderScreen(activeTab)}
            </div>
          </main>
        </div>
      </div>

      <MobileNav
        highlightArea={highlightArea}
        profileActive={profileActive}
        activeTab={normalizedTab}
        activeProfileId={activeProfileId}
        onSelectArea={handleSelectArea}
        onSelectTab={setActiveTab}
        onSelectProfileTab={setActiveTab}
      />
    </div>
  );
}
