"use client";

import { useXAgentStore, type FlowTweet } from "@/store/xagent";
import { safeExternalHref } from "@/lib/utils/url";

type TweetCardProps = {
  tweet: FlowTweet;
  isGenerating: boolean;
  onGenerate: (type: "TWEET" | "QUOTE" | "REPLY") => void;
  onDismiss: () => void;
  selected?: boolean;
  onSelect?: () => void;
};

function formatTimeAgo(dateStr: string): string {
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMin < 1) return "az önce";
  if (diffMin < 60) return `${diffMin}dk`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}sa`;
  return `${Math.floor(diffH / 24)}g`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}B`;
  return String(n);
}

export default function TweetCard({ tweet, isGenerating, onGenerate, onDismiss, selected, onSelect }: TweetCardProps) {
  const saveTweet = useXAgentStore((s) => s.saveTweet);
  const removeSavedTweet = useXAgentStore((s) => s.removeSavedTweet);
  const isSaved = useXAgentStore((s) => s.savedTweets.some((t) => t.id === tweet.id));

  const initial = (tweet.handle || "?")[0].toUpperCase();
  const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#6366f1"];
  const avatarColor = colors[tweet.handle.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];
  const timeAgo = tweet.createdAt ? formatTimeAgo(tweet.createdAt) : "";

  const viralColor = tweet.viralScore >= 70 ? "var(--green)" : tweet.viralScore >= 40 ? "#f59e0b" : "#666";

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 8,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Tweet header — avatar + name + time + actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
        {onSelect && (
          <button onClick={onSelect} style={{
            width: 16, height: 16, borderRadius: 3, marginTop: 2, flexShrink: 0,
            border: `1.5px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
            background: selected ? "var(--accent)" : "transparent", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
          }}>
            {selected && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4 7L8 3" stroke="var(--accent-fg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
        )}
        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: "50%", background: avatarColor, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 500, color: "#fff",
        }}>{initial}</div>

        {/* Name + handle row */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>@{tweet.handle}</span>
            {timeAgo && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· {timeAgo}</span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              {/* Viral score badge */}
              <span style={{
                fontSize: 10, fontWeight: 500, color: viralColor,
                background: `${viralColor}18`, borderRadius: 4, padding: "1px 5px",
              }}>▲{tweet.viralScore}</span>
              {/* Save */}
              <button
                onClick={() => isSaved ? removeSavedTweet(tweet.id) : saveTweet(tweet)}
                title={isSaved ? "Kütüphaneden çıkar" : "Kütüphaneye kaydet"}
                style={{
                  background: "none", border: "none", padding: 0,
                  color: isSaved ? "var(--accent)" : "var(--text-muted)",
                  fontSize: 14, cursor: "pointer", lineHeight: 1,
                }}
              >{isSaved ? "★" : "☆"}</button>
              {/* External link */}
              <a href={safeExternalHref(tweet.url)} target="_blank" rel="noopener noreferrer"
                style={{ color: "var(--text-muted)", fontSize: 13, textDecoration: "none", lineHeight: 1 }}>↗</a>
              {/* Dismiss */}
              <button onClick={onDismiss} style={{
                background: "none", border: "none", color: "var(--text-muted)",
                fontSize: 15, cursor: "pointer", padding: 0, lineHeight: 1,
              }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>×</button>
            </div>
          </div>

          {/* Tweet body */}
          <div style={{
            fontSize: 14, color: "var(--text-primary)", lineHeight: 1.55, marginTop: 4,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>{tweet.text}</div>
        </div>
      </div>

      {/* Media */}
      {tweet.mediaUrl && (
        <div style={{ marginBottom: 10, borderRadius: 12, overflow: "hidden", maxHeight: 240, marginLeft: 50 }}>
          {tweet.mediaType === "photo" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tweet.mediaUrl}
              alt=""
              style={{ width: "100%", maxHeight: 240, objectFit: "cover", display: "block" }}
            />
          ) : (
            <video
              src={tweet.mediaUrl}
              controls
              muted
              style={{ width: "100%", maxHeight: 240, display: "block" }}
            />
          )}
        </div>
      )}

      {/* Engagement stats — X.com tarzı */}
      <div style={{
        display: "flex", gap: 20, marginLeft: 50, marginBottom: 10,
        fontSize: 13, color: "var(--text-muted)",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.5 }}>
            <path d="M14.046 2.242l-4.148-.01h-.002c-4.374 0-7.8 3.427-7.8 7.802 0 4.098 3.186 7.206 7.465 7.37v3.828a.5.5 0 0 0 .894.3l6.427-7.668c1.058-1.32 1.618-2.957 1.618-4.64 0-4.374-3.427-7.982-4.454-6.982z" fill="currentColor" />
          </svg>
          —
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.5 }}>
            <path d="M23.77 15.67c-.292-.293-.767-.293-1.06 0l-2.22 2.22V7.65c0-2.068-1.683-3.75-3.75-3.75h-5.85c-.414 0-.75.336-.75.75s.336.75.75.75h5.85c1.24 0 2.25 1.01 2.25 2.25v10.24l-2.22-2.22c-.293-.293-.768-.293-1.06 0s-.294.768 0 1.06l3.5 3.5c.145.147.337.22.53.22s.383-.072.53-.22l3.5-3.5c.294-.292.294-.767 0-1.06zm-10.66 3.28H7.26c-1.24 0-2.25-1.01-2.25-2.25V6.46l2.22 2.22c.148.147.34.22.532.22s.384-.073.53-.22c.293-.293.293-.768 0-1.06l-3.5-3.5c-.293-.294-.768-.294-1.06 0l-3.5 3.5c-.294.292-.294.767 0 1.06s.767.293 1.06 0l2.22-2.22V16.7c0 2.068 1.683 3.75 3.75 3.75h5.85c.414 0 .75-.336.75-.75s-.337-.75-.75-.75z" fill="currentColor" />
          </svg>
          {formatCount(tweet.retweetCount)}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.5 }}>
            <path d="M12 21.638h-.014C9.403 21.59 1.95 14.856 1.95 8.478c0-3.064 2.525-5.754 5.403-5.754 2.29 0 3.83 1.58 4.646 2.73.814-1.148 2.354-2.73 4.645-2.73 2.88 0 5.404 2.69 5.404 5.755 0 6.376-7.454 13.11-10.037 13.157H12z" fill="currentColor" />
          </svg>
          {formatCount(tweet.likeCount)}
        </span>
        {tweet.viewCount > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.5 }}>
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor" />
            </svg>
            {formatCount(tweet.viewCount)}
          </span>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--border)", marginLeft: 50, marginBottom: 10 }} />

      {/* Agent actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 50 }}>
        <button onClick={() => onGenerate("TWEET")} disabled={isGenerating} style={{
          background: isGenerating ? "#1a1a1a" : "var(--accent)", color: isGenerating ? "var(--text-muted)" : "var(--accent-fg)",
          border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 500,
          cursor: isGenerating ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 4,
        }}>{isGenerating ? <><span className="spinner" /> Üretiyor...</> : "✦ ÜRET"}</button>
        <button onClick={() => onGenerate("QUOTE")} disabled={isGenerating} style={{
          background: "transparent", border: "1px solid #282828", color: "var(--text-secondary)",
          borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: isGenerating ? "not-allowed" : "pointer",
        }}>❝ QUOTE</button>
        <button onClick={() => onGenerate("REPLY")} disabled={isGenerating} style={{
          background: "transparent", border: "1px solid #282828", color: "var(--text-secondary)",
          borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: isGenerating ? "not-allowed" : "pointer",
        }}>↩ YANIT</button>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>~$0.0003</span>
      </div>
    </div>
  );
}
