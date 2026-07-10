"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import SearchInput from "@/components/ui/SearchInput";
import Drawer from "@/components/ui/Drawer";
import { useSystemStatus } from "./useSystemStatus";

type TopStripProps = {
  areaLabel: string;
  subTabLabel?: string;
};

/**
 * Kompakt top bar: breadcrumb + arama (Cmd-K) + sistem durum butonu.
 * Mobil navigasyon bottom bar'da yaşar (hamburger yok).
 */
export default function TopStrip({ areaLabel, subTabLabel }: TopStripProps) {
  const hasSub = Boolean(subTabLabel && subTabLabel !== areaLabel);

  return (
    <header
      className="app-topstrip"
      style={{
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 var(--space-page-x)",
        borderBottom: "1px solid var(--border-faint)",
        background: "var(--surface-overlay)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        position: "sticky",
        top: 0,
        zIndex: 40,
        flexShrink: 0,
      }}
    >
      <nav
        aria-label="Breadcrumb"
        style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}
      >
        {hasSub ? (
          <>
            <span className="eyebrow" style={{ color: "var(--text-muted)" }}>
              {areaLabel}
            </span>
            <span style={{ color: "var(--border-strong)" }}>/</span>
            <span
              style={{
                fontSize: "var(--text-md)",
                fontWeight: 500,
                color: "var(--text-primary)",
                letterSpacing: "-0.01em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {subTabLabel}
            </span>
          </>
        ) : (
          <span
            style={{ fontSize: "var(--text-md)", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
          >
            {areaLabel}
          </span>
        )}
      </nav>

      {/* Sağ küme: arama + durum */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <SearchInput
          className="app-desktop-only"
          placeholder="Ekrana atla…"
          kbdHint="⌘K"
          width={200}
          onClick={() => window.dispatchEvent(new CustomEvent("cemos:open-palette"))}
        />
        <SystemStatusButton />
      </div>
    </header>
  );
}

/**
 * Sistem durum butonu — nokta + kısa etiket; tıklanınca sorun drawer'ı açılır.
 * Sağlıklıyken sessiz; sorun sayısı arttıkça renk uyarıya döner.
 */
function SystemStatusButton() {
  const { todayCost, workerStatus, problems } = useSystemStatus();
  const [open, setOpen] = useState(false);

  const hasError = problems.some((p) => p.severity === "error");
  const hasWarn = problems.length > 0;
  const dot = hasError
    ? "var(--status-error)"
    : hasWarn
      ? "var(--status-warn)"
      : workerStatus === "unknown"
        ? "var(--text-muted)"
        : "var(--status-ok)";
  const label = hasWarn ? `${problems.length} sorun` : "Sağlıklı";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Sistem durumu: ${label}`}
        title={`Sistem durumu: ${label}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          height: "var(--control-h-sm)",
          padding: "0 10px",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          color: hasError ? "var(--status-error)" : hasWarn ? "var(--status-warn)" : "var(--text-secondary)",
          fontSize: "var(--text-xs)",
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: dot,
            boxShadow: hasWarn ? `0 0 6px ${dot}` : "none",
            flexShrink: 0,
          }}
        />
        <span className="app-desktop-only">{label}</span>
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} title="Sistem Durumu" width={420}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
              Bugünkü maliyet
            </span>
            <span className="tnum" style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 500 }}>
              {todayCost != null ? `$${todayCost.toFixed(4)}` : "—"}
            </span>
          </div>

          {problems.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "12px",
                background: "color-mix(in srgb, var(--status-ok) 8%, transparent)",
                border: "1px solid color-mix(in srgb, var(--status-ok) 25%, transparent)",
                borderRadius: "var(--radius-sm)",
                color: "var(--status-ok)",
                fontSize: "var(--text-sm)",
              }}
            >
              <Activity size={15} strokeWidth={2} />
              Tüm sistemler sağlıklı görünüyor.
            </div>
          ) : (
            problems.map((p, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 12px",
                  background: `color-mix(in srgb, var(--status-${p.severity === "error" ? "error" : "warn"}) 8%, transparent)`,
                  border: `1px solid color-mix(in srgb, var(--status-${p.severity === "error" ? "error" : "warn"}) 25%, transparent)`,
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <div
                  style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    color: p.severity === "error" ? "var(--status-error)" : "var(--status-warn)",
                  }}
                >
                  {p.label}
                </div>
                {p.detail && (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginTop: 4 }}>
                    {p.detail}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Drawer>
    </>
  );
}
