"use client";

import { useXAgentStore } from "@/store/xagent";
import Toggle from "@/components/ui/Toggle";

export default function AutomationToggle() {
  const enabled = useXAgentStore((s) => s.automationEnabled);
  const setEnabled = useXAgentStore((s) => s.setAutomationEnabled);

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div style={{
        padding: "12px 14px", display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
          ⚙ OTOMASYON
        </span>
        <div style={{ marginLeft: "auto" }}>
          <Toggle checked={enabled} onChange={setEnabled} />
        </div>
      </div>
      <div style={{ padding: "0 14px 12px" }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {enabled ? "açık — saatte bir kanal kontrolü" : "kapalı — otomasyon durduruldu"}
        </div>
      </div>
    </div>
  );
}
