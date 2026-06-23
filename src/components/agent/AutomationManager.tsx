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

  const isWorkerOffline = health.worker.inferredStatus !== "recent_tick";
  // On serverless (cron mode) an offline status is informational, not a hard
  // error: automation runs once daily, so amber framing fits better than red.
  const isCron = health.worker.mode === "cron";
  const accent = isCron ? "217, 119, 87" : "239, 68, 68";
  const textColor = isCron ? "#fcd34d" : "#fca5a5";
  const title = isCron
    ? "Otomasyon: Günlük Cron"
    : "Arka Plan İşçisi (Worker) Çalışmıyor:";
  const body =
    health.worker.recommendation ||
    "Otomatik tweet tarama, planlama ve yayınlama için terminalde npm run worker komutunu çalıştırın.";

  if (isWorkerOffline && !closed) {
    return (
      <div
        style={{
          background: `rgba(${accent}, 0.08)`,
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid rgba(${accent}, 0.2)`,
          padding: "8px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          color: textColor,
          gap: 12,
          position: "relative",
          zIndex: 99,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>{isCron ? "🛈" : "⚠️"}</span>
          <span>
            <strong>{title}</strong> {body}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => {
              checkHealth();
            }}
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: 4,
              color: "#fff",
              padding: "2px 8px",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            Yeniden Dene
          </button>
          <button
            onClick={() => setClosed(true)}
            style={{
              background: "transparent",
              border: "none",
              color: "#fca5a5",
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

  return null;
}
