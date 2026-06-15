"use client";

import { useXAgentStore } from "@/store/xagent";
import SourceCard from "./SourceCard";

export default function WatchedSources() {
  const watchedSources = useXAgentStore((s) => s.watchedSources);
  const activeChannel = useXAgentStore((s) => s.activeChannel);
  const updateWatchedSource = useXAgentStore((s) => s.updateWatchedSource);

  const channelSources = watchedSources.filter((s) => s.channel === activeChannel);
  const activeCount = channelSources.filter((s) => s.enabled).length;
  const totalFlow = channelSources.length * 10;

  return (
    <div>
      <div style={{
        padding: "12px 14px", display: "flex", alignItems: "center", gap: 8,
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
          👥 İZLENEN KAYNAKLAR ({channelSources.length})
        </span>
      </div>
      <div style={{ padding: "8px 14px 4px", fontSize: 11, color: "var(--text-muted)" }}>
        {activeCount}/{channelSources.length} aktif · ~{totalFlow} akış
      </div>
      <div style={{ padding: "4px 0 8px" }}>
        {channelSources.map((source) => (
          <SourceCard
            key={source.handle}
            source={source}
            onToggle={(enabled) => updateWatchedSource(source.handle, activeChannel, { enabled })}
            onModeChange={(mode) => updateWatchedSource(source.handle, activeChannel, { mode })}
          />
        ))}
      </div>
    </div>
  );
}
