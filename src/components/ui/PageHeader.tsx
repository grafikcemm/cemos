"use client";

import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  /** Üstte küçük büyük-harf etiket (eyebrow). */
  eyebrow?: string;
  actions?: ReactNode;
  /**
   * Legacy: eski gradyan hero bandı. Dashboard dilinde hero yok — prop API
   * uyumluluğu için tutulur, görsel etkisi kaldırıldı.
   */
  surface?: boolean;
  /** Başlığın altına ince meta/stat şeridi. */
  meta?: ReactNode;
  /**
   * "display" (24px, alan giriş ekranı) | "page" (20px) | "compact" (18px).
   * Dashboard yoğunluğu: tüm boyutlar operasyonel — eski 48px manşet kalktı.
   */
  size?: "display" | "page" | "compact";
};

const TITLE_SIZE: Record<NonNullable<PageHeaderProps["size"]>, string> = {
  display: "var(--text-2xl)",
  page: "var(--text-xl)",
  compact: "var(--text-lg)",
};

/**
 * Kompakt operasyonel ekran başlığı — dashboard dili: küçük, sessiz, içerik
 * ilk viewport'ta başlar. Eyebrow + başlık + kısa açıklama + sağda aksiyonlar.
 */
export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  meta,
  size = "display",
}: PageHeaderProps) {
  return (
    <header style={{ marginBottom: "var(--space-6)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          {eyebrow && (
            <span className="eyebrow" style={{ color: "var(--text-muted)", fontSize: "var(--text-2xs)" }}>
              {eyebrow}
            </span>
          )}
          <h1
            className="font-display"
            style={{
              margin: 0,
              fontSize: TITLE_SIZE[size],
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.015em",
              lineHeight: 1.2,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <span
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--text-muted)",
                lineHeight: 1.5,
                maxWidth: 560,
              }}
            >
              {subtitle}
            </span>
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
            gap: 14,
            marginTop: 10,
            fontSize: "var(--text-xs)",
            color: "var(--text-secondary)",
          }}
        >
          {meta}
        </div>
      )}
    </header>
  );
}
