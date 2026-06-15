"use client";

import type { WatchedSourceItem, SourceMode } from "@/store/xagent";
import Toggle from "@/components/ui/Toggle";
import ModeSelector from "@/components/ui/ModeSelector";

type SourceCardProps = {
  source: WatchedSourceItem;
  onToggle: (enabled: boolean) => void;
  onModeChange: (mode: SourceMode) => void;
  onArchive?: () => void;
};

export default function SourceCard({ source, onToggle, onModeChange, onArchive }: SourceCardProps) {
  return (
    <div style={{
      background: "var(--bg-elevated)", border: "1px solid var(--border)",
      borderRadius: 8, margin: "4px 10px", padding: "10px 12px",
    }}>
      {/* Header: handle + toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <a
          href={`https://x.com/${source.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", textDecoration: "none" }}
        >
          {source.displayName || `@${source.handle}`}{" "}
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>↗</span>
        </a>
        <div style={{ marginLeft: "auto" }}>
          <Toggle checked={source.enabled} onChange={onToggle} size="sm" />
        </div>
      </div>

      {/* Mode selector */}
      <div style={{ marginBottom: 6 }}>
        <ModeSelector value={source.mode} onChange={onModeChange} size="sm" />
      </div>

      {/* Threshold */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-muted)" }}>
        <span>✏ EŞİK</span>
        <span>❤️{source.thresholdLikes}</span>
        <span>🔁{source.thresholdRetweets}</span>
        <button onClick={onArchive} style={{
          marginLeft: "auto", background: "transparent", border: "none",
          color: "var(--text-muted)", fontSize: 14, cursor: onArchive ? "pointer" : "default",
        }}>⋮</button>
      </div>
    </div>
  );
}
