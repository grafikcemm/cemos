"use client";

import { useState } from "react";
import {
  Sunrise,
  CalendarRange,
  Library,
  Wrench,
  CircleUserRound,
  ChevronDown,
  Compass,
  type LucideIcon,
} from "lucide-react";
import { useXAgentStore, type Channel } from "@/store/xagent";
import { PRIMARY_AREAS, type PrimaryAreaId } from "@/components/nav/navConfig";
import ProfileMenu from "./ProfileMenu";

const CHANNELS: Channel[] = ["grafikcem", "maskulenkod"];

const AREA_ICONS: Record<string, LucideIcon> = {
  Sunrise,
  CalendarRange,
  Library,
};

type SidebarProps = {
  /** Yanacak birincil alan (advanced ekran → araştırma ebeveyni Plan). */
  highlightArea: PrimaryAreaId | null;
  /** Toolbox aktif mi? */
  toolboxActive: boolean;
  /** Bir Profil yüzeyi aktif mi? */
  profileActive: boolean;
  /** Aktif Profil yüzeyi id'si (ProfileMenu vurgusu için) — değilse null. */
  activeProfileId: string | null;
  onSelectArea: (areaId: PrimaryAreaId) => void;
  onSelectToolbox: () => void;
  onSelectProfileTab: (tabId: string) => void;
  /** Mobil: navigasyon sonrası sheet/drawer kapatma (desktop'ta kullanılmaz). */
  onNavigate?: () => void;
};

/**
 * Üç göreve indirgenmiş dar sidebar (05 §A2, 06 §7): marka → Bugün/Plan/
 * Kütüphane → Toolbox (utility) → hesap → Profil tetikleyici. Utility/ayar
 * yüzeyleri Profil menüsünde. **Collapse YOK** — 3 item icon-rail'i hak etmez
 * (06 §7 kararı); ≤640'ta bottom-nav'a devreder (CSS `.app-sidebar-desktop`).
 */
export default function Sidebar({
  highlightArea,
  toolboxActive,
  profileActive,
  activeProfileId,
  onSelectArea,
  onSelectToolbox,
  onSelectProfileTab,
  onNavigate,
}: SidebarProps) {
  const activeChannel = useXAgentStore((s) => s.activeChannel);
  const setActiveChannel = useXAgentStore((s) => s.setActiveChannel);
  const [profileOpen, setProfileOpen] = useState(false);

  const go = (fn: () => void) => {
    fn();
    onNavigate?.();
  };

  return (
    <aside
      className="app-sidebar"
      style={{
        width: 232,
        flexShrink: 0,
        height: "100vh",
        position: "sticky",
        top: 0,
        background: "var(--bg-rail)",
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
      }}
    >
      {/* Marka */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "18px 18px",
          height: 64,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "var(--radius-sm)",
            background: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M7 7L12 12M12 12L17 7M12 12L7 17M12 12L17 17"
              stroke="var(--accent-fg)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <span
          className="font-display"
          style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
        >
          CemOS
        </span>
      </div>

      {/* Birincil alanlar + Toolbox */}
      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: "6px 12px 14px",
          flex: 1,
          overflowY: "auto",
        }}
      >
        {PRIMARY_AREAS.map((area) => {
          const Icon = AREA_ICONS[area.icon] ?? Compass;
          return (
            <NavButton
              key={area.id}
              testid={`sidebar-area-${area.id}`}
              label={area.label}
              icon={<Icon size={17} strokeWidth={2} />}
              active={highlightArea === area.id && !toolboxActive && !profileActive}
              onClick={() => go(() => onSelectArea(area.id))}
            />
          );
        })}

        <div aria-hidden style={{ height: 1, background: "var(--border-faint)", margin: "10px 4px" }} />

        <NavButton
          testid="sidebar-toolbox"
          label="Toolbox"
          icon={<Wrench size={17} strokeWidth={2} />}
          active={toolboxActive}
          onClick={() => go(onSelectToolbox)}
        />
      </nav>

      {/* Dip: hesap + Profil tetikleyici */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 12,
          borderTop: "1px solid var(--border-faint)",
          flexShrink: 0,
        }}
      >
        <select
          value={activeChannel}
          onChange={(e) => setActiveChannel(e.target.value as Channel)}
          aria-label="Aktif kanal"
          style={{
            height: "var(--control-h-sm)",
            background: "var(--bg-sunken)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-secondary)",
            padding: "0 8px",
            fontSize: "var(--text-xs)",
            fontFamily: "inherit",
            cursor: "pointer",
            outline: "none",
          }}
        >
          {CHANNELS.map((ch) => (
            <option key={ch} value={ch}>
              @{ch}
            </option>
          ))}
        </select>

        <div style={{ position: "relative" }}>
          <button
            data-testid="sidebar-profile"
            onClick={() => setProfileOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-current={profileActive ? "page" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              height: 34,
              padding: "0 12px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: profileActive ? "var(--accent-dark)" : "transparent",
              color: profileActive ? "var(--accent-text)" : "var(--text-muted)",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              if (!profileActive) {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!profileActive) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }
            }}
          >
            <CircleUserRound size={17} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, textAlign: "left" }}>Profil</span>
            <ChevronDown size={14} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.7 }} />
          </button>

          {profileOpen && (
            <ProfileMenu
              activeId={activeProfileId}
              onSelect={(id) => {
                setProfileOpen(false);
                go(() => onSelectProfileTab(id));
              }}
              onClose={() => setProfileOpen(false)}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

function NavButton({
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
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        height: 36,
        padding: "0 12px",
        borderRadius: "var(--radius-sm)",
        border: "none",
        background: active ? "var(--accent-dark)" : "transparent",
        color: active ? "var(--accent-text)" : "var(--text-muted)",
        fontSize: "var(--text-sm)",
        fontWeight: 500,
        fontFamily: "inherit",
        cursor: "pointer",
        textAlign: "left",
        flexShrink: 0,
        transition: "background 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--bg-hover)";
          e.currentTarget.style.color = "var(--text-primary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-muted)";
        }
      }}
    >
      {active && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: -12,
            top: 8,
            bottom: 8,
            width: 2,
            borderRadius: 2,
            background: "var(--accent)",
          }}
        />
      )}
      <span style={{ display: "inline-flex", flexShrink: 0 }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
}
