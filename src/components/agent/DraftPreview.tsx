"use client";

import { useState, useEffect, useCallback } from "react";
import { useXAgentStore } from "@/store/xagent";

type DbQueueItem = {
  id: string;
  content: string;
  editedContent: string | null;
  draftType: string;
  status: string;
  publishedAt: string | null;
  lastError: string | null;
};

export default function DraftPreview() {
  const activeChannel = useXAgentStore((s) => s.activeChannel);
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);

  const [drafts, setDrafts] = useState<DbQueueItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [dryRunSuccess, setDryRunSuccess] = useState(false);

  const loadDrafts = useCallback(async () => {
    try {
      const res = await fetch(`/api/queue?account=${activeChannel}&status=new`);
      const data = (await res.json()) as { success: boolean; items?: DbQueueItem[] };
      if (data.success && data.items) {
        setDrafts(data.items);
        setActiveIndex(0);
      }
    } catch {
      // silent
    }
  }, [activeChannel]);

  useEffect(() => {
     
    void loadDrafts();
  }, [loadDrafts]);

  if (drafts.length === 0) return null;

  const current = drafts[Math.min(activeIndex, drafts.length - 1)];
  if (!current) return null;

  const content = current.editedContent || current.content;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = content;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setPublishError(null);
    setDryRunSuccess(false);
    try {
      const res = await fetch(`/api/queue/${current.id}/mark-published`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || data.error) {
        setPublishError(data.error ?? "İşaretleme başarısız");
        return;
      }
      await loadDrafts();
      setDryRunSuccess(true);
      setTimeout(() => setDryRunSuccess(false), 4000);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Ağ hatası");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 16,
        marginBottom: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--accent)",
            display: "inline-block",
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {drafts.length} Taslak hazır
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
          @{activeChannel} · hızlı yayın veya{" "}
          <button
            onClick={() => setActiveTab("daily-queue")}
            style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline" }}
          >
            Kuyruk&apos;ta gör
          </button>
        </span>
      </div>

      {/* Draft selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          TASLAK {Math.min(activeIndex + 1, drafts.length)}/{drafts.length}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {drafts.map((_, i) => (
            <button
              key={i}
              onClick={() => { setActiveIndex(i); setPublishError(null); setDryRunSuccess(false); }}
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                border: i === activeIndex ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: i === activeIndex ? "var(--accent-dark)" : "transparent",
                color: i === activeIndex ? "var(--accent)" : "var(--text-muted)",
                fontSize: 10,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              #{i + 1}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
          {current.draftType} · {content.length} chr
        </span>
      </div>

      {/* Content */}
      <div
        style={{
          background: "var(--bg-elevated)",
          borderRadius: 8,
          padding: 12,
          fontSize: 13,
          color: "var(--text-secondary)",
          lineHeight: 1.6,
          marginBottom: 12,
          minHeight: 48,
        }}
      >
        {content}
      </div>

      {/* Dry-run success badge */}
      {dryRunSuccess && (
        <div style={{
          fontSize: 11, color: "#22d3ee", marginBottom: 8, padding: "5px 10px",
          background: "rgba(6,182,212,0.1)", borderRadius: 5,
          border: "1px solid rgba(6,182,212,0.3)",
        }}>
          ✓ Dry-run başarılı — gerçek tweet gönderilmedi
        </div>
      )}

      {/* Error */}
      {publishError && (
        <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 8, padding: "5px 8px", background: "rgba(255,68,68,0.08)", borderRadius: 5 }}>
          ✗ {publishError}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          onClick={handleCopy}
          style={{
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-strong)",
            borderRadius: 6,
            padding: "5px 12px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Kopyala
        </button>
        <button
          onClick={handlePublish}
          disabled={publishing}
          style={{
            background: dryRunSuccess ? "rgba(6,182,212,0.15)" : "var(--accent)",
            color: dryRunSuccess ? "#22d3ee" : "#000",
            border: dryRunSuccess ? "1px solid rgba(6,182,212,0.4)" : "none",
            borderRadius: 6,
            padding: "5px 14px",
            fontSize: 11,
            fontWeight: 500,
            cursor: publishing ? "not-allowed" : "pointer",
            opacity: publishing ? 0.7 : 1,
          }}
        >
          {publishing ? "⏳..." : dryRunSuccess ? "✓ Paylaşıldı işaretlendi" : "✓ Manuel Paylaşıldı"}
        </button>
      </div>
    </div>
  );
}
