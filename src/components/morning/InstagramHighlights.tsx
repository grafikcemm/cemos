"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera as Instagram, MessageCircle, Send, CheckCircle2, WifiOff } from "lucide-react";
import { useXAgentStore } from "@/store/xagent";
import { Card, EmptyState, SectionHeader, Skeleton } from "@/components/ui";

type Summary = { comments: number; dms: number };

export default function InstagramHighlights() {
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  const setIgDeepLink = useXAgentStore((s) => s.setIgDeepLink);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/instagram/summary");
      const json = await res.json();
      if (json.success) setSummary({ comments: json.comments ?? 0, dms: json.dms ?? 0 });
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const goTo = (target: "comments" | "dm") => {
    setIgDeepLink(target);
    setActiveTab("instagram");
  };

  const header = <SectionHeader eyebrow="SOSYAL" title="Instagram bugün" />;

  // Loading sırasında kartı gizleme — bento grid hücresini koru (sibling kalıbı).
  if (loading) {
    return (
      <div style={{ marginBottom: "var(--space-6)" }}>
        {header}
        <Card variant="feature">
          <div style={{ display: "flex", gap: 12 }}>
            <Skeleton height={60} style={{ flex: 1 }} />
            <Skeleton height={60} style={{ flex: 1 }} />
          </div>
        </Card>
      </div>
    );
  }

  // Instagram Bugün'de her zaman görünür: hata / 0-etkileşimde de boş-durum göster.
  if (failed || !summary) {
    return (
      <div style={{ marginBottom: "var(--space-6)" }}>
        {header}
        <Card variant="feature" padded={false}>
          <EmptyState
            compact
            icon={<WifiOff size={20} strokeWidth={1.8} />}
            title="Instagram verisi alınamadı"
            description="Sosyal Medya → Instagram’dan senkronize edebilirsiniz."
          />
        </Card>
      </div>
    );
  }

  if (summary.comments === 0 && summary.dms === 0) {
    return (
      <div style={{ marginBottom: "var(--space-6)" }}>
        {header}
        <Card variant="feature" padded={false}>
          <EmptyState
            compact
            icon={<CheckCircle2 size={20} strokeWidth={1.8} />}
            title="Bekleyen etkileşim yok"
            description="Bugün yeni yorum veya DM yok — gelen kutusu temiz."
          />
        </Card>
      </div>
    );
  }

  const pill: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    background: "var(--accent-dark)",
    border: "1px solid var(--accent-border)",
    borderRadius: "var(--radius-lg)",
    padding: "13px 14px",
    cursor: "pointer",
    color: "var(--text-primary)",
    textAlign: "left",
    fontFamily: "inherit",
    transition: "border-color 0.15s var(--ease-out), transform 0.15s var(--ease-out)",
  };

  return (
    <div style={{ marginBottom: "var(--space-6)" }}>
      {header}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          style={pill}
          onClick={() => goTo("comments")}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <MessageCircle size={16} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />
          <div className="font-display tnum" style={{ fontSize: "var(--text-2xl)", fontWeight: 500, color: "var(--accent-text)", lineHeight: 1, letterSpacing: "-0.02em" }}>
            {summary.comments}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>yanıt bekleyen yorum →</div>
        </button>
        <button
          style={pill}
          onClick={() => goTo("dm")}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <Send size={16} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />
          <div className="font-display tnum" style={{ fontSize: "var(--text-2xl)", fontWeight: 500, color: "var(--accent-text)", lineHeight: 1, letterSpacing: "-0.02em" }}>
            {summary.dms}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>yeni DM →</div>
        </button>
      </div>
    </div>
  );
}
