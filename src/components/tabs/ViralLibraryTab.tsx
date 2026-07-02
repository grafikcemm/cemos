"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Star, ExternalLink, X, Heart, Repeat2, Sparkles, Quote, Reply, Library } from "lucide-react";
import { useXAgentStore, type QueueItem, type Channel } from "@/store/xagent";
import { PageHeader, Card, MetricCard, EmptyState, Badge, Button, Skeleton } from "@/components/ui";
import { fetchJson } from "@/lib/utils/safeFetch";
import { safeExternalHref } from "@/lib/utils/url";

const CHANNELS: Channel[] = ["grafikcem", "maskulenkod"];

type SavedTweetRow = {
  id: string;
  channel: string | null;
  authorHandle: string;
  text: string;
  likeCount: number;
  retweetCount: number;
  viewCount: number;
  viralScore: number;
  url: string;
  source: string;
  mediaUrl: string | null;
  mediaType: string | null;
  savedAt: string;
};

type ListResponse = { success: boolean; items?: SavedTweetRow[]; error?: string };

/**
 * Viral Kütüphane (Twitter grubu) — DB-backed yıldızlanan tweetler.
 * Eski localStorage kütüphanesi (Zustand savedTweets) ilk açılışta tek-seferlik
 * bulk upsert ile taşınır; API idempotent olduğundan yarım kalan göç güvenle tekrarlar.
 */
export default function ViralLibraryTab() {
  const savedTweets = useXAgentStore((s) => s.savedTweets);
  const removeSavedTweet = useXAgentStore((s) => s.removeSavedTweet);
  const addQueueItem = useXAgentStore((s) => s.addQueueItem);
  const activeChannel = useXAgentStore((s) => s.activeChannel);

  const [items, setItems] = useState<SavedTweetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const migrated = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<ListResponse>("/api/viral-library?limit=500");
      if (data.success && data.items) setItems(data.items);
    } catch {
      // boş durum ekranı devralır
    } finally {
      setLoading(false);
    }
  }, []);

  // Tek-seferlik localStorage → DB göçü, sonra normal yükleme.
  useEffect(() => {
    if (migrated.current) return;
    migrated.current = true;
    (async () => {
      if (savedTweets.length > 0) {
        try {
          const res = await fetch("/api/viral-library", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tweets: savedTweets.map((t) => ({
                id: t.id,
                channel: t.channel ?? null,
                authorHandle: t.handle,
                text: t.text,
                likeCount: t.likeCount,
                retweetCount: t.retweetCount,
                viewCount: t.viewCount,
                viralScore: t.viralScore,
                url: t.url,
                source: t.source,
                mediaUrl: t.mediaUrl ?? null,
                mediaType: t.mediaType ?? null,
              })),
            }),
          });
          const data = (await res.json()) as { success?: boolean };
          if (data.success) {
            for (const t of savedTweets) removeSavedTweet(t.id);
          }
        } catch {
          // Göç başarısızsa localStorage kopyası korunur; sonraki açılış tekrar dener.
          migrated.current = false;
        }
      }
      await load();
    })();
    // savedTweets bilinçli olarak deps dışında: göç yalnız mount'ta bir kez koşar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const filtered = channelFilter === "all" ? items : items.filter((t) => t.channel === channelFilter);

  const avgScore = items.length
    ? Math.round(items.reduce((a, t) => a + (t.viralScore ?? 0), 0) / items.length)
    : 0;

  const handleRemove = async (id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id)); // optimistic
    try {
      await fetch(`/api/viral-library?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      load(); // geri al — sunucu durumuna dön
    }
  };

  const handleGenerate = async (tweet: SavedTweetRow, draftType: "TWEET" | "QUOTE" | "REPLY") => {
    setGeneratingId(`${tweet.id}-${draftType}`);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: activeChannel,
          sourceTweet: tweet.text,
          sourceHandle: tweet.authorHandle,
          draftType,
        }),
      });
      const data = (await res.json()) as { success: boolean; generated?: string };
      if (!data.success || !data.generated) return;
      const item: QueueItem = {
        id: `lib-draft-${Date.now()}`,
        channel: activeChannel,
        draftType,
        content: data.generated,
        charCount: data.generated.length,
        sourceTweet: tweet.text,
        sourceHandle: tweet.authorHandle,
        viralScore: tweet.viralScore,
        status: "new",
        createdAt: new Date().toISOString(),
      };
      addQueueItem(item);
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="TWITTER"
        title="Viral Kütüphane"
        subtitle="Yıldızladığın viral tweetler — referans ve yeni üretim kaynağı."
        size="page"
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "var(--space-3)",
          marginBottom: "var(--space-6)",
        }}
      >
        <MetricCard
          label="Kayıtlı tweet"
          value={items.length}
          icon={<Library size={16} strokeWidth={1.8} />}
          accent
        />
        <MetricCard label="Görünen" value={filtered.length} icon={<Star size={16} strokeWidth={1.8} />} />
        <MetricCard label="Ort. viral skor" value={avgScore} icon={<Sparkles size={16} strokeWidth={1.8} />} />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginBottom: "var(--space-5)",
          flexWrap: "wrap",
        }}
      >
        <span className="eyebrow" style={{ color: "var(--text-muted)", marginRight: 4 }}>
          KANAL
        </span>
        <FilterChip active={channelFilter === "all"} onClick={() => setChannelFilter("all")}>
          Tümü · {items.length}
        </FilterChip>
        {CHANNELS.map((ch) => {
          const count = items.filter((t) => t.channel === ch).length;
          return (
            <FilterChip key={ch} active={channelFilter === ch} onClick={() => setChannelFilter(ch)}>
              @{ch} · {count}
            </FilterChip>
          );
        })}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} variant="default">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Skeleton width="35%" height={14} />
                <Skeleton width="100%" height={40} />
                <Skeleton width="55%" height={24} />
              </div>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card variant="quiet">
          <EmptyState
            icon={<Library size={22} strokeWidth={1.8} />}
            title="Kütüphane boş"
            description="Viral Radar'daki tweetlerde yıldız ikonuna tıklayarak referans ve üretim için buraya kaydet."
          />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {filtered.map((tweet) => (
            <SavedTweetCard
              key={tweet.id}
              tweet={tweet}
              generatingId={generatingId}
              onGenerate={handleGenerate}
              onRemove={() => handleRemove(tweet.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SavedTweetCard({
  tweet,
  generatingId,
  onGenerate,
  onRemove,
}: {
  tweet: SavedTweetRow;
  generatingId: string | null;
  onGenerate: (tweet: SavedTweetRow, type: "TWEET" | "QUOTE" | "REPLY") => void;
  onRemove: () => void;
}) {
  const avatarTones = [
    "var(--blue)",
    "var(--accent-2-text)",
    "var(--accent-text)",
    "var(--yellow)",
    "var(--green)",
  ];
  const avatarColor =
    avatarTones[tweet.authorHandle.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % avatarTones.length];
  const isGen = (type: string) => generatingId === `${tweet.id}-${type}`;
  const anyGen = generatingId?.startsWith(tweet.id) ?? false;

  return (
    <Card variant="feature" padded={false}>
      <div style={{ padding: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: `color-mix(in srgb, ${avatarColor} 18%, var(--bg-elevated))`,
              border: `1px solid color-mix(in srgb, ${avatarColor} 40%, transparent)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              color: avatarColor,
              flexShrink: 0,
            }}
          >
            {tweet.authorHandle[0]?.toUpperCase()}
          </div>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)" }}>
            @{tweet.authorHandle}
          </span>
          {tweet.channel && (
            <Badge variant="muted" size="xs">
              @{tweet.channel}
            </Badge>
          )}

          <span
            className="tnum"
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: "var(--text-xs)",
              fontWeight: 500,
              color: "var(--accent-text)",
            }}
          >
            <Star size={13} strokeWidth={2} fill="currentColor" />
            {tweet.viralScore}
          </span>

          <a
            href={safeExternalHref(tweet.url)}
            target="_blank"
            rel="noopener noreferrer"
            title="X'te aç"
            style={{
              display: "inline-flex",
              color: "var(--text-muted)",
              transition: "color 0.15s var(--ease-out)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <ExternalLink size={15} strokeWidth={1.8} />
          </a>
          <button
            onClick={onRemove}
            title="Kaldır"
            style={{
              display: "inline-flex",
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 0,
              transition: "color 0.15s var(--ease-out)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--text-secondary)",
            lineHeight: 1.55,
            marginBottom: "var(--space-3)",
          }}
        >
          {tweet.text}
        </div>

        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            flexWrap: "wrap",
            alignItems: "center",
            paddingTop: "var(--space-3)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <span
            className="tnum"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Heart size={13} strokeWidth={1.8} /> {tweet.likeCount}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Repeat2 size={14} strokeWidth={1.8} /> {tweet.retweetCount}
            </span>
          </span>

          <div style={{ marginLeft: "auto", display: "flex", gap: "var(--space-2)" }}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onGenerate(tweet, "TWEET")}
              disabled={anyGen}
              loading={isGen("TWEET")}
              iconLeft={isGen("TWEET") ? undefined : <Sparkles size={14} strokeWidth={2} />}
            >
              ÜRET
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onGenerate(tweet, "QUOTE")}
              disabled={anyGen}
              loading={isGen("QUOTE")}
              iconLeft={isGen("QUOTE") ? undefined : <Quote size={14} strokeWidth={1.8} />}
            >
              QUOTE
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onGenerate(tweet, "REPLY")}
              disabled={anyGen}
              loading={isGen("REPLY")}
              iconLeft={isGen("REPLY") ? undefined : <Reply size={14} strokeWidth={1.8} />}
            >
              YANIT
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "5px 12px",
        borderRadius: "var(--radius-md)",
        fontSize: "var(--text-xs)",
        fontWeight: 500,
        fontFamily: "inherit",
        cursor: "pointer",
        whiteSpace: "nowrap",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "var(--accent-fg)" : "var(--text-secondary)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
        transition: "background 0.15s var(--ease-out), color 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.color = "var(--text-primary)";
          e.currentTarget.style.borderColor = "var(--border-strong)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.color = "var(--text-secondary)";
          e.currentTarget.style.borderColor = "var(--border)";
        }
      }}
    >
      {children}
    </button>
  );
}
