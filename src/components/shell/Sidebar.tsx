"use client";

import { useState } from "react";
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
 * Referans-hizalı dar sidebar (ADR-021, 05 §A2): near-black rail → marka →
 * hesap bağlam kartı (aktif kanal + değiştir) → Bugün/Plan/Kütüphane (nötr grafit
 * aktif dolgu, terracotta yalnız ikon/indicator vurgusu) → Toolbox → Profil.
 * **Collapse YOK** (06 §7). ≤640'ta bottom-nav'a devreder (`.app-sidebar-desktop`).
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
        width: "var(--sidebar-w)",
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
          padding: "18px 20px 14px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "var(--radius-sm)",
            background: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
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

      {/* Hesap bağlam kartı (referans: logo altında belirgin kart) */}
      <div style={{ padding: "0 12px 8px", flexShrink: 0 }}>
        <AccountCard channel={activeChannel} onSelect={setActiveChannel} />
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

      {/* Dip: Profil tetikleyici */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: 12,
          borderTop: "1px solid var(--border-faint)",
          flexShrink: 0,
        }}
      >
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
              height: 36,
              padding: "0 12px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: profileActive ? "var(--bg-elevated)" : "transparent",
              color: profileActive ? "var(--text-primary)" : "var(--text-muted)",
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
            <CircleUserRound
              size={17}
              strokeWidth={2}
              style={{ flexShrink: 0, color: profileActive ? "var(--accent-text)" : "inherit" }}
            />
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

/**
 * Hesap bağlam kartı — aktif kanalı avatar + @handle ile gösterir; tıklayınca
 * kanal değiştirici açılır (grafikcem ↔ maskulenkod). Referanstaki account
 * context kartının CemOS eşleşmesi (anlamsız "Admin account" kopyalanmaz).
 */
function AccountCard({ channel, onSelect }: { channel: Channel; onSelect: (c: Channel) => void }) {
  const [open, setOpen] = useState(false);
  const initial = channel.charAt(0).toUpperCase();

  return (
    <div style={{ position: "relative" }}>
      <button
        data-testid="sidebar-account"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Aktif hesap: @${channel} — değiştir`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "8px 10px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-faint)",
          background: "var(--bg-surface)",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-faint)")}
      >
        <span
          aria-hidden
          style={{
            width: 30,
            height: 30,
            borderRadius: "var(--radius-pill)",
            background: "var(--accent-dark)",
            color: "var(--accent-text)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            fontSize: "var(--text-sm)",
            fontWeight: 600,
          }}
        >
          {initial}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            @{channel}
          </span>
          <span style={{ display: "block", fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
            Aktif hesap
          </span>
        </span>
        <ChevronsUpDown size={14} strokeWidth={2} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
      </button>

      {open && (
        <>
          <div aria-hidden onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
          <div
            role="menu"
            aria-label="Hesap değiştir"
            data-testid="account-switcher"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 100,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-modal)",
              padding: 6,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            {CHANNELS.map((ch) => {
              const active = ch === channel;
              return (
                <button
                  key={ch}
                  role="menuitem"
                  data-testid={`account-option-${ch}`}
                  onClick={() => {
                    onSelect(ch);
                    setOpen(false);
                  }}
                  aria-current={active ? "true" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    minHeight: 34,
                    padding: "0 8px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    background: active ? "var(--bg-hover)" : "transparent",
                    color: "var(--text-primary)",
                    fontSize: "var(--text-sm)",
                    fontWeight: active ? 500 : 400,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span style={{ flex: 1 }}>@{ch}</span>
                  {active && <Check size={14} strokeWidth={2.4} style={{ color: "var(--accent-text)" }} />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
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
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        height: 38,
        padding: "0 12px",
        borderRadius: "var(--radius-sm)",
        border: "none",
        // Referans: aktif = nötr grafit dolgu (terracotta satırı boyamaz).
        background: active ? "var(--bg-elevated)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
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
      {/* Terracotta yalnız ikon vurgusu (küçük accent), satır dolgusu nötr. */}
      <span style={{ display: "inline-flex", flexShrink: 0, color: active ? "var(--accent-text)" : "inherit" }}>
        {icon}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
}
