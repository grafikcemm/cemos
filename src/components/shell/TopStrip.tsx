"use client";

import { Menu } from "lucide-react";

type TopStripProps = {
  areaLabel: string;
  subTabLabel?: string;
  onOpenMobileNav: () => void;
};

/** Slim top strip: breadcrumb (Area ▸ SubTab) + mobile hamburger. */
export default function TopStrip({ areaLabel, subTabLabel, onOpenMobileNav }: TopStripProps) {
  const hasSub = Boolean(subTabLabel && subTabLabel !== areaLabel);
  return (
    <header
      className="app-topstrip"
      style={{
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 24px",
        borderBottom: "1px solid var(--border)",
        background: "rgba(10,10,10,0.8)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <button
        className="app-mobile-nav-toggle"
        onClick={onOpenMobileNav}
        aria-label="Menüyü aç"
        style={{
          display: "none",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        <Menu size={17} />
      </button>

      <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {hasSub ? (
          <>
            <span className="eyebrow" style={{ color: "var(--text-muted)" }}>
              {areaLabel}
            </span>
            <span style={{ color: "var(--border-strong)" }}>/</span>
            <span
              className="font-display"
              style={{ fontSize: "var(--text-md)", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
            >
              {subTabLabel}
            </span>
          </>
        ) : (
          <span
            className="font-display"
            style={{ fontSize: "var(--text-md)", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
          >
            {areaLabel}
          </span>
        )}
      </nav>
    </header>
  );
}
