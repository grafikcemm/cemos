"use client";

import type { ReactNode } from "react";

export type MetricStripTone = "default" | "ok" | "warn" | "danger" | "accent";

export type MetricStripItem = {
  label: string;
  value: ReactNode;
  tone?: MetricStripTone;
};

type MetricStripProps = {
  items: MetricStripItem[];
  "data-testid"?: string;
};

const TONE_COLOR: Record<MetricStripTone, string> = {
  default: "var(--text-primary)",
  ok: "var(--status-ok-text)",
  warn: "var(--status-warn-text)",
  danger: "var(--status-error)",
  accent: "var(--accent-text)",
};

/**
 * Sessiz metrik şeridi (06 spec) — hero KPI kartlarının tek meşru alternatifi.
 * Tek satır: baseline hizalı değer + soluk etiket, hücreler ince dikey ayırıcıyla.
 * Kart-içinde-kart yok, büyük sayı kahramanlığı yok; terracotta yalnız `tone`
 * ile anlamlı vurguda. News Pool / YouTube özet diliyle aynı aile.
 */
export default function MetricStrip({ items, "data-testid": testId }: MetricStripProps) {
  return (
    <div
      data-testid={testId}
      style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", rowGap: 8 }}
    >
      {items.map((m, i) => (
        <span
          key={m.label}
          data-metric={m.label}
          style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}
        >
          {i > 0 && (
            <span
              aria-hidden
              style={{
                alignSelf: "center",
                width: 1,
                height: 13,
                background: "var(--border)",
                margin: "0 14px",
                flexShrink: 0,
              }}
            />
          )}
          <span
            className="tnum"
            style={{
              fontSize: "var(--text-md)",
              fontWeight: 600,
              color: TONE_COLOR[m.tone ?? "default"],
            }}
          >
            {m.value}
          </span>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{m.label}</span>
        </span>
      ))}
    </div>
  );
}
