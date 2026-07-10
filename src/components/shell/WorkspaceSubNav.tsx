"use client";

export type SubNavItem = { id: string; label: string };

type WorkspaceSubNavProps = {
  items: SubNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
};

/**
 * Workspace içi contextual secondary nav — aktif alanın alt sayfaları.
 * Sidebar yalnız 5 üst-düzey alan taşır; sayfa geçişi burada yaşar.
 */
export default function WorkspaceSubNav({ items, activeId, onSelect }: WorkspaceSubNavProps) {
  if (items.length <= 1) return null;
  return (
    <div
      className="app-desktop-only"
      role="tablist"
      aria-label="Alan sayfaları"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "0 var(--space-page-x)",
        height: 44,
        borderBottom: "1px solid var(--border-faint)",
        background: "var(--bg-workspace)",
        position: "sticky",
        top: 52,
        zIndex: 35,
        overflowX: "auto",
        flexShrink: 0,
      }}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={active}
            data-testid={`subnav-tab-${item.id}`}
            onClick={() => onSelect(item.id)}
            style={{
              position: "relative",
              height: "100%",
              padding: "0 14px",
              background: "transparent",
              border: "none",
              color: active ? "var(--text-primary)" : "var(--text-muted)",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = "var(--text-secondary)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            {item.label}
            {active && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 10,
                  right: 10,
                  bottom: 0,
                  height: 2,
                  borderRadius: 2,
                  background: "var(--accent)",
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
