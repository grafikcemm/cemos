"use client";

import { useCallback, useEffect, useState } from "react";
import { useXAgentStore } from "@/store/xagent";
import { fetchJson } from "@/lib/utils/safeFetch";

type YtOpportunity = {
  id: string;
  videoId: string;
  title: string;
  outlierScore: number;
  viewCount: number;
  isShort: boolean;
  channel?: { title?: string | null } | null;
};

type VideosResponse = {
  success: boolean;
  configured?: boolean;
  videos?: YtOpportunity[];
};

const wrap: React.CSSProperties = { marginBottom: 24 };
const emptyCard: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "16px 14px",
  fontSize: 12,
  color: "var(--text-muted)",
};

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}B`;
  return String(Math.round(n));
}

export default function YouTubeHighlights() {
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  const [videos, setVideos] = useState<YtOpportunity[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await fetchJson<VideosResponse>("/api/youtube/videos?limit=3");
      if (json.success) {
        setVideos(json.videos ?? []);
        setConfigured(json.configured ?? true);
      } else {
        setVideos([]);
      }
    } catch {
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const header = (
    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--text-primary)" }}>
      YouTube fırsatları
    </div>
  );

  // Loading sırasında kartı gizleme — bento grid hücresini koru (sibling kalıbı).
  if (loading) {
    return (
      <div style={wrap}>
        {header}
        <div style={emptyCard}>⏳ YouTube yükleniyor...</div>
      </div>
    );
  }

  // YouTube her zaman görünür: yapılandırma/boş durumda da kart göster.
  if (!configured) {
    return (
      <div style={wrap}>
        {header}
        <div style={emptyCard}>
          YouTube henüz yapılandırılmamış. Fırsat akışı için <code>YOUTUBE_API_KEY</code> tanımlayın.
        </div>
      </div>
    );
  }

  if (!videos || videos.length === 0) {
    return (
      <div style={wrap}>
        {header}
        <div style={emptyCard}>Bugün yeni YouTube fırsatı yok. Fırsat Motoru’ndan kanal keşfi yapabilirsiniz.</div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      {header}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {videos.map((v) => (
          <button
            key={v.id}
            onClick={() => setActiveTab("youtube")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              textAlign: "left",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "11px 13px",
              cursor: "pointer",
              color: "var(--text-primary)",
              fontFamily: "inherit",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            <div
              style={{
                flexShrink: 0,
                minWidth: 44,
                textAlign: "center",
                fontSize: 18,
                fontWeight: 800,
                color: "var(--accent)",
              }}
            >
              {Math.round(v.outlierScore)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {v.title || "(başlıksız)"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {v.channel?.title ? `${v.channel.title} · ` : ""}
                {formatViews(v.viewCount)} görüntülenme
                {v.isShort ? " · Shorts" : ""}
              </div>
            </div>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}
