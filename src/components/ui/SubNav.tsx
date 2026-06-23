"use client";

type SubNavItem = { id: string; label: string; badge?: number | string };

type SubNavProps = {
  items: SubNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
};

/** Secondary horizontal navigation within a primary area. */
export default function SubNav({ items, activeId, onSelect }: SubNavProps) {
  if (items.length <= 1) return null;

  return (
    <nav
      className="app-subnav"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        marginBottom: "var(--space-5)",
        borderBottom: "1px solid var(--border)",
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
              gap: 6,
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: "var(--text-sm)",
              fontWeight: isActive ? 500 : 400,
              fontFamily: "inherit",
              padding: "8px 12px",
              marginBottom: -1,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            {item.label}
            {item.badge != null && (
              <span
                style={{
                  fontSize: "var(--text-2xs)",
                  fontWeight: 500,
                  color: "var(--text-muted)",
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius-sm)",
                  padding: "1px 6px",
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
