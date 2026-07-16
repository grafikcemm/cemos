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
  type LucideIcon,
} from "lucide-react";
import { useXAgentStore, DEFAULT_CHANNELS, type Channel } from "@/store/xagent";
import { PRIMARY_AREAS, type PrimaryAreaId } from "@/components/nav/navConfig";
import AppIcon from "@/components/ui/AppIcon";
import Popover from "@/components/ui/Popover";
import ProfileMenu from "./ProfileMenu";


const AREA_ICONS: Record<string, LucideIcon> = {
  Sunrise,
  CalendarRange,
  Library,
};

type SidebarProps = {
  highlightArea: PrimaryAreaId | null;
  toolboxActive: boolean;
  profileActive: boolean;
  activeProfileId: string | null;
  onSelectArea: (areaId: PrimaryAreaId) => void;
  onSelectToolbox: () => void;
  onSelectProfileTab: (tabId: string) => void;
  onNavigate?: () => void;
};

/**
 * Referans-sadakat sidebar (ADR-021): near-black rail → özgün CemOS lockup →
 * işlenmiş hesap bağlam kartı → Bugün/Plan/Kütüphane (nötr grafit slab, terracotta
 * yalnız ikon vurgusu) → ayırıcı → Toolbox → Profil. Ortak CSS sınıfları (inline
 * style + JS hover yerine). Tüm ikonlar AppIcon (tek optik boyut/stroke).
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

      {/* Ana nav + Toolbox */}
      <nav className="cx-sidebar-scroll">
        {PRIMARY_AREAS.map((area) => (
          <NavItem
            key={area.id}
            testid={`sidebar-area-${area.id}`}
            label={area.label}
            icon={AREA_ICONS[area.icon] ?? Compass}
            active={highlightArea === area.id && !toolboxActive && !profileActive}
            onClick={() => go(() => onSelectArea(area.id))}
          />
        ))}

        <div className="cx-divider" aria-hidden />

        <NavItem
          testid="sidebar-toolbox"
          label="Toolbox"
          icon={Wrench}
          active={toolboxActive}
          onClick={() => go(onSelectToolbox)}
        />
      </nav>

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
  onClick,
}: {
  testid: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button data-testid={testid} onClick={onClick} aria-current={active ? "page" : undefined} className="cx-nav-item">
      <AppIcon icon={icon} size="md" active={active} />
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
