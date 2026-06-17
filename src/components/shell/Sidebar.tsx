"use client";

import {
  Sunrise,
  PenLine,
  Compass,
  GraduationCap,
  Share2,
  DollarSign,
  Settings,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { useXAgentStore, type Channel } from "@/store/xagent";
import {
  PRIMARY_AREAS,
  UTILITY_TABS,
  subTabsOfArea,
  type PrimaryAreaId,
} from "@/components/nav/navConfig";
import SystemStatus from "./SystemStatus";

const CHANNELS: Channel[] = ["grafikcem", "maskulenkod"];

const ICONS: Record<string, LucideIcon> = {
  Sunrise,
  PenLine,
  Compass,
  GraduationCap,
  Share2,
  DollarSign,
  Settings,
  BarChart3,
};

const ACTIVE_PILL = "linear-gradient(135deg, var(--accent), var(--accent-hover))";

type SidebarProps = {
  activeArea: PrimaryAreaId | null;
  onSelectArea: (areaId: PrimaryAreaId) => void;
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  activeUtility: string | null;
  onSelectUtility: (tabId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Mobile off-canvas: closes the drawer after navigation. */
  onNavigate?: () => void;
};

/** Düz, dergi-stili nav: tüm sekme başlıkları yayılı (accordion yok). */
export default function Sidebar({
  activeArea,
  onSelectArea,
  activeTab,
  onSelectTab,
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

  return (
    <aside
      className="app-sidebar"
      style={{
        width: collapsed ? 60 : 248,
        flexShrink: 0,
        height: "100vh",
        position: "sticky",
        top: 0,
        background: "var(--bg-base)",
        borderRight: "1px solid var(--border)",
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
          padding: collapsed ? "16px 0" : "16px 16px",
          justifyContent: collapsed ? "center" : "flex-start",
          height: 64,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-md)",
            background: "var(--accent-dark)",
            border: "1px solid var(--accent-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M7 7L12 12M12 12L17 7M12 12L7 17M12 12L17 17"
              stroke="var(--accent-text)"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        {!collapsed && (
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span
              className="font-display"
              style={{ fontSize: "var(--text-lg)", fontWeight: 800, color: "var(--text-primary)" }}
            >
              CemOS
            </span>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", letterSpacing: "0.06em" }}>
              ÜRETİM MOTORU
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      {collapsed ? (
        <IconRail
          activeArea={activeArea}
          activeUtility={activeUtility}
          onSelectArea={(id) => go(() => onSelectArea(id))}
          onSelectUtility={(id) => go(() => onSelectUtility(id))}
        />
      ) : (
        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            padding: "6px 10px 14px",
            flex: 1,
            overflowY: "auto",
          }}
        >
          {PRIMARY_AREAS.map((area) => {
            const subs = subTabsOfArea(area.id);
            const Icon = ICONS[area.icon] ?? Compass;

            // Tek-sekmeli alan (Bugün) → öne çıkan tek nav öğesi.
            if (subs.length <= 1) {
              const isActive = area.id === activeArea;
              return (
                <button
                  key={area.id}
                  data-testid={`sidebar-area-${area.id}`}
                  onClick={() => go(() => onSelectArea(area.id))}
                  aria-current={isActive ? "page" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    width: "100%",
                    padding: "10px 12px",
                    marginBottom: 4,
                    borderRadius: "var(--radius-pill)",
                    border: "1px solid transparent",
                    background: isActive ? ACTIVE_PILL : "transparent",
                    boxShadow: isActive ? "var(--glow-cyan)" : "none",
                    color: isActive ? "var(--accent-fg)" : "var(--text-secondary)",
                    fontSize: "var(--text-sm)",
                    fontWeight: isActive ? 700 : 600,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }
                  }}
                >
                  <Icon size={17} strokeWidth={2} style={{ flexShrink: 0 }} />
                  <span>{area.label}</span>
                </button>
              );
            }

            const isAreaActive = area.id === activeArea;
            return (
              <div key={area.id} style={{ marginTop: 12 }}>
                <button
                  data-testid={`sidebar-area-${area.id}`}
                  onClick={() => go(() => onSelectArea(area.id))}
                  className="eyebrow"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    width: "100%",
                    padding: "4px 8px 7px",
                    background: "transparent",
                    border: "none",
                    color: isAreaActive ? "var(--accent-text)" : "var(--text-muted)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isAreaActive) e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isAreaActive) e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <Icon size={13} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                  {area.label}
                </button>
                {subs.map((sub) => (
                  <TabButton
                    key={sub.id}
                    id={sub.id}
                    label={sub.label}
                    active={sub.id === activeTab}
                    onClick={() => go(() => onSelectTab(sub.id))}
                  />
                ))}
              </div>
            );
          })}

          {/* Araçlar kümesi — eskiden footer ikonlarıydı, artık navde yayılı */}
          <div style={{ marginTop: 12 }}>
            <div className="eyebrow" style={{ padding: "4px 8px 7px", color: "var(--text-muted)" }}>
              Araçlar
            </div>
            {UTILITY_TABS.map((tab) => (
              <TabButton
                key={tab.id}
                id={tab.id}
                testid={`sidebar-utility-${tab.id}`}
                label={tab.label}
                active={tab.id === activeUtility}
                icon={ICONS[tab.icon]}
                onClick={() => go(() => onSelectUtility(tab.id))}
              />
            ))}
          </div>
        </nav>
      )}

      {/* Footer: status + channel + collapse */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <SystemStatus compact={collapsed} />

        {!collapsed && (
          <select
            value={activeChannel}
            onChange={(e) => setActiveChannel(e.target.value as Channel)}
            aria-label="Aktif kanal"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-md)",
              color: "var(--text-primary)",
              padding: "7px 10px",
              fontSize: "var(--text-xs)",
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
            padding: "8px 9px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
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

/** Düz nav sekme düğmesi — aktifte sol accent kuralı + accent-dark zemin. */
function TabButton({
  id,
  label,
  active,
  onClick,
  testid,
  icon: Icon,
}: {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
  testid?: string;
  icon?: LucideIcon;
}) {
  return (
    <button
      data-testid={testid ?? `sidebar-tab-${id}`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "7px 10px 7px 12px",
        borderRadius: "var(--radius-md)",
        border: "none",
        borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`,
        background: active ? "var(--accent-dark)" : "transparent",
        color: active ? "var(--accent-text)" : "var(--text-secondary)",
        fontSize: "var(--text-sm)",
        fontWeight: active ? 600 : 500,
        fontFamily: "inherit",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
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
          e.currentTarget.style.color = "var(--text-secondary)";
        }
      }}
    >
      {Icon && <Icon size={14} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.85 }} />}
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

/** Daraltılmış sidebar — alan + araç ikon rayı. */
function IconRail({
  activeArea,
  activeUtility,
  onSelectArea,
  onSelectUtility,
}: {
  activeArea: PrimaryAreaId | null;
  activeUtility: string | null;
  onSelectArea: (id: PrimaryAreaId) => void;
  onSelectUtility: (id: string) => void;
}) {
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 8px", flex: 1, overflowY: "auto", alignItems: "center" }}>
      {PRIMARY_AREAS.map((area) => {
        const Icon = ICONS[area.icon] ?? Compass;
        const isActive = area.id === activeArea;
        return (
          <button
            key={area.id}
            data-testid={`sidebar-area-${area.id}`}
            onClick={() => onSelectArea(area.id)}
            aria-current={isActive ? "page" : undefined}
            title={area.label}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "var(--radius-pill)",
              border: "1px solid transparent",
              background: isActive ? ACTIVE_PILL : "transparent",
              boxShadow: isActive ? "var(--glow-cyan)" : "none",
              color: isActive ? "var(--accent-fg)" : "var(--text-secondary)",
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
          >
            <Icon size={17} strokeWidth={2} />
          </button>
        );
      })}

      <div style={{ width: 24, height: 1, background: "var(--border)", margin: "6px 0" }} />

      {UTILITY_TABS.map((tab) => {
        const Icon = ICONS[tab.icon] ?? Settings;
        const isActive = tab.id === activeUtility;
        return (
          <button
            key={tab.id}
            data-testid={`sidebar-utility-${tab.id}`}
            onClick={() => onSelectUtility(tab.id)}
            aria-current={isActive ? "page" : undefined}
            title={tab.label}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "var(--radius-pill)",
              border: "1px solid transparent",
              background: isActive ? ACTIVE_PILL : "transparent",
              boxShadow: isActive ? "var(--glow-cyan)" : "none",
              color: isActive ? "var(--accent-fg)" : "var(--text-muted)",
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }
            }}
          >
            <Icon size={16} strokeWidth={2} />
          </button>
        );
      })}
    </nav>
  );
}
