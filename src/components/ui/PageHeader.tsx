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
   * "hero" (28px, referans workspace başlığı — açıklama başlık ALTINDA) |
   * "display" (24px) | "page" (20px) | "compact" (18px). Referans ADR-021: alan
   * giriş ekranları hero; alt paneller display/page.
   */
  size?: "hero" | "display" | "page" | "compact";
};

const TITLE_SIZE: Record<NonNullable<PageHeaderProps["size"]>, string> = {
  hero: "28px",
  display: "var(--text-2xl)",
  page: "var(--text-xl)",
  compact: "var(--text-lg)",
};

/**
 * Ekran başlığı. `hero` = referans workspace başlığı (büyük, açıklama altında,
 * segmented nav üstünde). Diğer boyutlar kompakt operasyonel (eyebrow + başlık +
 * inline açıklama + sağda aksiyonlar).
 */
export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  meta,
  size = "display",
}: PageHeaderProps) {
  const isHero = size === "hero";

  return (
    <header style={{ marginBottom: "var(--space-6)" }}>
      <div
        style={{
          display: "flex",
          alignItems: isHero ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: isHero ? "column" : "row",
            alignItems: isHero ? "flex-start" : "baseline",
            gap: isHero ? 6 : 10,
            flexWrap: "wrap",
          }}
        >
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
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <span
              style={{
                fontSize: isHero ? "var(--text-sm)" : "var(--text-sm)",
                color: "var(--text-muted)",
                lineHeight: 1.55,
                maxWidth: 620,
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
            marginTop: 12,
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
