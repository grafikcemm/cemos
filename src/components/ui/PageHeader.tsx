"use client";

import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  /** Üstte küçük büyük-harf etiket (editöryal "eyebrow"). */
  eyebrow?: string;
  actions?: ReactNode;
  /** Accent band (gradyan yüzey + kenar) — yalnızca öne çıkan ekranlarda. */
  surface?: boolean;
  /** Başlığın altına ince meta/stat şeridi (editöryal künye satırı). */
  meta?: ReactNode;
  /** "display" (48px hero) | "page" (36px, hero-olmayan sayfalar). */
  size?: "display" | "page";
};

/**
 * Editöryal ekran başlığı — iri Fraunces display + eyebrow + meta künyesi + hero aksiyon.
 * Magazine hiyerarşisi: her ekranın üst "manşeti". Sola yaslı.
 */
export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  surface = false,
  meta,
  size = "display",
}: PageHeaderProps) {
  return (
    <header
      style={{
        marginBottom: "var(--space-section-sm)",
        ...(surface
          ? {
              padding: "26px 28px",
              borderRadius: "var(--radius-2xl)",
              background: "var(--gradient-surface), var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              boxShadow: "var(--shadow-md), var(--highlight-top)",
            }
          : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {eyebrow && (
            <div className="eyebrow" style={{ color: "var(--accent-text)", marginBottom: 10 }}>
              {eyebrow}
            </div>
          )}
          <h1
            className="font-display"
            style={{
              margin: 0,
              fontSize: size === "page" ? "var(--text-display-md)" : "var(--text-display-lg)",
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
              lineHeight: 1.04,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                margin: "12px 0 0",
                fontSize: "var(--text-base)",
                color: "var(--text-secondary)",
                maxWidth: 640,
                lineHeight: 1.55,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>{actions}</div>
        )}
      </div>
      {meta && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 18,
            marginTop: 18,
            paddingTop: 16,
            borderTop: "1px solid var(--border-faint)",
            fontSize: "var(--text-sm)",
            color: "var(--text-secondary)",
          }}
        >
          {meta}
        </div>
      )}
    </header>
  );
}
