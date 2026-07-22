"use client";

import { useState, useEffect, useCallback } from "react";
import { Newspaper, Target, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { fetchJson } from "@/lib/utils/safeFetch";
import { Card, EmptyState, ErrorState, SectionHeader, Skeleton, Badge } from "@/components/ui";
import { safeExternalHref } from "@/lib/utils/url";

type NewsItem = {
  id: string;
  originalTitle: string;
  trTitle: string | null;
  trSummary: string | null;
  url: string;
  imageUrl: string | null;
  category: string;
  viralScore: number | null;
  xValueScore: number | null;
  whyPeopleCare: string | null;
  tweetAngle: string | null;
  suggestedFormat: string | null;
  isUsed: boolean;
};

type NewsResponse = { success: boolean; items?: NewsItem[]; error?: string };

type Props = {
  onToast: (text: string, type: "success" | "error") => void;
};

const ACCOUNTS = ["grafikcem", "maskulenkod"] as const;

export default function NewsHighlights({ onToast }: Props) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const data = await fetchJson<NewsResponse>("/api/news-pool?minScore=70&limit=3&compact=true");
      if (data.success && data.items) setItems(data.items.slice(0, 3));
      else setLoadFailed(true);
    } catch {
      // HATA ≠ BOŞ (item 5): yutulmaz, ayrı error state gösterilir.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerate = async (newsId: string, account: string) => {
    setGeneratingId(`${newsId}-${account}`);
    try {
      const data = await fetchJson<{ success: boolean; blocked?: boolean; reason?: string; error?: string }>(
        `/api/news-pool/${newsId}/generate-draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account }),
        }
      );
      if (data.success) {
        onToast(`@${account} için taslak üretildi.`, "success");
        setItems((prev) => prev.map((n) => (n.id === newsId ? { ...n, isUsed: true } : n)));
      } else if (data.blocked) {
        onToast(`Üretim engellendi: ${data.reason || "kalite filtresi"}`, "error");
      } else {
        onToast(data.error || "Üretim başarısız.", "error");
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Sunucu hatası.", "error");
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <section style={{ marginBottom: "var(--space-6)" }}>
      <SectionHeader eyebrow="VIRAL AKIŞ" title="Viral Haber Öne Çıkanlar" />

      {loading ? (
        <Card variant="feature">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Skeleton width={72} height={72} style={{ borderRadius: "var(--radius-md)", flexShrink: 0 }} />
                <Skeleton lines={2} height={12} style={{ flex: 1 }} />
              </div>
            ))}
          </div>
        </Card>
      ) : loadFailed ? (
        <ErrorState
          title="Haber sinyalleri yüklenemedi"
          description="Viral haber listesi şu an alınamıyor. Sorun sürerse Ayarlar → Sistem durumu."
          onRetry={() => void load()}
        />
      ) : items.length === 0 ? (
        <Card variant="feature" padded={false}>
          <EmptyState
            icon={<Newspaper size={22} strokeWidth={1.8} />}
            title="Henüz skorlanmış haber yok"
            description="Haber Havuzu sekmesinden “Tümünü İşle” çalıştırın — 06:00 cron’u da otomatik işler."
          />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((n) => (
            <Card key={n.id} variant="feature" padded={false}>
              <div style={{ display: "flex", gap: 14, padding: "13px 14px" }}>
                {n.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={n.imageUrl}
                    alt=""
                    style={{ width: 76, height: 76, objectFit: "cover", borderRadius: "var(--radius-md)", flexShrink: 0, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                    onError={(e) => { (e.currentTarget.style.display = "none"); }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <a
                      href={safeExternalHref(n.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display"
                      style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)", textDecoration: "none", lineHeight: 1.4, letterSpacing: "-0.01em" }}
                    >
                      {n.trTitle || n.originalTitle}
                    </a>
                    <Badge variant="accent" size="sm">
                      <span className="tnum">{n.xValueScore ?? n.viralScore ?? 0}</span>
                    </Badge>
                  </div>
                  {n.tweetAngle && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
                      <Target size={14} strokeWidth={1.8} style={{ color: "var(--accent-text)", flexShrink: 0, marginTop: 2 }} />
                      <span>{n.tweetAngle}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {n.isUsed ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--text-xs)", color: "var(--green)", fontWeight: 500 }}>
                        <CheckCircle2 size={14} strokeWidth={1.8} /> Kullanıldı
                      </span>
                    ) : (
                      ACCOUNTS.map((acc) => {
                        const busy = generatingId === `${n.id}-${acc}`;
                        return (
                          <button
                            key={acc}
                            onClick={() => handleGenerate(n.id, acc)}
                            disabled={!!generatingId}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "4px 11px",
                              background: "var(--accent-dark)",
                              border: "1px solid var(--accent-border)",
                              color: "var(--accent-text)",
                              borderRadius: "var(--radius-sm)",
                              fontSize: "var(--text-2xs)",
                              fontWeight: 500,
                              letterSpacing: "0.03em",
                              textTransform: "uppercase",
                              fontFamily: "inherit",
                              cursor: generatingId ? "wait" : "pointer",
                              opacity: generatingId && !busy ? 0.55 : 1,
                              transition: "background 0.15s var(--ease-out), opacity 0.15s",
                            }}
                          >
                            {busy ? (
                              <Loader2 size={13} strokeWidth={2} style={{ animation: "spin 0.6s linear infinite" }} />
                            ) : (
                              <Sparkles size={13} strokeWidth={2} />
                            )}
                            {busy ? "Üretiliyor" : `Üret → ${acc}`}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
