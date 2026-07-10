"use client";

import { useEffect, useState } from "react";

type HealthStatus = {
  openrouter: { configured: boolean; ok: boolean; message?: string };
  socialdata: { configured: boolean; ok: boolean; message?: string };
  buffer: { configured: boolean; ok: boolean; message?: string };
  database: { ok: boolean; message?: string };
  worker: {
    mode?: "worker" | "cron";
    inferredStatus: "unknown" | "recent_tick" | "stale";
    lastTickAt?: string;
    recommendation?: string;
  };
};

export default function AutomationManager() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [closed, setClosed] = useState(false);

  const checkHealth = async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      console.error("Otomasyon sağlık kontrolü hatası:", err);
    }
  };

  useEffect(() => {
     
    checkHealth();
    const interval = setInterval(checkHealth, 20000);
    return () => clearInterval(interval);
  }, []);

  if (!health) return null;

  // Yalnız KRİTİK durumda tam-genişlik band: worker modunda offline worker.
  // Cron modu / stale sinyaller TopStrip'teki sistem durum butonunda yaşar
  // (sorun drawer'ı) — sürekli banner gürültüsü yok.
  const isWorkerOffline = health.worker.inferredStatus !== "recent_tick";
  const isCron = health.worker.mode === "cron";
  const isCritical = isWorkerOffline && !isCron;

  if (!isCritical || closed) return null;

  const body =
    health.worker.recommendation ||
    "Otomatik tweet tarama, planlama ve yayınlama için terminalde npm run worker komutunu çalıştırın.";

  return (
    <div
      role="alert"
      style={{
        background: "color-mix(in srgb, var(--status-error) 8%, transparent)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid color-mix(in srgb, var(--status-error) 20%, transparent)",
        padding: "8px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 12,
        color: "var(--status-error)",
        gap: 12,
        flexShrink: 0,
        zIndex: 99,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14 }}>⚠️</span>
        <span>
          <strong>Arka Plan İşçisi (Worker) Çalışmıyor:</strong> {body}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => {
            checkHealth();
          }}
          style={{
            background: "color-mix(in srgb, var(--status-error) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--status-error) 30%, transparent)",
            borderRadius: "var(--radius-sm)",
            color: "var(--status-error)",
            padding: "2px 8px",
            fontSize: 10,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          Yeniden Dene
        </button>
        <button
          onClick={() => setClosed(true)}
          aria-label="Uyarıyı kapat"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--status-error)",
            fontSize: 14,
            cursor: "pointer",
            padding: "2px 6px",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
