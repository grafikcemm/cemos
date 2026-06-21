"use client";

import { useState } from "react";
import { Star, ExternalLink, X, Heart, Repeat2, Sparkles, Quote, Reply, Library } from "lucide-react";
import { useXAgentStore, type FlowTweet, type QueueItem, type Channel } from "@/store/xagent";
import { PageHeader, Card, MetricCard, EmptyState, Badge, Button, SubNav } from "@/components/ui";
import PromptKutuphanesiTab from "./PromptKutuphanesiTab";
import PatternLibraryTab from "./PatternLibraryTab";

const CHANNELS: Channel[] = ["grafikcem", "maskulenkod"];

const VIEWS = [
  { id: "tweets", label: "Tweetler" },
  { id: "prompts", label: "Promptlar" },
  { id: "patterns", label: "Patternler" },
];

/**
 * Kütüphane host — eski Kütüphane (tweetler) + Prompt Kütüphanesi + Pattern
 * Kütüphanesi tek sekme + üst SubNav altında birleşir. Alt sayfalar kendi
 * başlıklarını korur. Alt-görünüm `libraryView` ile persist edilir.
 */
export default function LibraryTab() {
  const libraryView = useXAgentStore((s) => s.libraryView);
  const setLibraryView = useXAgentStore((s) => s.setLibraryView);
  const view = VIEWS.some((v) => v.id === libraryView) ? libraryView : "tweets";

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      <SubNav items={VIEWS} activeId={view} onSelect={setLibraryView} />
      {view === "tweets" && <TweetsView />}
      {view === "prompts" && <PromptKutuphanesiTab />}
      {view === "patterns" && <PatternLibraryTab />}
    </div>
  );
}

function TweetsView() {
  const savedTweets = useXAgentStore((s) => s.savedTweets);
  const removeSavedTweet = useXAgentStore((s) => s.removeSavedTweet);
  const addQueueItem = useXAgentStore((s) => s.addQueueItem);
  const activeChannel = useXAgentStore((s) => s.activeChannel);

  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all");
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const filtered = channelFilter === "all"
    ? savedTweets
    : savedTweets.filter((t) => t.channel === channelFilter);

  const avgScore = savedTweets.length
    ? Math.round(savedTweets.reduce((a, t) => a + (t.viralScore ?? 0), 0) / savedTweets.length)
    : 0;

  const handleGenerate = async (tweet: FlowTweet, draftType: "TWEET" | "QUOTE" | "REPLY") => {
    setGeneratingId(`${tweet.id}-${draftType}`);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: activeChannel,
          sourceTweet: tweet.text,
          sourceHandle: tweet.handle,
          draftType
        })
      });
      const data = await res.json() as { success: boolean; generated?: string };
      if (!data.success || !data.generated) return;
      const item: QueueItem = {
        id: `lib-draft-${Date.now()}`,
        channel: activeChannel,
        draftType,
        content: data.generated,
        charCount: data.generated.length,
        sourceTweet: tweet.text,
        sourceHandle: tweet.handle,
        viralScore: tweet.viralScore,
        status: "new",
        createdAt: new Date().toISOString()
      };
      addQueueItem(item);
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="KÜTÜPHANE"
        title="Viral Kütüphane"
        subtitle="Yıldızladığın viral tweetler — referans ve yeni üretim kaynağı."
        size="page"
      />

      {/* Editöryal stat şeridi */}
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
          value={savedTweets.length}
          icon={<Library size={16} strokeWidth={1.8} />}
          accent
        />
        <MetricCard
          label="Görünen"
          value={filtered.length}
          icon={<Star size={16} strokeWidth={1.8} />}
        />
        <MetricCard
          label="Ort. viral skor"
          value={avgScore}
          icon={<Sparkles size={16} strokeWidth={1.8} />}
        />
      </div>

      {/* Filtre control-bar */}
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
          Tümü · {savedTweets.length}
        </FilterChip>
        {CHANNELS.map((ch) => {
          const count = savedTweets.filter((t) => t.channel === ch).length;
          return (
            <FilterChip key={ch} active={channelFilter === ch} onClick={() => setChannelFilter(ch)}>
              @{ch} · {count}
            </FilterChip>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card variant="quiet">
          <EmptyState
            icon={<Library size={22} strokeWidth={1.8} />}
            title="Kütüphane boş"
            description="Akıştaki tweetlerde yıldız ikonuna tıklayarak referans ve üretim için buraya kaydet."
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
              onRemove={() => removeSavedTweet(tweet.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SavedTweetCard({ tweet, generatingId, onGenerate, onRemove }: {
  tweet: FlowTweet;
  generatingId: string | null;
  onGenerate: (tweet: FlowTweet, type: "TWEET" | "QUOTE" | "REPLY") => void;
  onRemove: () => void;
}) {
  const avatarTones = [
    "var(--blue)",
    "var(--accent-2-text)",
    "var(--accent-text)",
    "var(--yellow)",
    "var(--green)",
  ];
  const avatarColor = avatarTones[tweet.handle.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % avatarTones.length];
  const isGen = (type: string) => generatingId === `${tweet.id}-${type}`;
  const anyGen = generatingId?.startsWith(tweet.id) ?? false;

  return (
    <Card variant="feature" padded={false}>
      <div style={{ padding: "var(--space-4)" }}>
        {/* Header satırı */}
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
              fontWeight: 700,
              color: avatarColor,
              flexShrink: 0,
            }}
          >
            {tweet.handle[0].toUpperCase()}
          </div>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
            @{tweet.handle}
          </span>
          {tweet.channel && <Badge variant="muted" size="xs">@{tweet.channel}</Badge>}

          <span
            className="tnum"
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              color: "var(--accent-text)",
            }}
          >
            <Star size={13} strokeWidth={2} fill="currentColor" />
            {tweet.viralScore}
          </span>

          <a
            href={tweet.url}
            target="_blank"
            rel="noreferrer"
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

        {/* Gövde metni */}
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

        {/* Alt aksiyon şeridi */}
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

function FilterChip({ active, onClick, children }: {
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
        fontWeight: active ? 600 : 500,
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
