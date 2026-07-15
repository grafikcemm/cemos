"use client";

import { useEffect, useState } from "react";
import { Brain, Plug, Activity, DollarSign, Settings, LogOut, type LucideIcon } from "lucide-react";
import { PROFILE_TABS } from "@/components/nav/navConfig";
import { logoutAndRedirect, confirmLogout } from "@/lib/auth/clientLogout";

const ITEM_ICONS: Record<string, LucideIcon> = {
  "profile-memory": Brain,
  "profile-integrations": Plug,
  system: Activity,
  costs: DollarSign,
  settings: Settings,
};

type ProfileMenuProps = {
  /** Aktif Profil yüzeyi id'si (vurgu için) — değilse null. */
  activeId: string | null;
  onSelect: (tabId: string) => void;
  onClose: () => void;
};

/**
 * Profil menüsü (05 §A6) — utility/system/settings ana navdan buraya. Sidebar
 * (desktop) ve MobileNav (sheet) trigger'larından açılır; yukarı doğru açılan
 * popover. 5 yüzey + Çıkış. Çıkış cookie'yi temizler ve /giris'e döner.
 */
export default function ProfileMenu({ activeId, onSelect, onClose }: ProfileMenuProps) {
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleLogout = async () => {
    if (loggingOut || !confirmLogout()) return;
    setLoggingOut(true);
    await logoutAndRedirect();
  };

  return (
    <>
      {/* Dışarı tık kapatma perdesi (görünmez) */}
      <div aria-hidden onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
      <div
        role="menu"
        aria-label="Profil"
        data-testid="profile-menu"
        style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
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
        {PROFILE_TABS.map((tab) => {
          const Icon = ITEM_ICONS[tab.id] ?? Settings;
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              role="menuitem"
              data-testid={`profile-item-${tab.id}`}
              onClick={() => onSelect(tab.id)}
              aria-current={active ? "page" : undefined}
              style={menuItemStyle(active)}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              <Icon size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
              <span>{tab.label}</span>
            </button>
          );
        })}

        <div aria-hidden style={{ height: 1, background: "var(--border-faint)", margin: "5px 4px" }} />

        <button
          role="menuitem"
          data-testid="profile-logout"
          onClick={handleLogout}
          disabled={loggingOut}
          style={{ ...menuItemStyle(false), color: "var(--status-error)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "color-mix(in srgb, var(--status-error) 8%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <LogOut size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span>{loggingOut ? "Çıkılıyor…" : "Çıkış"}</span>
        </button>
      </div>
    </>
  );
}

function menuItemStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    minHeight: 36,
    padding: "0 10px",
    borderRadius: "var(--radius-sm)",
    border: "none",
    background: active ? "var(--accent-dark)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-primary)",
    fontSize: "var(--text-sm)",
    fontWeight: active ? 500 : 400,
    fontFamily: "inherit",
    cursor: "pointer",
    textAlign: "left",
  };
}
