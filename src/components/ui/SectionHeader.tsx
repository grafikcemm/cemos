"use client";

import type { ReactNode } from "react";

type SectionHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Üstte küçük büyük-harf editöryal etiket. */
  eyebrow?: string;
};

/** Title + optional description and trailing action, used inside cards/panels. */
export default function SectionHeader({ title, description, action, eyebrow }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: description ? 12 : 10,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <div className="eyebrow" style={{ color: "var(--accent-text)", marginBottom: 6 }}>
            {eyebrow}
          </div>
        )}
        <h3
          className="font-display"
          style={{
            margin: 0,
            fontSize: "var(--text-lg)",
            fontWeight: 500,
            color: "var(--text-primary)",
            letterSpacing: "-0.015em",
          }}
        >
          {title}
        </h3>
        {description && (
          <p style={{ margin: "3px 0 0", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            {description}
          </p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
