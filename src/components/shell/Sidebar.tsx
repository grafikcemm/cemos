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
  ListChecks,
  Newspaper,
  Sparkles,
  TrendingUp,
  Users,
  Star,
  Type,
  Puzzle,
  Video,
  Camera,
  BrainCircuit,
  Wrench,
  DollarSign,
  Activity,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useXAgentStore, type Channel } from "@/store/xagent";
import {
  DIRECT_TABS,
  PRIMARY_AREAS,
  UTILITY_TABS,
  subTabsOfArea,
  type PrimaryAreaId,
} from "@/components/nav/navConfig";

const CHANNELS: Channel[] = ["grafikcem", "maskulenkod"];

const AREA_ICONS: Record<string, LucideIcon> = {
  Sunrise,
  Send,
  Radar,
  Library,
};

/** Sekme ikonları — direkt öğeler + grup altı sayfalar + utility. */
const TAB_ICONS: Record<string, LucideIcon> = {
  morning: Sunrise,
  "news-pool": Newspaper,
  "daily-queue": ListChecks,
  instagram: Camera,
  youtube: Video,
  "flow-radar": TrendingUp,
  "discovery-engine": Sparkles,
  "source-intelligence": Users,
  "viral-library": Star,
  "keyword-library": Type,
  "prompt-library": Library,
  "pattern-library": Puzzle,
  "learn-dashboard": BrainCircuit,
  toolbox: Wrench,
  costs: DollarSign,
  system: Activity,
  settings: Settings,
};

/* Aktif nav: sessiz mor tint + 2px sol gösterge (dashboard sessiz aktiflik). */
const ACTIVE_BG = "var(--accent-dark)";

type SidebarProps = {
  /** Collapsed icon rail'de grup ikonunun aktifliği için. */
  activeArea: PrimaryAreaId | null;
  /** Collapsed rail grup ikonu → alanın son ziyaret edilen sekmesi. */
  onSelectArea: (areaId: PrimaryAreaId) => void;
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  /** Sistem kümesi (utility) aktif sekme id'si — değilse null. */
  activeUtility: string | null;
  onSelectUtility: (tabId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Mobile: navigasyon sonrası sheet/drawer kapatma. */
  onNavigate?: () => void;
};

/**
 * Dolu (dergi-stili) sidebar — 2026-07-11 reversiyonu:
 * EN ÜSTTE Bugün + Haber Havuzu + Günlük Kuyruk kategori başlığı OLMADAN,
 * altında ÜRETİM/KEŞİF/HAFIZA/SİSTEM eyebrow grupları ve alt sayfaları.
 * Collapsed: direkt öğe ikonları + grup ikonları (icon rail).
 * Dipte: hesap (kanal) seçici + daralt.
 */
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

  const systemActive = activeUtility != null;
  const directIds = DIRECT_TABS.map((t) => t.id);
  // Direkt öğeler dışındaki alan grupları (bugun sekmeleri direkt öğe oldu).
  const groupAreas = PRIMARY_AREAS.filter(
    (area) => !area.tabIds.every((id) => directIds.includes(id)),
  );

  return (
    <aside
      className="app-sidebar"
      style={{
        width: collapsed ? 64 : 232,
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

      {collapsed ? (
        /* Icon rail: direkt öğeler + grup ikonları + sistem. */
        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            padding: "10px 12px",
            flex: 1,
            alignItems: "center",
            overflowY: "auto",
          }}
        >
          {DIRECT_TABS.map((tab) => {
            const Icon = TAB_ICONS[tab.id] ?? Compass;
            return (
              <NavButton
                key={tab.id}
                testid={`sidebar-tab-${tab.id}`}
                label={tab.label}
                icon={<Icon size={17} strokeWidth={2} />}
                active={!systemActive && activeTab === tab.id}
                collapsed
                onClick={() => go(() => onSelectTab(tab.id))}
              />
            );
          })}
          <RailDivider />
          {groupAreas.map((area) => {
            const Icon = AREA_ICONS[area.icon] ?? Compass;
            return (
              <NavButton
                key={area.id}
                testid={`sidebar-area-${area.id}`}
                label={area.label}
                icon={<Icon size={17} strokeWidth={2} />}
                active={!systemActive && area.id === activeArea}
                collapsed
                onClick={() => go(() => onSelectArea(area.id))}
              />
            );
          })}
          <RailDivider />
          <NavButton
            testid="sidebar-area-sistem"
            label="Sistem"
            icon={<Settings2 size={17} strokeWidth={2} />}
            active={systemActive}
            collapsed
            onClick={() => go(() => onSelectUtility("system"))}
          />
        </nav>
      ) : (
        /* Dolu nav: direkt öğeler (başlıksız) + eyebrow gruplar. */
        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            padding: "6px 12px 14px",
            flex: 1,
            overflowY: "auto",
          }}
        >
          {DIRECT_TABS.map((tab) => {
            const Icon = TAB_ICONS[tab.id] ?? Compass;
            return (
              <NavButton
                key={tab.id}
                testid={`sidebar-tab-${tab.id}`}
                label={tab.label}
                icon={<Icon size={16} strokeWidth={2} />}
                active={!systemActive && activeTab === tab.id}
                collapsed={false}
                onClick={() => go(() => onSelectTab(tab.id))}
              />
            );
          })}

          {groupAreas.map((area) => (
            <div key={area.id}>
              <GroupHeading label={area.label} />
              {subTabsOfArea(area.id).map((tab) => {
                const Icon = TAB_ICONS[tab.id] ?? Compass;
                return (
                  <NavButton
                    key={tab.id}
                    testid={`sidebar-tab-${tab.id}`}
                    label={tab.label}
                    icon={<Icon size={16} strokeWidth={2} />}
                    active={!systemActive && activeTab === tab.id}
                    collapsed={false}
                    onClick={() => go(() => onSelectTab(tab.id))}
                  />
                );
              })}
            </div>
          ))}

          <div>
            <GroupHeading label="Sistem" />
            {UTILITY_TABS.map((tab) => {
              const Icon = TAB_ICONS[tab.id] ?? Compass;
              return (
                <NavButton
                  key={tab.id}
                  testid={`sidebar-utility-${tab.id}`}
                  label={tab.label}
                  icon={<Icon size={16} strokeWidth={2} />}
                  active={activeUtility === tab.id}
                  collapsed={false}
                  onClick={() => go(() => onSelectUtility(tab.id))}
                />
              );
            })}
          </div>
        </nav>
      )}

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

/** Eyebrow grup başlığı — tıklanmaz etiket. */
function GroupHeading({ label }: { label: string }) {
  return (
    <div
      className="eyebrow"
      style={{
        padding: "14px 12px 5px",
        color: "var(--text-muted)",
        fontSize: "var(--text-2xs)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        userSelect: "none",
      }}
    >
      {label}
    </div>
  );
}

function RailDivider() {
  return (
    <div
      aria-hidden
      style={{ width: 24, height: 1, background: "var(--border-faint)", margin: "6px 0", flexShrink: 0 }}
    />
  );
}

function NavButton({
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
        gap: 10,
        width: collapsed ? 40 : "100%",
        height: collapsed ? 40 : 34,
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
      {/* Küçük aktif göstergesi — sol kenar çizgisi */}
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
      {!collapsed && (
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      )}
    </button>
  );
}
