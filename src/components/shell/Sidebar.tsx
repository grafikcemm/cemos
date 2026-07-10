"use client";

import {
  Sunrise,
  Compass,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  Library,
  Send,
  Radar,
  type LucideIcon,
} from "lucide-react";
import { useXAgentStore, type Channel } from "@/store/xagent";
import { PRIMARY_AREAS, type PrimaryAreaId } from "@/components/nav/navConfig";

const CHANNELS: Channel[] = ["grafikcem", "maskulenkod"];

const ICONS: Record<string, LucideIcon> = {
  Sunrise,
  Send,
  Radar,
  Library,
};

/* Aktif nav: sessiz mor tint + 2px sol gösterge (dashboard sessiz aktiflik). */
const ACTIVE_BG = "var(--accent-dark)";

type SidebarProps = {
  activeArea: PrimaryAreaId | null;
  onSelectArea: (areaId: PrimaryAreaId) => void;
  /** Sistem kümesi (utility) aktif mi — sentetik 5. alan olarak gösterilir. */
  activeUtility: string | null;
  onSelectUtility: (tabId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Mobile: navigasyon sonrası sheet/drawer kapatma. */
  onNavigate?: () => void;
};

/**
 * Dashboard sidebar — YALNIZ 5 üst-düzey alan (Bugün/Üretim/Keşif/Hafıza/Sistem).
 * Alt sayfalar workspace içindeki contextual sub-nav'da yaşar (AppShell).
 * Dipte: hesap (kanal) seçici + daralt.
 */
export default function Sidebar({
  activeArea,
  onSelectArea,
  activeUtility,
  onSelectUtility,
  collapsed,
  onToggleCollapse,
  onNavigate,
}: SidebarProps) {
  const activeChannel = useXAgentStore((s) => s.activeChannel);
  const setActiveChannel = useXAgentStore((s) => s.setActiveChannel);

  const go = (fn: () => void) => {
    fn();
    onNavigate?.();
  };

  const systemActive = activeUtility != null;

  return (
    <aside
      className="app-sidebar"
      style={{
        width: collapsed ? 64 : 216,
        flexShrink: 0,
        height: "100vh",
        position: "sticky",
        top: 0,
        background: "var(--bg-rail)",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.18s ease",
        zIndex: 50,
      }}
    >
      {/* Brand */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: collapsed ? "18px 0" : "18px 18px",
          justifyContent: collapsed ? "center" : "flex-start",
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
        {!collapsed && (
          <span
            className="font-display"
            style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
          >
            CemOS
          </span>
        )}
      </div>

      {/* Nav — yalnız 5 alan */}
      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: collapsed ? "10px 12px" : "10px 12px",
          flex: 1,
          alignItems: collapsed ? "center" : "stretch",
        }}
      >
        {PRIMARY_AREAS.map((area) => {
          const Icon = ICONS[area.icon] ?? Compass;
          const isActive = !systemActive && area.id === activeArea;
          return (
            <AreaButton
              key={area.id}
              testid={`sidebar-area-${area.id}`}
              label={area.label}
              icon={<Icon size={17} strokeWidth={2} />}
              active={isActive}
              collapsed={collapsed}
              onClick={() => go(() => onSelectArea(area.id))}
            />
          );
        })}

        {/* Sistem — sentetik 5. alan (utility kümesi) */}
        <AreaButton
          testid="sidebar-area-sistem"
          label="Sistem"
          icon={<Settings2 size={17} strokeWidth={2} />}
          active={systemActive}
          collapsed={collapsed}
          onClick={() => go(() => onSelectUtility("system"))}
        />
      </nav>

      {/* Dip: hesap + daralt (sabit) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 12,
          borderTop: "1px solid var(--border-faint)",
          flexShrink: 0,
          alignItems: collapsed ? "center" : "stretch",
        }}
      >
        {collapsed ? (
          <div
            title={`@${activeChannel}`}
            aria-label={`Aktif kanal @${activeChannel}`}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--accent-dark)",
              border: "1px solid var(--accent-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              color: "var(--accent-text)",
            }}
          >
            {activeChannel.charAt(0).toUpperCase()}
          </div>
        ) : (
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
        )}

        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            height: "var(--control-h-sm)",
            width: collapsed ? 32 : "100%",
            background: "transparent",
            border: "1px solid var(--border-faint)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "var(--text-xs)",
            fontFamily: "inherit",
          }}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          {!collapsed && "Daralt"}
        </button>
      </div>
    </aside>
  );
}

function AreaButton({
  testid,
  label,
  icon,
  active,
  collapsed,
  onClick,
}: {
  testid: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        gap: 11,
        width: collapsed ? 40 : "100%",
        height: 40,
        padding: collapsed ? 0 : "0 12px",
        borderRadius: "var(--radius-sm)",
        border: "none",
        background: active ? ACTIVE_BG : "transparent",
        color: active ? "var(--accent-text)" : "var(--text-muted)",
        fontSize: "var(--text-sm)",
        fontWeight: 500,
        fontFamily: "inherit",
        cursor: "pointer",
        textAlign: "left",
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
      {/* Küçük aktif göstergesi — sol kenar çizgisi */}
      {active && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: collapsed ? -12 : -12,
            top: 10,
            bottom: 10,
            width: 2,
            borderRadius: 2,
            background: "var(--accent)",
          }}
        />
      )}
      <span style={{ display: "inline-flex", flexShrink: 0 }}>{icon}</span>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}
