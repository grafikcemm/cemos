"use client";

import { useState, useEffect } from "react";
import { useXAgentStore } from "@/store/xagent";

type ApiSource = {
  id: string;
  handle: string;
  enabled: boolean;
  archivedAt: string | null;
};

type CostLimits = {
  maxSourcesPerAccount: number;
  maxTweetsPerSource: number;
  costPerItem: number;
};

export default function ScanSettings() {
  const postsPerSource = useXAgentStore((s) => s.postsPerSource);
  const setPostsPerSource = useXAgentStore((s) => s.setPostsPerSource);
  const maxPostAge = useXAgentStore((s) => s.maxPostAge);
  const setMaxPostAge = useXAgentStore((s) => s.setMaxPostAge);
  const activeChannel = useXAgentStore((s) => s.activeChannel);

  const [activeSourceCount, setActiveSourceCount] = useState<number | null>(null);
  const [maxSourcesPerAccount, setMaxSourcesPerAccount] = useState<number>(5);
  const [costPerItem, setCostPerItem] = useState(0.0002);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [sourcesRes, costsRes] = await Promise.all([
          fetch(`/api/sources?account=${activeChannel}`).then((r) => r.json()),
          fetch("/api/costs").then((r) => r.json()),
        ]);
        if (!mounted) return;
        if (sourcesRes?.success && Array.isArray(sourcesRes.sources)) {
          const active = (sourcesRes.sources as ApiSource[]).filter(
            (s) => s.enabled && !s.archivedAt
          );
          setActiveSourceCount(active.length);
        }
        const limits = (costsRes as { limits?: CostLimits })?.limits;
        if (limits?.costPerItem) setCostPerItem(limits.costPerItem);
        if (limits?.maxSourcesPerAccount) setMaxSourcesPerAccount(limits.maxSourcesPerAccount);
      } catch {
        // silent — show previous values
      }
    };
    load();
    return () => { mounted = false; };
  }, [activeChannel]);

  const totalActiveSources = activeSourceCount ?? 0;
  const effectiveSources = Math.min(totalActiveSources, maxSourcesPerAccount);
  const estimatedUsd = effectiveSources * postsPerSource * costPerItem;

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      {/* Section header */}
      <div style={{
        padding: "12px 14px", display: "flex", alignItems: "center", gap: 8,
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
          🔍 TARAMA AYARLARI
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>
          {effectiveSources}/{totalActiveSources} kaynak · {postsPerSource} post · ~${estimatedUsd.toFixed(4)}
        </span>
      </div>

      <div style={{ padding: "10px 14px" }}>
        {/* Manuel tarama box */}
        <div style={{
          background: "var(--accent-dark)", border: "1px solid var(--accent-border)",
          borderRadius: 8, padding: 10, marginBottom: 12,
        }}>
          <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 500, textTransform: "uppercase", marginBottom: 2 }}>
            📊 TARAMA MALİYETİ
          </div>
          <div style={{ fontSize: 20, color: "var(--accent)", fontWeight: 500, marginBottom: 4 }}>
            ~${estimatedUsd.toFixed(4)}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {activeSourceCount === null
              ? "Kaynaklar yükleniyor..."
              : totalActiveSources > maxSourcesPerAccount
              ? `${effectiveSources}/${totalActiveSources} kaynak taranacak`
              : `${effectiveSources} aktif kaynak`} × {postsPerSource} post. Üretim maliyeti ayrı.
          </div>
        </div>

        {/* Posts per source */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Hesap başına post</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[3, 5, 10, 20].map((n) => (
              <button key={n} onClick={() => setPostsPerSource(n)} style={{
                flex: 1, padding: "5px 0", borderRadius: 5, fontSize: 11, fontWeight: 500, cursor: "pointer",
                background: postsPerSource === n ? "var(--bg-elevated)" : "transparent",
                border: postsPerSource === n ? "1px solid var(--accent)" : "1px solid var(--border)",
                color: postsPerSource === n ? "var(--accent)" : "var(--text-muted)",
              }}>{n}</button>
            ))}
          </div>
        </div>

        {/* Max post age */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Maks post yaşı</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[3, 6, 12, 24, 48].map((n) => (
              <button key={n} onClick={() => setMaxPostAge(n)} style={{
                flex: 1, padding: "5px 0", borderRadius: 5, fontSize: 11, fontWeight: 500, cursor: "pointer",
                background: maxPostAge === n ? "var(--bg-elevated)" : "transparent",
                border: maxPostAge === n ? "1px solid var(--accent)" : "1px solid var(--border)",
                color: maxPostAge === n ? "var(--accent)" : "var(--text-muted)",
              }}>{n}s</button>
            ))}
          </div>
        </div>

        {/* Cost rule */}
        <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
          MALİYET KURALI
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Tarama başına: ~${estimatedUsd.toFixed(4)} ({effectiveSources}/{totalActiveSources} kaynak)
        </div>
      </div>
    </div>
  );
}
