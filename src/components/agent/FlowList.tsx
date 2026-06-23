"use client";

import { useState } from "react";
import type { FlowTweet } from "@/store/xagent";
import TweetCard from "./TweetCard";

type FlowListProps = {
  items: FlowTweet[];
  generatingId: string | null;
  onGenerate: (tweet: FlowTweet, type: "TWEET" | "QUOTE" | "REPLY") => void;
  onDismiss: (id: string) => void;
  lastScanTime: string | null;
  onRefresh?: () => void;
};

const FILTERS = [
  { id: "flow", label: "Akış" },
  { id: "new", label: "Yüksek Viral" },
] as const;

export default function FlowList({ items, generatingId, onGenerate, onDismiss, lastScanTime, onRefresh }: FlowListProps) {
  const [activeFilter, setActiveFilter] = useState("flow");

  const counts: Record<string, number> = {
    flow: items.length,
    new: items.filter((t) => t.viralScore >= 50).length,
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          AKİŞ SEÇİM KATMANI
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {lastScanTime ? `son tarama: ${items.length} yeni post` : "henüz tarama yapılmadı"}
        </span>
        {onRefresh && (
          <button onClick={onRefresh} style={{
            background: "transparent", border: "none", color: "var(--text-muted)",
            fontSize: 13, cursor: "pointer", padding: "0 4px", lineHeight: 1,
          }} title="Akışı yenile">↺</button>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {FILTERS.map((f) => {
          const isActive = activeFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              style={{
                background: isActive ? "var(--accent)" : "transparent",
                color: isActive ? "#000" : "var(--text-muted)",
                border: isActive ? "none" : "1px solid var(--border)",
                borderRadius: 5,
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: isActive ? 500 : 400,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {f.label}
              <span style={{
                fontSize: 9, fontWeight: 500,
                background: isActive ? "rgba(0,0,0,0.2)" : "var(--bg-elevated)",
                borderRadius: 3, padding: "0 4px",
              }}>
                {counts[f.id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tweet list */}
      {items.length === 0 ? (
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          borderRadius: 10, padding: 40, textAlign: "center", color: "var(--text-muted)",
        }}>
          Akışta tweet yok. Otomasyon açıksa bir sonraki tarama zamanında otomatik dolar.
        </div>
      ) : (
        items
          .filter((t) => activeFilter === "flow" || t.viralScore >= 50)
          .map((tweet) => (
            <TweetCard
              key={tweet.id}
              tweet={tweet}
              isGenerating={generatingId === tweet.id}
              onGenerate={(type) => onGenerate(tweet, type)}
              onDismiss={() => onDismiss(tweet.id)}
            />
          ))
      )}
    </div>
  );
}
