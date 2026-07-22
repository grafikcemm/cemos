"use client";

import type { ReactNode } from "react";
import Drawer from "./Drawer";

type DetailPanelProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Chip satırı (handle / tarih / kanal). */
  meta?: ReactNode;
  /** Birincil içerik. */
  children: ReactNode;
  /** Genelde <ScoreBars/>. */
  scores?: ReactNode;
  /** Alt aksiyon butonları. */
  actions?: ReactNode;
  width?: number;
};

/**
 * Standart detay paneli — Drawer içinde başlık + meta + içerik + skorlar + aksiyon.
 * queue/flow/pattern detay drawer'larını tek kabuk altında birleştirir.
 */
export default function DetailPanel({
  open,
  onClose,
  title,
  meta,
  children,
  scores,
  actions,
  width = 540,
}: DetailPanelProps) {
  return (
    <Drawer open={open} onClose={onClose} title={title} width={width}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        {meta && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>{meta}</div>}
        <div>{children}</div>
        {scores && <div>{scores}</div>}
        {actions && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: "var(--space-2)",
              paddingTop: "var(--space-4)",
              borderTop: "1px solid var(--border-faint)",
            }}
          >
            {actions}
          </div>
        )}
      </div>
    </Drawer>
  );
}
