"use client";

import { useState } from "react";
import {
  Sunrise,
  CalendarRange,
  Library,
  CircleUserRound,
  LogOut,
  Compass,
  type LucideIcon,
} from "lucide-react";
import {
  PRIMARY_AREAS,
  PROFILE_TABS,
  subTabsOfArea,
  type PrimaryAreaId,
} from "@/components/nav/navConfig";
import { logoutAndRedirect, confirmLogout } from "@/lib/auth/clientLogout";

const AREA_ICONS: Record<string, LucideIcon> = { Sunrise, CalendarRange, Library };

type MobileNavProps = {
  highlightArea: PrimaryAreaId | null;
  profileActive: boolean;
  /** Normalize edilmiş aktif tab (sheet'te alt-sekme vurgusu). */
  activeTab: string;
  activeProfileId: string | null;
  onSelectArea: (areaId: PrimaryAreaId) => void;
  onSelectTab: (tabId: string) => void;
  onSelectProfileTab: (tabId: string) => void;
};

type SheetKind = PrimaryAreaId | "profil";

/**
 * Mobil navigasyon (05 §A4) — 3 görev + Profil sabit bottom bar. Çok-sekmeli
 * alana (Plan/Kütüphane) aktifken tekrar dokunmak alt sayfa sheet'i açar;
 * Profil sheet'i 5 yüzey + Çıkış listeler. Bugün tek-sekme (sheet yok).
 */
export default function MobileNav({
  highlightArea,
  profileActive,
  activeTab,
  activeProfileId,
  onSelectArea,
  onSelectTab,
  onSelectProfileTab,
}: MobileNavProps) {
  const [sheet, setSheet] = useState<SheetKind | null>(null);

  const openArea = (areaId: PrimaryAreaId) => {
    const subTabs = subTabsOfArea(areaId);
    const isActive = !profileActive && highlightArea === areaId;
    // Çok-sekmeli alana aktifken re-tap → sheet; değilse alana geç.
    if (isActive && subTabs.length > 1) setSheet(areaId);
    else onSelectArea(areaId);
  };

  const closeSheet = () => setSheet(null);

  const handleLogout = async () => {
    if (!confirmLogout()) return;
    await logoutAndRedirect();
  };

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
          const Icon = AREA_ICONS[area.icon] ?? Compass;
          const active = !profileActive && highlightArea === area.id;
          return (
            <BottomButton
              key={area.id}
              testid={`bottomnav-${area.id}`}
              label={area.label}
              icon={<Icon size={19} strokeWidth={2} />}
              active={active}
              onClick={() => openArea(area.id)}
            />
          );
        })}
        <BottomButton
          testid="bottomnav-profil"
          label="Profil"
          icon={<CircleUserRound size={19} strokeWidth={2} />}
          active={profileActive}
          onClick={() => setSheet("profil")}
        />
      </nav>

      {sheet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={sheet === "profil" ? "Profil" : "Alt sayfalar"}
          onClick={closeSheet}
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

            {sheet === "profil" ? (
              <>
                {PROFILE_TABS.map((tab) => (
                  <SheetButton
                    key={tab.id}
                    testid={`sheet-profile-${tab.id}`}
                    label={tab.label}
                    active={tab.id === activeProfileId}
                    onClick={() => {
                      onSelectProfileTab(tab.id);
                      closeSheet();
                    }}
                  />
                ))}
                <div aria-hidden style={{ height: 1, background: "var(--border-faint)", margin: "6px 4px" }} />
                <button
                  data-testid="sheet-profile-logout"
                  onClick={handleLogout}
                  style={{ ...sheetButtonStyle(false), color: "var(--status-error)" }}
                >
                  <LogOut size={16} strokeWidth={2} />
                  <span>Çıkış</span>
                </button>
              </>
            ) : (
              subTabsOfArea(sheet).map((item) => (
                <SheetButton
                  key={item.id}
                  testid={`sheet-tab-${item.id}`}
                  label={item.label}
                  active={item.id === activeTab}
                  onClick={() => {
                    onSelectTab(item.id);
                    closeSheet();
                  }}
                />
              ))
            )}
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

function SheetButton({
  testid,
  label,
  active,
  onClick,
}: {
  testid: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button data-testid={testid} onClick={onClick} style={sheetButtonStyle(active)}>
      <span>{label}</span>
    </button>
  );
}

function sheetButtonStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
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
  };
}
