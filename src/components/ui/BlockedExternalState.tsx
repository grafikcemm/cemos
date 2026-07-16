"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";

type BlockedExternalStateProps = {
  /** Neyin engellendiği — kısa başlık. */
  title: string;
  /** Türkçe, teknik-olmayan açıklama: neden engelli + kullanıcının ne yapabileceği. */
  description: string;
  /** İnce alt satır (ör. maliyet senaryosu, gereken env adı). Secret değeri ASLA. */
  detail?: ReactNode;
  /**
   * Tek kurtarma yolu. ÖNEMLİ: bu buton engellenen dış işlemi GERÇEKLEŞTİRMEZ
   * (ör. X API "Onay ver" gerçek ödeme yapmaz — yalnız maliyet/kurulum akışına yönlendirir).
   */
  action?: ReactNode;
  /** İkincil, düşük vurgulu alternatif (ör. "Şimdilik yalnızca 'X'te aç'"). */
  fallback?: ReactNode;
  compact?: boolean;
};

/**
 * Dürüst DIŞ-ENGEL durumu (durumlar galerisi D). error ≠ blocked-external:
 * hata "bir şeyler ters gitti"; dış-engel "CemOS çalışıyor ama dışarıdan bir
 * onay/kimlik/kota gerekiyor". Nötr kilit tonu (danger kırmızısı DEĞİL) — bu
 * bir başarısızlık değil, bekleyen dış adım. X API ödeme onayı, Meta izni,
 * YouTube anahtarı, OpenRouter 402 vb. için tek paylaşılan kabuk.
 */
export default function BlockedExternalState({
  title,
  description,
  detail,
  action,
  fallback,
  compact = false,
}: BlockedExternalStateProps) {
  return (
    <div
      role="status"
      data-state="blocked"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        padding: compact ? "16px 18px" : "22px 24px",
        background: "color-mix(in srgb, var(--status-warn) 6%, var(--bg-surface))",
        border: "1px solid color-mix(in srgb, var(--status-warn) 30%, transparent)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <div
        aria-hidden
        style={{
          display: "grid",
          placeItems: "center",
          width: compact ? 34 : 40,
          height: compact ? 34 : 40,
          flexShrink: 0,
          borderRadius: "var(--radius-md)",
          background: "color-mix(in srgb, var(--status-warn) 14%, var(--bg-elevated))",
          border: "1px solid color-mix(in srgb, var(--status-warn) 32%, transparent)",
          color: "var(--status-warn-text)",
        }}
      >
        <Lock size={compact ? 15 : 17} strokeWidth={2} />
      </div>

      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: "var(--text-2xs)",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--status-warn-text)",
            }}
          >
            Dış engel
          </span>
        </div>
        <div
          className="font-display"
          style={{ fontSize: "var(--text-md)", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
        >
          {title}
        </div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: 560 }}>
          {description}
        </div>
        {detail && (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.6, marginTop: 2 }}>
            {detail}
          </div>
        )}
        {(action || fallback) && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
            {action}
            {fallback}
          </div>
        )}
      </div>
    </div>
  );
}
