"use client";

import type { ReactNode } from "react";
import { scoreColor } from "@/lib/utils/scoreColor";

type ScoreRow = {
  name: string;
  value: number;
  /** Risk gibi "yüksek = kötü" skorlar için true. */
  invert?: boolean;
  /** Varsayılan 100. */
  max?: number;
};

type ScoreBarsProps = {
  rows: ScoreRow[];
  title?: string;
  dense?: boolean;
  footer?: ReactNode;
};

/**
 * Skor çubukları — label + değer + track + dolgu. Renk scoreColor'dan türer.
 * "CriticBreakdown" = 7 satırlık ScoreBars + footer (öneri/açı/gerekçe).
 */
export default function ScoreBars({ rows, title, dense = false, footer }: ScoreBarsProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: dense ? 8 : 11 }}>
      {title && (
        <div className="eyebrow" style={{ color: "var(--text-muted)" }}>
          {title}
        </div>
      )}
      {rows.map((r) => {
        const max = r.max ?? 100;
        const pct = Math.max(0, Math.min(100, (r.value / max) * 100));
        const color = scoreColor(r.value, { invert: r.invert });
        return (
          <div key={r.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)" }}>
              <span style={{ color: "var(--text-secondary)" }}>{r.name}</span>
              <span className="tnum" style={{ color, fontWeight: 500 }}>
                {Math.round(r.value)}
              </span>
            </div>
            <div
              style={{
                height: 5,
                borderRadius: "var(--radius-pill)",
                background: "var(--bg-sunken)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: color,
                  borderRadius: "var(--radius-pill)",
                  transition: "width 0.3s var(--ease-out)",
                }}
              />
            </div>
          </div>
        );
      })}
      {footer && <div style={{ marginTop: 4 }}>{footer}</div>}
    </div>
  );
}
