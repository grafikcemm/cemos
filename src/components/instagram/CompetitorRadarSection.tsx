"use client";

import { useCallback, useEffect, useState } from "react";
import { Radar, UserPlus, Flame } from "lucide-react";
import { Card, SectionHeader, EmptyState, Badge, Button, Input, Skeleton } from "@/components/ui";
import ErrorState from "@/components/ui/ErrorState";

/**
 * Rakip Radarı (Sprint 8 — CONTENT-ENGINE §3). Watchlist + outlier feed.
 * Policy: yalnız business_discovery (scraping asla); private hesap Türkçe
 * "manuel ekle" bayrağıyla listede kalır. 4 durum: loading/empty/error/success.
 */

type WatchRow = {
  id: string;
  username: string;
  probeStatus: string;
  probeError: string;
  isCompetitor: boolean;
  isInspiration: boolean;
  lastSyncAt: string | null;
};

type OutlierRow = {
  contentItemId: string;
  author: string;
  format: string;
  caption: string;
  url: string | null;
  multiplier: number;
  insufficient: boolean;
};

export default function CompetitorRadarSection() {
  const [watch, setWatch] = useState<WatchRow[] | null>(null);
  const [outliers, setOutliers] = useState<OutlierRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [addNote, setAddNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const [wRes, oRes] = await Promise.all([
        fetch("/api/instagram/watchlist"),
        fetch("/api/instagram/outliers"),
      ]);
      if (!wRes.ok || !oRes.ok) throw new Error("http");
      const w = await wRes.json();
      const o = await oRes.json();
      if (!w.success || !o.success) throw new Error("payload");
      setWatch(w.accounts ?? []);
      setOutliers(o.items ?? []);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addAccount = async () => {
    const u = username.trim();
    if (!u) return;
    setAdding(true);
    setAddNote(null);
    try {
      const res = await fetch("/api/instagram/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setAddNote(json.error ?? "Hesap eklenemedi");
      } else if (json.probeStatus === "unavailable") {
        setAddNote(json.message ?? "API'den alınamıyor — manuel ekle");
      } else {
        setAddNote(`@${u} eklendi — yarınki 06:00 sync'inde taranır.`);
        setUsername("");
      }
      await load();
    } catch {
      setAddNote("Hesap eklenemedi (ağ hatası)");
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <Card variant="feature" padded>
        <div aria-busy="true" aria-label="Rakip radarı yükleniyor">
          <Skeleton width={160} height={12} style={{ marginBottom: "var(--space-4)" }} />
          <Skeleton lines={4} />
        </div>
      </Card>
    );
  }
  if (loadFailed) {
    return (
      <Card variant="feature" padded>
        <ErrorState
          title="Rakip radarı alınamadı"
          description="Watchlist/outlier verisi getirilemedi (tablolar db:push bekliyor olabilir)."
          onRetry={load}
        />
      </Card>
    );
  }

  return (
    <>
      <Card variant="feature" padded>
        <SectionHeader
          eyebrow="WATCHLIST"
          title="İzlenen Hesaplar"
          description="En fazla 30 public professional hesap — yalnız resmi business_discovery okuması."
        />
        <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)", alignItems: "center" }}>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAccount()}
            placeholder="@kullaniciadi"
            aria-label="İzlenecek Instagram hesabı"
            style={{ flex: "1 1 220px", minWidth: 0 }}
          />
          <Button size="sm" onClick={addAccount} loading={adding} iconLeft={<UserPlus size={14} strokeWidth={2} />}>
            Ekle
          </Button>
        </div>
        {addNote && (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginBottom: "var(--space-3)" }}>
            {addNote}
          </div>
        )}

        {(watch ?? []).length === 0 ? (
          <EmptyState
            icon={<Radar size={22} strokeWidth={1.8} />}
            title="Watchlist boş"
            description="5-20 rakip/ilham hesabı ekle — günlük 06:00 cron'u LLM'siz tarar."
            compact
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {(watch ?? []).map((w, i) => (
              <div
                key={w.id}
                style={{
                  display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)",
                  minHeight: 44, padding: "4px var(--space-1)",
                  borderTop: i === 0 ? "none" : "1px solid var(--border-faint)",
                  fontSize: "var(--text-sm)",
                }}
              >
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>@{w.username}</span>
                {w.probeStatus === "ok" ? (
                  <Badge variant="success" size="xs">API bağlı</Badge>
                ) : (
                  <Badge variant="yellow" size="xs">API'den alınamıyor — manuel ekle</Badge>
                )}
                <span style={{ marginLeft: "auto", fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                  {w.lastSyncAt ? `son sync: ${new Date(w.lastSyncAt).toLocaleDateString("tr-TR")}` : "henüz taranmadı"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card variant="feature" padded style={{ marginTop: "var(--space-4)" }}>
        <SectionHeader
          eyebrow="OUTLIER FEED"
          title="Patlayan İçerikler"
          description="Hesabın KENDİ medyanına göre çarpan — tek şanslı post kural olmaz, ilham al kopyalama."
        />
        {(outliers ?? []).length === 0 ? (
          <EmptyState
            icon={<Flame size={22} strokeWidth={1.8} />}
            title="Henüz outlier yok"
            description="Watchlist tarandıkça (günlük cron) hesap-medyanını aşan içerikler burada sıralanır."
            compact
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {(outliers ?? []).map((o, i) => (
              <a
                key={o.contentItemId}
                href={o.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)",
                  minHeight: 48, padding: "6px var(--space-1)",
                  borderTop: i === 0 ? "none" : "1px solid var(--border-faint)",
                  textDecoration: "none",
                }}
              >
                <Badge variant={o.multiplier >= 2 ? "accent" : "muted"} size="xs">
                  {o.multiplier.toFixed(1)}×
                </Badge>
                <Badge variant="muted" size="xs">{o.format.replace("ig_", "")}</Badge>
                <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>@{o.author}</span>
                {o.insufficient && <Badge variant="yellow" size="xs">az örneklem</Badge>}
                <span
                  title={o.caption || undefined}
                  style={{
                    flex: "1 1 200px", minWidth: 0, color: "var(--text-primary)",
                    fontSize: "var(--text-sm)", overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {o.caption || "(caption yok)"}
                </span>
              </a>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
