"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import SearchInput from "@/components/ui/SearchInput";
import Drawer from "@/components/ui/Drawer";
import { healthDotColor } from "@/lib/services/systemHealth";
import { useSystemHealth } from "./SystemHealthProvider";

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
 * Sistem durum chip'i (§8C — TEK türetilmiş health state) — nokta + kısa etiket;
 * tıklanınca detay drawer'ı açılır. Topbar chip = ANA gösterim. checking/healthy/
 * warning/unavailable AYNI kaynaktan (SystemHealthProvider); Bugün tiki de aynı.
 */
function SystemStatusButton() {
  const { result, contracts, todayCost, refresh } = useSystemHealth();
  const [open, setOpen] = useState(false);

  // Faz 1F (ADR-026): topbar YALNIZ en yüksek öncelikli actionable durumu
  // gösterir. "Kuyruk tamamlandı" ve "günlük hedef tamam" SORUN DEĞİLDİR
  // (level none → sessiz chip); ilgisiz sorunlar tek sayaca ezilmez.
  const topbar = result.state === "healthy" || result.state === "warning" ? contracts?.topbar : null;

  const dot = topbar
    ? topbar.level === "error"
      ? "var(--status-error)"
      : topbar.level === "warn"
        ? "var(--status-warn)"
        : topbar.level === "action"
          ? "var(--accent)"
          : "var(--status-ok)"
    : healthDotColor(result);
  const label = topbar ? topbar.label : result.label;
  const chipColor = topbar
    ? topbar.level === "error"
      ? "var(--status-error)"
      : topbar.level === "warn"
        ? "var(--status-warn)"
        : "var(--text-secondary)"
    : result.state === "warning"
      ? result.hasError
        ? "var(--status-error)"
        : "var(--status-warn)"
      : "var(--text-secondary)";

  return (
    <>
      <button
        type="button"
        data-testid="system-health-chip"
        data-health-state={result.state}
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
          color: chipColor,
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
            boxShadow: result.state === "warning" ? `0 0 6px ${dot}` : "none",
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

          {result.state === "checking" ? (
            <StatusNote tone="muted">Durum kontrol ediliyor…</StatusNote>
          ) : result.state === "unavailable" ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 9,
                padding: "12px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-secondary)",
                fontSize: "var(--text-sm)",
              }}
            >
              <span>Durum alınamadı — sorun sayısı belirlenemiyor.</span>
              <button
                type="button"
                onClick={refresh}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-secondary)",
                  padding: "2px 8px",
                  fontSize: "var(--text-2xs)",
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                Yeniden dene
              </button>
            </div>
          ) : result.problems.length === 0 ? (
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
            result.problems.map((p, i) => (
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

function StatusNote({ tone, children }: { tone: "muted"; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "12px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        color: tone === "muted" ? "var(--text-muted)" : "var(--text-secondary)",
        fontSize: "var(--text-sm)",
      }}
    >
      {children}
    </div>
  );
}
