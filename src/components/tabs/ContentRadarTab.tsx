"use client";

import { useState, useEffect, useCallback } from "react";
import { Radar, Copy, ExternalLink, Target, Sparkles, Lightbulb, Image as ImageIcon } from "lucide-react";
import { fetchJson } from "@/lib/utils/safeFetch";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { PageHeader, Card, EmptyState, Button, Badge, Skeleton } from "../ui";
import { useToast } from "../ui/Toast";

type Opportunity = {
  id: string;
  turkishTitle: string;
  oneLineValue: string;
  tweetAngle: string;
  contentFormat: string;
  xValueScore: number;
  noveltyScore: number;
  usefulnessScore: number;
  visualScore: number;
  status: string;
  account?: { handle: string } | null;
  newsItem?: { url: string | null } | null;
};

type Response = { success: boolean; items?: Opportunity[]; error?: string };

const scoreColor = (s: number) => (s >= 75 ? "var(--green)" : s >= 50 ? "var(--yellow)" : "var(--danger)");

export default function ContentRadarTab() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState("all");
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: "100" });
      if (account !== "all") q.set("account", account);
      const data = await fetchJson<Response>(`/api/content-radar?${q.toString()}`);
      if (data.success && data.items) setItems(data.items);
    } catch {
      // empty state handles it
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) toast.success("Kopyalandı.");
    else toast.error("Kopyalama başarısız.");
  };

  return (
    <div style={{ width: "100%", paddingBottom: 60 }}>
      <PageHeader
        eyebrow="KEŞFET"
        title="İçerik Radarı"
        subtitle="Haber akışından damıtılmış, skorlanmış tweet fırsatları — kopyala, kaynağa git, üretime al."
        surface
        meta={
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Radar size={15} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />
              <span className="tnum" style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                {items.length}
              </span>
              içerik fırsatı
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Sparkles size={15} strokeWidth={1.8} style={{ color: "var(--green)" }} />
              X-değeri sırasıyla
            </span>
          </>
        }
      />

      <div style={{ display: "flex", gap: 8, marginBottom: "var(--space-5)" }}>
        {["all", "grafikcem", "maskulenkod"].map((a) => {
          const isActive = account === a;
          return (
            <button
              key={a}
              onClick={() => setAccount(a)}
              style={{
                padding: "6px 14px",
                background: isActive ? "var(--accent-dark)" : "var(--bg-surface)",
                border: `1px solid ${isActive ? "var(--accent-border)" : "var(--border)"}`,
                color: isActive ? "var(--accent-text)" : "var(--text-secondary)",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-xs)",
                fontWeight: isActive ? 700 : 500,
                fontFamily: "inherit",
                cursor: "pointer",
                transition: "background 0.15s var(--ease-out), border-color 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "var(--bg-surface)";
              }}
            >
              {a === "all" ? "Tümü" : `@${a}`}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--space-3)" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={172} style={{ borderRadius: "var(--radius-xl)" }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card variant="quiet">
          <EmptyState
            icon={<Radar size={26} strokeWidth={1.8} />}
            title="İçerik fırsatı yok"
            description="Bu hesap için henüz skorlanmış fırsat bulunamadı. Haber havuzu yenilendikçe radar dolar."
            action={
              <Button variant="secondary" onClick={() => load()} iconLeft={<Radar size={15} strokeWidth={1.8} />}>
                Radarı yenile
              </Button>
            }
          />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--space-3)" }}>
          {items.map((o) => (
            <Card key={o.id} variant="feature" interactive padded style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                  {o.account?.handle && (
                    <span style={{ fontSize: "var(--text-2xs)", fontWeight: 700, color: "var(--accent-text)", whiteSpace: "nowrap" }}>
                      @{o.account.handle}
                    </span>
                  )}
                  <Badge variant="muted" size="xs">{o.contentFormat}</Badge>
                </div>
                <span
                  className="tnum"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: "var(--text-sm)",
                    fontWeight: 800,
                    color: scoreColor(o.xValueScore),
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    padding: "3px 9px",
                    borderRadius: "var(--radius-md)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  <Sparkles size={13} strokeWidth={2} />
                  {o.xValueScore}
                </span>
              </div>

              <div
                className="font-display"
                style={{ fontSize: "var(--text-md)", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.35, letterSpacing: "-0.01em" }}
              >
                {o.turkishTitle}
              </div>
              {o.oneLineValue && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>{o.oneLineValue}</div>
              )}
              {o.tweetAngle && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    fontSize: "var(--text-xs)",
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                    background: "var(--bg-base)",
                    padding: "9px 10px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <Target size={14} strokeWidth={1.8} style={{ color: "var(--accent-text)", flexShrink: 0, marginTop: 2 }} />
                  <span>{o.tweetAngle}</span>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 14,
                  flexWrap: "wrap",
                  fontSize: "var(--text-2xs)",
                  color: "var(--text-muted)",
                  paddingTop: 2,
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Lightbulb size={13} strokeWidth={1.8} />
                  Yenilik <strong className="tnum" style={{ color: scoreColor(o.noveltyScore), fontWeight: 700 }}>{o.noveltyScore}</strong>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Sparkles size={13} strokeWidth={1.8} />
                  Fayda <strong className="tnum" style={{ color: scoreColor(o.usefulnessScore), fontWeight: 700 }}>{o.usefulnessScore}</strong>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <ImageIcon size={13} strokeWidth={1.8} />
                  Görsel <strong className="tnum" style={{ color: scoreColor(o.visualScore), fontWeight: 700 }}>{o.visualScore}</strong>
                </span>
              </div>

              <div style={{ display: "flex", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: "auto" }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCopy(o.tweetAngle || o.turkishTitle)}
                  iconLeft={<Copy size={14} strokeWidth={1.8} />}
                >
                  Açıyı Kopyala
                </Button>
                {o.newsItem?.url && (
                  <a
                    href={o.newsItem.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      borderRadius: "var(--radius-md)",
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      textDecoration: "none",
                      transition: "border-color 0.15s var(--ease-out), color 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-strong)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                  >
                    <ExternalLink size={14} strokeWidth={1.8} />
                    Kaynak
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
