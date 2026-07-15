"use client";

import type { ReactNode } from "react";

type SubNavItem = { id: string; label: string; badge?: number | string; icon?: ReactNode };

type SubNavProps = {
  items: SubNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
};

/**
 * Alan içi ikincil navigasyon — referans ADR-021: segmentli pill rail. Koyu gömük
 * rail; seçili sekme daha açık grafit kapsül (nötr dolgu + hafif gölge), terracotta
 * yalnız aktif ayrıntı/focus. İkon opsiyonel. Alt-tab tek ise render edilmez.
 */
export default function SubNav({ items, activeId, onSelect }: SubNavProps) {
  if (items.length <= 1) return null;

  return (
    <nav
      className="app-subnav"
      aria-label="Alt navigasyon"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        marginBottom: "var(--space-6)",
        padding: 4,
        background: "var(--bg-sunken)",
        border: "1px solid var(--border-faint)",
        borderRadius: "var(--radius-pill)",
        maxWidth: "100%",
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            data-testid={`subnav-tab-${item.id}`}
            onClick={() => onSelect(item.id)}
            aria-current={isActive ? "page" : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: isActive ? "var(--bg-elevated)" : "transparent",
              border: "none",
              borderRadius: "var(--radius-pill)",
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              fontFamily: "inherit",
              padding: "7px 15px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow: isActive ? "var(--shadow-sm)" : "none",
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = "var(--text-primary)";
                e.currentTarget.style.background = "var(--bg-hover)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = "var(--text-secondary)";
                e.currentTarget.style.background = "transparent";
              }
            }}
          >
            {item.icon && (
              <span
                style={{ display: "inline-flex", flexShrink: 0, color: isActive ? "var(--accent-text)" : "inherit" }}
              >
                {item.icon}
              </span>
            )}
            {item.label}
            {item.badge != null && (
              <span
                style={{
                  fontSize: "var(--text-2xs)",
                  fontWeight: 500,
                  color: "var(--text-muted)",
                  background: "var(--bg-surface)",
                  borderRadius: "var(--radius-pill)",
                  padding: "1px 7px",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
