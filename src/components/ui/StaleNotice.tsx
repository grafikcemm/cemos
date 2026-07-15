"use client";

import type { ReactNode } from "react";

type StaleNoticeProps = {
  /** Ana uyarı — varsayılan whyToday.freshnessWarning cümlesiyle uyumlu. */
  message?: string;
  /** İnce sol etiket (ör. "veri 6 saat önce"). */
  ageLabel?: ReactNode;
  /** Sağdaki yeniden-doğrula eylemi (opsiyonel). */
  onRevalidate?: () => void;
  revalidateLabel?: string;
};

/**
 * Dürüst ESKİ (stale) uyarısı (durumlar galerisi C) — "içerik görünür durur,
 * sinyaller eskimiş olabilir; karar öncesi yeniden doğrula". readiness'ten AYRI
 * bir eksen (Faz 1C.2 ADR-023): "Kontrolleri geçti" ile "Kaynak eski" çelişki
 * değil. warn tonu (danger DEĞİL). Kart ve drawer aynı cümleyi paylaşır.
 */
export default function StaleNotice({
  message = "Kaynak eski; yayınlamadan önce güncelliği kontrol et.",
  ageLabel,
  onRevalidate,
  revalidateLabel = "Yeniden doğrula",
}: StaleNoticeProps) {
  return (
    <div
      role="note"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "9px 13px",
        background: "color-mix(in srgb, var(--status-warn) 8%, var(--bg-sunken))",
        border: "1px solid color-mix(in srgb, var(--status-warn) 28%, transparent)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "var(--radius-pill)",
          background: "var(--status-warn)",
          flexShrink: 0,
        }}
      />
      {ageLabel && (
        <span style={{ fontSize: "var(--text-xs)", color: "var(--status-warn-text)", fontWeight: 500 }}>{ageLabel}</span>
      )}
      <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.5, flex: "1 1 240px", minWidth: 0 }}>
        {message}
      </span>
      {onRevalidate && (
        <button
          onClick={onRevalidate}
          style={{
            flexShrink: 0,
            background: "transparent",
            border: "none",
            color: "var(--accent-text)",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: "pointer",
            padding: "2px 4px",
            borderRadius: "var(--radius-sm)",
          }}
        >
          {revalidateLabel}
        </button>
      )}
    </div>
  );
}
