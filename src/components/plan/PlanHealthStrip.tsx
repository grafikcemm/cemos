"use client";

import { Badge, MetricStrip } from "@/components/ui";
import { useSystemHealth } from "@/components/shell/SystemHealthProvider";

/**
 * Takvim plan-sağlık şeridi (ADR-039 §11). CANONICAL kaynak: SystemHealthProvider'
 * ın `contracts.instagramPlanning` çıktısı — Takvim İKİNCİ bir health türetmez
 * (Sistem ile AYNI sonuç). Dekoratif KPI/sahte yüzde YOK; yapılandırılmamışsa
 * hiç gösterilmez. Rapor edilen ay görüntülenen aydan farklıysa dürüst not.
 */
export default function PlanHealthStrip({ viewedMonth }: { viewedMonth: string }) {
  const { contracts } = useSystemHealth();
  const ph = contracts?.instagramPlanning;
  if (!ph || !ph.configured) return null;

  const c = ph.counts;
  const differentMonth = ph.month !== null && ph.month !== viewedMonth;

  return (
    <div
      data-testid="plan-health-strip"
      style={{
        background: "var(--bg-sunken)",
        border: "1px solid var(--border-faint)",
        borderRadius: "var(--radius-md)",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Plan sağlığı{ph.month ? ` · ${ph.month}` : ""} · {ph.planStatus}
        </span>
        {differentMonth && (
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--status-warn)" }}>
            (aktif plan {ph.month}; görüntülenen {viewedMonth})
          </span>
        )}
      </div>
      {/* ADR-046: konsolide kalite barı verdisi (bağlı her Reels kanıt+üretim+onay taşıyor mu). */}
      {ph.meetsBar && (
        <div data-testid="plan-meets-bar" style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <Badge variant={ph.meetsBar.ok ? "success" : ph.planStatus === "draft" ? "muted" : "yellow"} size="xs">
            {ph.meetsBar.ok ? "kalite barı ✓" : "kalite barı ✗"}
          </Badge>
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{ph.meetsBar.reason}</span>
        </div>
      )}
      <MetricStrip
        items={[
          { label: "yayına hazır", value: `${c.productionReady}/${c.totalActiveSlots}`, tone: c.productionReady > 0 ? "ok" : "default" },
          { label: "dossier bekliyor", value: c.withoutDossier, tone: c.withoutDossier > 0 ? "warn" : "default" },
          { label: "onay bekliyor", value: c.awaitingApproval, tone: c.awaitingApproval > 0 ? "warn" : "default" },
          { label: "kanıt yenile", value: c.evidenceStale, tone: c.evidenceStale > 0 ? "warn" : "default" },
          { label: "yaklaşan risk", value: ph.next7DaysUnready + ph.overdueIncomplete, tone: ph.overdueIncomplete > 0 ? "danger" : ph.next7DaysUnready > 0 ? "warn" : "default" },
        ]}
      />
      {ph.nextActionable && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
          Sonraki: gün {ph.nextActionable.dayOfMonth} — {ph.nextActionable.reason}
        </div>
      )}
    </div>
  );
}
