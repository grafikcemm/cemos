"use client";

import { useState, useEffect } from "react";
import { useXAgentStore } from "@/store/xagent";
import { fetchJson } from "@/lib/utils/safeFetch";

type StatusBarProps = {
  onScanComplete?: () => void;
};

export default function StatusBar({ onScanComplete }: StatusBarProps) {
  const activeChannel = useXAgentStore((s) => s.activeChannel);
  const automationEnabled = useXAgentStore((s) => s.automationEnabled);
  const setAutomationEnabled = useXAgentStore((s) => s.setAutomationEnabled);
  const isScanning = useXAgentStore((s) => s.isScanning);
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  const lastChannelScanDate = useXAgentStore((s) => s.lastChannelScanDate);
  const channelScanSchedule = useXAgentStore((s) => s.channelScanSchedule);

  const [monthlyCostUsd, setMonthlyCostUsd] = useState<number>(0);
  const [budgetUsd, setBudgetUsd] = useState<number>(6);
  const [publishedToday, setPublishedToday] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [costsRes, queueRes] = await Promise.all([
          fetchJson("/api/costs"),
          fetchJson<{ success?: boolean; items?: Array<{ publishedAt: string | null }> }>(
            `/api/queue?account=${activeChannel}&status=published`
          ),
        ]);
        if (!mounted) return;
        const costs = costsRes as { month?: { totalUsd?: number; budgetUsd?: number } };
        if (costs?.month?.totalUsd != null) setMonthlyCostUsd(costs.month.totalUsd);
        if (costs?.month?.budgetUsd != null) setBudgetUsd(costs.month.budgetUsd);
        const todayStr = new Date().toISOString().slice(0, 10);
        if (queueRes?.success && Array.isArray(queueRes.items)) {
          const todayPublished = (queueRes.items as Array<{ publishedAt: string | null }>).filter(
            (i) => i.publishedAt && i.publishedAt.slice(0, 10) === todayStr
          ).length;
          setPublishedToday(todayPublished);
        }
      } catch {
        // silent
      }
    };
    load();
    return () => { mounted = false; };
  }, [activeChannel]);

  const budgetPct = budgetUsd > 0
    ? Math.min(100, Math.round((monthlyCostUsd / budgetUsd) * 100))
    : 0;

  const lastScan = lastChannelScanDate[activeChannel];
  const scheduleLabel = channelScanSchedule[activeChannel] === "monday" ? "Pazartesi" : "Her gün";

  void onScanComplete;

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 12 }}>
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", padding: "10px 16px", gap: 0 }}>
        <div style={{ flex: 1, borderRight: "1px solid var(--border)", paddingRight: 16 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>PAYLAŞIM</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>@{activeChannel}</div>
        </div>
        <div style={{ flex: 1, paddingLeft: 16, borderRight: "1px solid var(--border)", paddingRight: 16 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>TARAMA ZAMANI</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{scheduleLabel}</div>
        </div>
        <div style={{ display: "flex", gap: 6, paddingLeft: 16 }}>
          {isScanning && (
            <span style={{ fontSize: 11, color: "var(--accent)", alignSelf: "center", fontWeight: 500 }}>
              ⏳ Tarıyor...
            </span>
          )}
          <button
            onClick={() => setAutomationEnabled(!automationEnabled)}
            style={{
              background: automationEnabled ? "var(--accent)" : "transparent",
              color: automationEnabled ? "#000" : "var(--text-secondary)",
              border: automationEnabled ? "none" : "1px solid var(--border)",
              borderRadius: 6, padding: "6px 14px", fontSize: 11, fontWeight: 500, cursor: "pointer",
            }}
          >
            ⚡ {automationEnabled ? "Otomasyon Aktif" : "Otomasyonu Başlat"}
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 11, cursor: "pointer" }}
          >
            ⚙ Ayarlar
          </button>
        </div>
      </div>

      {/* Bottom row: metrics */}
      <div style={{ display: "flex", padding: "10px 16px", gap: 0 }}>
        <MetricBlock label="DURUM" value={automationEnabled ? "Otomatik" : "Kapalı"} hint={automationEnabled ? "aktif" : "otomasyon kapalı"} />
        <Divider />
        <MetricBlock label="SON TARAMA" value={lastScan ?? "—"} hint={activeChannel} />
        <Divider />
        <MetricBlock label="BUGÜN" value={`${publishedToday} paylaşım`} hint="yayımlanan" />
        <Divider />
        <MetricBlock
          label="AYLIK BÜTÇE"
          value={`$${monthlyCostUsd.toFixed(4)} / $${budgetUsd}`}
          hint={`%${budgetPct} kullanıldı`}
          warn={budgetPct > 80}
        />
      </div>
    </div>
  );
}

function MetricBlock({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 500, color: warn ? "var(--red)" : undefined }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch", margin: "0 16px" }} />;
}
