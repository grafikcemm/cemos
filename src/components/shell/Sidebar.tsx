"use client";

import { useEffect, useState } from "react";
import {
  Sunrise,
  CalendarRange,
  Library,
  Wrench,
  CircleUserRound,
  ChevronDown,
  ChevronsUpDown,
  Check,
  Compass,
  Newspaper,
  MonitorPlay,
  Flame,
  Telescope,
  AtSign,
  type LucideIcon,
} from "lucide-react";
import { useXAgentStore, DEFAULT_CHANNELS, type Channel } from "@/store/xagent";
import {
  PRIMARY_AREAS,
  researchNavItems,
  resolveAreaForTab,
  normalizeTabId,
  isAdvancedTab,
  subTabsOfArea,
  type PrimaryAreaId,
} from "@/components/nav/navConfig";
import AppIcon from "@/components/ui/AppIcon";
import Popover from "@/components/ui/Popover";
import ProfileMenu from "./ProfileMenu";
import SidebarNowModule from "./SidebarNowModule";


const AREA_ICONS: Record<string, LucideIcon> = {
  Sunrise,
  CalendarRange,
  Library,
};

const RESEARCH_ICON_MAP: Record<string, LucideIcon> = {
  Newspaper,
  MonitorPlay,
  Flame,
  Telescope,
  AtSign,
  Compass,
};

type SidebarProps = {
  activeTab: string;
  highlightArea: PrimaryAreaId | null;
  toolboxActive: boolean;
  profileActive: boolean;
  activeProfileId: string | null;
  onSelectArea: (areaId: PrimaryAreaId) => void;
  onSelectTab: (tabId: string) => void;
  onSelectToolbox: () => void;
  onSelectProfileTab: (tabId: string) => void;
  onNavigate?: () => void;
};

/**
 * Referans-sadakat sidebar (ADR-021 + ADR-040 yoğunluk): near-black rail → özgün
 * CemOS lockup → işlenmiş hesap bağlam kartı → 3 TOP-LEVEL görev alanı (aktif alan
 * anlamlı alt hedeflerini AÇAR) → hiyerarşik "Araştırma" grubu (keşfedilebilir,
 * katlanabilir) → "Araçlar" (Toolbox) → gerçek-veri "Şimdi" özeti → Profil.
 * Minimalizm = yalnız 3 top-level; işlevleri saklamak veya boş ray DEĞİL.
 * Tüm ikonlar AppIcon (tek optik boyut/stroke).
 */
export default function Sidebar({
  activeTab,
  highlightArea,
  toolboxActive,
  profileActive,
  activeProfileId,
  onSelectArea,
  onSelectTab,
  onSelectToolbox,
  onSelectProfileTab,
  onNavigate,
}: SidebarProps) {
  const activeChannel = useXAgentStore((s) => s.activeChannel);
  const setActiveChannel = useXAgentStore((s) => s.setActiveChannel);
  const [profileOpen, setProfileOpen] = useState(false);

  const normalizedTab = normalizeTabId(activeTab);
  const activeArea = resolveAreaForTab(activeTab); // yalnız birincil alan üyeleri
  const researchActive = isAdvancedTab(activeTab);
  const research = researchNavItems();

  // Araştırma grubu katlanma durumu — sidebar mount boyunca yaşar (shell'de
  // kalıcı). Aktif bir araştırma ekranı varsa daima açık (aktif öğe görünsün).
  const [researchOpen, setResearchOpen] = useState(true);
  const researchExpanded = researchOpen || researchActive;

  const go = (fn: () => void) => {
    fn();
    onNavigate?.();
  };

  return (
    <aside className="cx-sidebar app-sidebar">
      {/* Marka lockup — özgün CemOS mark (rounded C-arc + node) + wordmark. */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "18px 18px 14px", flexShrink: 0 }}>
        <BrandMark />
        <span
          className="font-display"
          style={{ fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}
        >
          <span style={{ color: "var(--text-primary)" }}>Cem</span>
          <span style={{ color: "var(--accent-text)" }}>OS</span>
        </span>
      </div>

      {/* Hesap bağlam kartı */}
      <div style={{ padding: "0 12px 6px", flexShrink: 0 }}>
        <AccountCard channel={activeChannel} onSelect={setActiveChannel} />
      </div>

      {/* Ana nav (kaydırılabilir): 3 alan + aktif alt-nav + Araştırma + Araçlar */}
      <nav className="cx-sidebar-scroll" aria-label="Ana navigasyon">
        {PRIMARY_AREAS.map((area) => {
          const isAreaActive = highlightArea === area.id && !toolboxActive && !profileActive && !researchActive;
          const subTabs = subTabsOfArea(area.id);
          const showSub = activeArea === area.id && subTabs.length > 1;
          return (
            <div key={area.id}>
              <NavItem
                testid={`sidebar-area-${area.id}`}
                label={area.label}
                icon={AREA_ICONS[area.icon] ?? Compass}
                active={isAreaActive}
                onClick={() => go(() => onSelectArea(area.id))}
              />
              {showSub && (
                <div className="cx-subnav" role="group" aria-label={`${area.label} alt sekmeleri`}>
                  {subTabs.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      data-testid={`sidebar-subtab-${st.id}`}
                      onClick={() => go(() => onSelectTab(st.id))}
                      aria-current={normalizedTab === st.id ? "page" : undefined}
                      className="cx-subnav-item"
                    >
                      <span className="cx-subnav-rail" aria-hidden />
                      <span className="cx-nav-label">{st.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* ── Araştırma (hiyerarşik, keşfedilebilir grup) ── */}
        <div className="cx-divider" aria-hidden />
        <button
          type="button"
          data-testid="sidebar-research-toggle"
          className="cx-group-header"
          aria-expanded={researchExpanded}
          aria-controls="sidebar-research-group"
          onClick={() => setResearchOpen((v) => !v)}
        >
          <span className="cx-section-label" style={{ margin: 0, padding: 0 }}>
            Araştırma
          </span>
          <AppIcon
            icon={ChevronDown}
            size="sm"
            style={{ opacity: 0.55, transform: researchExpanded ? "none" : "rotate(-90deg)", transition: "transform .16s var(--ease-out)" }}
          />
        </button>
        {researchExpanded && (
          <div id="sidebar-research-group" role="group" aria-label="Araştırma ekranları">
            {research.map((item) => (
              <NavItem
                key={item.id}
                testid={`sidebar-research-${item.id}`}
                label={item.label}
                icon={RESEARCH_ICON_MAP[item.icon] ?? Compass}
                active={researchActive && normalizedTab === item.id}
                small
                onClick={() => go(() => onSelectTab(item.id))}
              />
            ))}
          </div>
        )}

        {/* ── Araçlar ── */}
        <div className="cx-divider" aria-hidden />
        <div className="cx-section-label">Araçlar</div>
        <NavItem
          testid="sidebar-toolbox"
          label="Toolbox"
          icon={Wrench}
          active={toolboxActive}
          onClick={() => go(onSelectToolbox)}
        />
      </nav>

      {/* Gerçek-veri "Şimdi" özeti (canonical health reuse) */}
      <SidebarNowModule onNavigate={(id) => go(() => onSelectTab(id))} />

      {/* Dip: Profil */}
      <div style={{ padding: 12, borderTop: "1px solid var(--border-faint)", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <button
            data-testid="sidebar-profile"
            onClick={() => setProfileOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-current={profileActive ? "page" : undefined}
            className="cx-nav-item"
          >
            <AppIcon icon={CircleUserRound} size="md" active={profileActive} />
            <span className="cx-nav-label">Profil</span>
            <AppIcon icon={ChevronDown} size="sm" style={{ opacity: 0.6 }} />
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

/** Özgün CemOS mark — rounded terracotta tile + beyaz "C-arc + node" glyph
 *  (basit X kaldırıldı). Geometrik, sade; glow yok. */
function BrandMark() {
  return (
    <span
      aria-hidden
      style={{
        width: 30,
        height: 30,
        borderRadius: 9,
        background: "linear-gradient(150deg, var(--accent-hover), var(--accent-active))",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        boxShadow: "var(--highlight-top)",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
        <path
          d="M22.6 10.4a8.6 8.6 0 1 0 0 11.2"
          stroke="var(--accent-fg)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <circle cx="20.4" cy="16" r="2.8" fill="var(--accent-fg)" />
      </svg>
    </span>
  );
}

function NavItem({
  testid,
  label,
  icon,
  active,
  small,
  onClick,
}: {
  testid: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  small?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={small ? "cx-nav-item cx-nav-item-sm" : "cx-nav-item"}
    >
      <AppIcon icon={icon} size={small ? "sm" : "md"} active={active} />
      <span className="cx-nav-label">{label}</span>
    </button>
  );
}

/** İşlenmiş hesap bağlam kartı — monogram (gradient tile) + @handle + "Aktif
 *  hesap" + kanal değiştirici. Sahte stok foto YOK. Menü = paylaşılan Popover
 *  (§8F: non-modal, transparent perde, Escape, focus-return, roving klavye). */
function AccountCard({ channel, onSelect }: { channel: Channel; onSelect: (c: Channel) => void }) {
  const initial = channel.charAt(0).toUpperCase();
  // ADR-031: hesap listesi DB'den (/api/settings). Fetch başarısız/boşsa
  // bootstrap DEFAULT_CHANNELS kalır — switcher hiçbir durumda boş kalmaz.
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_CHANNELS);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        const handles = Array.isArray(json?.accounts)
          ? (json.accounts as Array<{ handle?: string; isActive?: boolean }>)
              .filter((a) => typeof a.handle === "string" && a.handle.length > 0 && a.isActive !== false)
              .map((a) => a.handle as string)
          : [];
        if (alive && handles.length > 0) setChannels(handles);
      } catch {
        // fail-soft: bootstrap listesi kalır
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Popover
      label="Hesap değiştir"
      menuTestId="account-switcher"
      fill
      trigger={(props) => (
        <button
          {...props}
          data-testid="sidebar-account"
          aria-label={`Aktif hesap: @${channel} — değiştir`}
          className="cx-account-card"
        >
          <span className="cx-account-avatar">{initial}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: "block",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                color: "var(--text-primary)",
                letterSpacing: "-0.01em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              @{channel}
            </span>
            <span style={{ display: "block", fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginTop: 1 }}>
              Aktif hesap
            </span>
          </span>
          <AppIcon icon={ChevronsUpDown} size="sm" color="var(--text-muted)" />
        </button>
      )}
    >
      {(close) =>
        channels.map((ch) => {
          const active = ch === channel;
          return (
            <button
              key={ch}
              role="menuitem"
              data-testid={`account-option-${ch}`}
              onClick={() => {
                onSelect(ch);
                close();
              }}
              aria-current={active ? "true" : undefined}
              className="cx-nav-item"
              style={{ height: 36 }}
            >
              <span
                className="cx-account-avatar"
                style={{ width: 22, height: 22, fontSize: "var(--text-2xs)", borderRadius: 7 }}
              >
                {ch.charAt(0).toUpperCase()}
              </span>
              <span className="cx-nav-label" style={{ color: "var(--text-primary)" }}>@{ch}</span>
              {active && <AppIcon icon={Check} size="sm" color="var(--accent-text)" />}
            </button>
          );
        })
      }
    </Popover>
  );
}
