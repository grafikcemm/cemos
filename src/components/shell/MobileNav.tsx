"use client";

import { useState } from "react";
import { Sunrise, Send, Radar, Library, Settings2, Compass, type LucideIcon } from "lucide-react";
import { PRIMARY_AREAS, UTILITY_TABS, subTabsOfArea, type PrimaryAreaId } from "@/components/nav/navConfig";

const ICONS: Record<string, LucideIcon> = { Sunrise, Send, Radar, Library };

type MobileNavProps = {
  activeArea: PrimaryAreaId | null;
  activeUtility: string | null;
  activeTab: string;
  onSelectArea: (areaId: PrimaryAreaId) => void;
  onSelectTab: (tabId: string) => void;
  onSelectUtility: (tabId: string) => void;
};

/**
 * Mobil navigasyon — 5 alanlı sabit bottom bar. Aktif alana tekrar dokunmak
 * o alanın alt sayfalarını bottom-sheet olarak açar (uzun drawer YOK).
 */
export default function MobileNav({
  activeArea,
  activeUtility,
  activeTab,
  onSelectArea,
  onSelectTab,
  onSelectUtility,
}: MobileNavProps) {
  const [sheetArea, setSheetArea] = useState<PrimaryAreaId | "sistem" | null>(null);

  const systemActive = activeUtility != null;

  const openOrGo = (areaId: PrimaryAreaId) => {
    if (!systemActive && areaId === activeArea) setSheetArea(areaId);
    else onSelectArea(areaId);
  };

  const openOrGoSystem = () => {
    if (systemActive) setSheetArea("sistem");
    else onSelectUtility("system");
  };

  const sheetItems =
    sheetArea === "sistem"
      ? UTILITY_TABS.map((t) => ({ id: t.id, label: t.label }))
      : sheetArea
        ? subTabsOfArea(sheetArea)
        : [];

  const currentId = systemActive ? activeUtility : activeTab;

  return (
    <>
      <nav
        className="app-bottomnav"
        aria-label="Ana navigasyon"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 150,
          height: 62,
          background: "var(--bg-rail)",
          borderTop: "1px solid var(--border)",
          alignItems: "stretch",
          justifyContent: "space-around",
          paddingBottom: "env(safe-area-inset-bottom, 0)",
        }}
      >
        {PRIMARY_AREAS.map((area) => {
          const Icon = ICONS[area.icon] ?? Compass;
          const isActive = !systemActive && area.id === activeArea;
          return (
            <BottomButton
              key={area.id}
              testid={`bottomnav-${area.id}`}
              label={area.label}
              icon={<Icon size={19} strokeWidth={2} />}
              active={isActive}
              onClick={() => openOrGo(area.id)}
            />
          );
        })}
        <BottomButton
          testid="bottomnav-sistem"
          label="Sistem"
          icon={<Settings2 size={19} strokeWidth={2} />}
          active={systemActive}
          onClick={openOrGoSystem}
        />
      </nav>

      {/* Alt-sayfa sheet'i */}
      {sheetArea && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Alt sayfalar"
          onClick={() => setSheetArea(null)}
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--scrim)", display: "flex", alignItems: "flex-end" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              background: "var(--bg-elevated)",
              borderTop: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
              padding: "10px 12px calc(16px + env(safe-area-inset-bottom, 0))",
              maxHeight: "60vh",
              overflowY: "auto",
            }}
          >
            <div
              aria-hidden
              style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", margin: "0 auto 12px" }}
            />
            {sheetItems.map((item) => {
              const active = item.id === currentId;
              return (
                <button
                  key={item.id}
                  data-testid={`sheet-tab-${item.id}`}
                  onClick={() => {
                    if (sheetArea === "sistem") onSelectUtility(item.id);
                    else onSelectTab(item.id);
                    setSheetArea(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    minHeight: 44,
                    padding: "0 12px",
                    background: active ? "var(--accent-dark)" : "transparent",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    color: active ? "var(--accent-text)" : "var(--text-primary)",
                    fontSize: "var(--text-base)",
                    fontWeight: 500,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function BottomButton({
  testid,
  label,
  icon,
  active,
  onClick,
}: {
  testid: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        background: "transparent",
        border: "none",
        color: active ? "var(--accent-text)" : "var(--text-muted)",
        fontSize: 10,
        fontWeight: 500,
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
