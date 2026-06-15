"use client";

import { useSystemStatus } from "./useSystemStatus";

type SystemStatusProps = {
  /** Collapsed sidebar → dot-only compact view. */
  compact?: boolean;
};

/** Today's cost + worker/cron heartbeat. Lives in the sidebar footer. */
export default function SystemStatus({ compact = false }: SystemStatusProps) {
  const { todayCost, workerStatus, workerMode } = useSystemStatus();

  const dot =
    workerStatus === "recent_tick"
      ? "var(--green)"
      : workerStatus === "stale"
        ? "var(--yellow)"
        : "var(--text-muted)";

  const workerLabel =
    workerMode === "cron"
      ? workerStatus === "recent_tick"
        ? "Cron: OK"
        : workerStatus === "stale"
          ? "Cron: Gecikmiş"
          : "Cron: ?"
      : workerStatus === "recent_tick"
        ? "Worker: OK"
        : workerStatus === "stale"
          ? "Worker: Stale"
          : "Worker: ?";

  if (compact) {
    return (
      <div
        title={workerLabel}
        style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, boxShadow: `0 0 6px ${dot}` }} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 10px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>{workerLabel}</span>
      </div>
      <div
        style={{
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          color: todayCost != null && todayCost > 0 ? "var(--accent-text)" : "var(--text-muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {todayCost != null ? `Bugün $${todayCost.toFixed(4)}` : "Maliyet —"}
      </div>
    </div>
  );
}
