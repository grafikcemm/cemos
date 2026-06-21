"use client";

import { useState, useEffect, useCallback } from "react";
import { Radar, Copy, ExternalLink, Target, Sparkles, Lightbulb, Image as ImageIcon } from "lucide-react";
import { fetchJson } from "@/lib/utils/safeFetch";
import { scoreColor } from "@/lib/utils/scoreColor";
import { useCopyToast } from "@/lib/hooks/useCopyToast";
import { PageHeader, Card, EmptyState, Button, Badge, Skeleton, EntityCard, PageScaffold } from "../ui";

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

const ACCOUNTS = ["all", "grafikcem", "maskulenkod"];

export default function ContentRadarTab() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState("all");
  const copy = useCopyToast();

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

  return (
    <PageScaffold
      header={
        <PageHeader
          eyebrow="KEŞFET"
          title="İçerik Radarı"
          subtitle="Haber akışından damıtılmış, skorlanmış tweet fırsatları — kopyala, kaynağa git, üretime al."
          size="page"
          meta={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Radar size={15} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />
              <span className="tnum" style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                {items.length}
              </span>
              içerik fırsatı
            </span>
          }
        />
      }
      toolbar={
        <div style={{ display: "flex", gap: 6 }}>
          {ACCOUNTS.map((a) => {
            const isActive = account === a;
            return (
              <button
                key={a}
                onClick={() => setAccount(a)}
                style={{
                  padding: "7px 14px",
                  background: isActive ? "var(--accent-dark)" : "transparent",
                  border: `1px solid ${isActive ? "var(--accent-border)" : "var(--border)"}`,
                  color: isActive ? "var(--accent-text)" : "var(--text-secondary)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--text-sm)",
                  fontWeight: isActive ? 600 : 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s, color 0.15s",
                }}
              >
                {a === "all" ? "Tümü" : `@${a}`}
              </button>
            );
          })}
        </div>
      }
    >
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "var(--space-4)" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={200} style={{ borderRadius: "var(--radius-xl)" }} />
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "var(--space-4)" }}>
          {items.map((o) => (
            <EntityCard
              key={o.id}
              avatar={
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "var(--radius-md)",
                    display: "grid",
                    placeItems: "center",
                    background: "var(--accent-dark)",
                    border: "1px solid var(--accent-border)",
                    color: "var(--accent-text)",
                    flexShrink: 0,
                  }}
                >
                  <Target size={16} strokeWidth={1.9} />
                </span>
              }
              eyebrow={o.account?.handle ? `@${o.account.handle}` : "fırsat"}
              title={o.turkishTitle}
              badges={
                <>
                  <Badge variant="muted" size="xs">{o.contentFormat}</Badge>
                  <span
                    className="tnum"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: "var(--text-sm)",
                      fontWeight: 700,
                      color: scoreColor(o.xValueScore),
                    }}
                  >
                    <Sparkles size={13} strokeWidth={2} />
                    {o.xValueScore}
                  </span>
                </>
              }
              body={
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {o.oneLineValue && <div>{o.oneLineValue}</div>}
                  {o.tweetAngle && (
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        color: "var(--text-secondary)",
                        background: "var(--bg-sunken)",
                        padding: "10px 11px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border)",
                        borderLeft: "2px solid var(--accent-border)",
                      }}
                    >
                      <Target size={14} strokeWidth={1.8} style={{ color: "var(--accent-text)", flexShrink: 0, marginTop: 2 }} />
                      <span>{o.tweetAngle}</span>
                    </div>
                  )}
                </div>
              }
              meta={
                <>
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
                </>
              }
              actions={
                <>
                  <Button variant="secondary" size="sm" onClick={() => copy(o.tweetAngle || o.turkishTitle)} iconLeft={<Copy size={14} strokeWidth={1.8} />}>
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
                        padding: "6px 12px",
                        background: "transparent",
                        border: "1px solid var(--border-strong)",
                        color: "var(--text-secondary)",
                        borderRadius: "var(--radius-md)",
                        fontSize: "var(--text-xs)",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      <ExternalLink size={14} strokeWidth={1.8} />
                      Kaynak
                    </a>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}
    </PageScaffold>
  );
}
