"use client";

import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Daha sessiz, küçük varyant (inline boş liste için). */
  compact?: boolean;
};

/**
 * Birinci sınıf boş-durum — ekranın asla "yarım" görünmemesi için.
 * Lucide ikon + accent-tinted disk + başlık + yardım + birincil aksiyon.
 */
export default function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 12,
        padding: compact ? "32px 20px" : "56px 28px",
        color: "var(--text-secondary)",
      }}
    >
      {icon && (
        <div
          style={{
            display: "grid",
            placeItems: "center",
            width: compact ? 44 : 56,
            height: compact ? 44 : 56,
            borderRadius: "var(--radius-lg)",
            background: "var(--gradient-accent), var(--bg-elevated)",
            border: "1px solid var(--accent-border)",
            color: "var(--accent-text)",
            boxShadow: "var(--highlight-top)",
            marginBottom: 4,
          }}
        >
          {icon}
        </div>
      )}
      <div
        className="font-display"
        style={{
          fontSize: compact ? "var(--text-md)" : "var(--text-lg)",
          fontWeight: 700,
          color: "var(--text-primary)",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </div>
      {description && (
        <div style={{ fontSize: "var(--text-sm)", maxWidth: 380, lineHeight: 1.6 }}>{description}</div>
      )}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
