"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Play,
  Video,
  RefreshCw,
  Radar,
  Users2,
  KeyRound,
  Settings,
  Flame,
  TrendingUp,
  Eye,
  Sparkles,
  EyeOff,
  Copy,
  Check,
  X,
  CircleDot,
  AlertTriangle,
  FileText,
  Type as TypeIcon,
  Clapperboard,
  GitCompare,
  Dna,
  ThumbsUp,
  Pencil,
  CheckCircle2,
  ListTree,
} from "lucide-react";
import PipelineTraceDrawer from "@/components/growth/PipelineTraceDrawer";
import { useXAgentStore } from "@/store/xagent";
import {
  PageHeader,
  Card,
  EmptyState,
  ErrorState,
  SectionHeader,
  SubNav,
  Badge,
  Button,
  Input,
  Select,
  Textarea,
  Skeleton,
  Drawer,
  KanbanBoard,
  KanbanCard,
  type KanbanTone,
  MetricStrip,
} from "@/components/ui";

type YtVideo = {
  videoId: string;
  title: string;
  publishedAt: string | null;
  isShort: boolean;
  viewCount: number;
  viewsPerDay: number;
  outlierScore: number;
  status: string;
  channel?: { title: string; category: string };
};

type YtChannel = {
  channelId: string;
  handle: string;
  title: string;
  category: string;
  subscriberCount: number;
  enabled: boolean;
  discoveredFrom: string;
  lastSyncedAt: string | null;
  errorCount: number;
};

type YtBrief = {
  id: string;
  videoId: string;
  status: string;
  pillar: string;
  titleVariantsJson: string;
  thumbnailConcept: string;
  seoDescription: string;
  hookScript: string;
  fullScript: string;
  outlineJson: string;
  differentiationAnalysis: string;
  editingNotes: string;
  shootingNotes: string;
  transcriptUsed: boolean;
  editedScript: string | null;
};

const CATEGORIES = ["ai_haber", "ai_tips", "kodlama", "tasarim", "yasam", "global"];
const CAT_LABEL: Record<string, string> = {
  ai_haber: "AI Haber",
  ai_tips: "AI İpucu",
  kodlama: "Kodlama",
  tasarim: "Tasarım",
  yasam: "Yaşam",
  global: "Global",
};

function ageLabel(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "bugün";
  if (days === 1) return "1 gün";
  if (days < 30) return `${days} gün`;
  return `${Math.floor(days / 30)} ay`;
}

/** Outlier skoruna göre semantik renk + ikon — sıcak fırsat = amber/oxblood. */
function scoreTone(score: number): { color: string; icon: typeof Flame } {
  if (score >= 3) return { color: "var(--danger)", icon: Flame };
  if (score >= 1.5) return { color: "var(--accent-text)", icon: TrendingUp };
  return { color: "var(--text-muted)", icon: TrendingUp };
}

async function postJson(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default function YouTubeTab() {
  const [section, setSection] = useState<"feed" | "channels">("feed");
  const [configured, setConfigured] = useState(true);
  const [videos, setVideos] = useState<YtVideo[]>([]);
  const [channels, setChannels] = useState<YtChannel[]>([]);
  const [suggestions, setSuggestions] = useState<YtChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // filtreler
  const [category, setCategory] = useState("all");
  const [minScore, setMinScore] = useState("");
  const [shorts, setShorts] = useState("all");

  // brief detayı
  const [brief, setBrief] = useState<YtBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefTab, setBriefTab] = useState<"titles" | "script" | "shoot" | "diff">("script");
  const [editedScript, setEditedScript] = useState("");

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const qs = new URLSearchParams();
      if (category !== "all") qs.set("category", category);
      if (minScore !== "") qs.set("minScore", minScore);
      if (shorts !== "all") qs.set("shorts", shorts);
      const res = await fetch(`/api/youtube/videos?${qs.toString()}`);
      const json = await res.json();
      setConfigured(json.configured ?? true);
      setVideos(json.videos ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [category, minScore, shorts]);

  const loadChannels = useCallback(async () => {
    const res = await fetch("/api/youtube/channels");
    const json = await res.json();
    setConfigured(json.configured ?? true);
    setChannels(json.competitors ?? []);
    setSuggestions(json.suggestions ?? []);
  }, []);

  useEffect(() => {
    if (section === "feed") loadFeed();
    else loadChannels();
  }, [section, loadFeed, loadChannels]);

  const runSync = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await postJson("/api/youtube/sync");
      const json = await res.json();
      if (json.success) {
        setNotice(
          `Sync: ${json.channelsSynced ?? 0} kanal, ${json.videosUpserted ?? 0} video, ~${json.quotaUnitsUsed ?? 0}u.`
        );
        await loadFeed();
      } else {
        setNotice(`Sync hatası: ${json.error || json.code}`);
      }
    } finally {
      setSyncing(false);
    }
  };

  const openBrief = useCallback(async (briefId: string) => {
    const res = await fetch(`/api/youtube/briefs/${briefId}`);
    const json = await res.json();
    if (json.success) {
      setBrief(json.brief);
      setEditedScript(json.brief.editedScript ?? json.brief.fullScript ?? "");
      setBriefTab("script");
    }
  }, []);

  const generateBrief = async (videoId: string) => {
    setBriefLoading(true);
    setNotice(null);
    try {
      const res = await postJson("/api/youtube/briefs", { videoId });
      const json = await res.json();
      if (!json.success) {
        setNotice(`Brief üretilemedi: ${json.error || json.code}`);
        return;
      }
      await openBrief(json.briefId);
      if (json.warnings?.includes("transcript_unavailable")) {
        setNotice("Uyarı: Transkript bulunamadı — brief metadata temelli üretildi.");
      }
      loadFeed();
    } finally {
      setBriefLoading(false);
    }
  };

  // "Yoksay": akıştan yerel olarak gizle (outlier feed zaten skora göre yeniden sıralanır).
  const dismissVideo = (videoId: string) => {
    setVideos((prev) => prev.filter((v) => v.videoId !== videoId));
  };

  const setBriefStatus = async (status: string) => {
    if (!brief) return;
    const res = await fetch(`/api/youtube/briefs/${brief.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status,
        editedScript: editedScript !== brief.fullScript ? editedScript : undefined,
      }),
    });
    const json = await res.json();
    if (json.success) {
      setNotice(`Durum kaydedildi: ${status}`);
      if (status === "dismissed") setBrief(null);
      else setBrief(json.brief);
    }
  };

  const copy = (text: string) => navigator.clipboard?.writeText(text);

  if (!configured) {
    return (
      <div style={{ width: "100%" }}>
        <PageHeader
          size="compact"
          eyebrow="SOSYAL MEDYA"
          title="YouTube Fırsat Motoru"
          subtitle="Rakip kanalları tarayıp viral fırsatları yüzeye çıkaran outlier akışı."
        />
        <Card variant="feature" padded>
          <EmptyState
            icon={<KeyRound size={22} strokeWidth={1.8} />}
            title="YouTube API yapılandırılmamış"
            description="YOUTUBE_API_KEY ayarlı değil. Anahtar eklendiğinde rakip kanallar taranır ve fırsat akışı dolar. Motor anahtarsız boş durumda kalır — hata vermez."
            action={
              <Button
                variant="primary"
                size="sm"
                iconLeft={<Settings size={15} strokeWidth={2} />}
                onClick={() => useXAgentStore.getState().setActiveTab("settings")}
              >
                Ayarlara git
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <PageHeader
        size="compact"
        eyebrow="SOSYAL MEDYA"
        title="YouTube Fırsat Motoru"
        subtitle="Rakip kanalları tarayıp viral fırsatları yüzeye çıkaran outlier akışı."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={runSync}
            disabled={syncing}
            loading={syncing}
            iconLeft={syncing ? undefined : <RefreshCw size={15} strokeWidth={2} />}
          >
            {syncing ? "Eşitleniyor" : "Sync"}
          </Button>
        }
      />

      <SubNav
        items={[
          { id: "feed", label: "Fırsat Akışı", badge: section === "feed" ? videos.length : undefined },
          {
            id: "channels",
            label: "Kanallar",
            badge: section === "channels" ? channels.length : undefined,
          },
        ]}
        activeId={section}
        onSelect={(id) => setSection(id as "feed" | "channels")}
      />

      {notice && (
        <Card variant="quiet" padded style={{ marginBottom: "var(--space-4)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: "var(--text-sm)",
              color: "var(--text-secondary)",
            }}
          >
            <CircleDot size={15} strokeWidth={2} style={{ color: "var(--accent-text)", flexShrink: 0 }} />
            <span>{notice}</span>
          </div>
        </Card>
      )}

      {section === "feed" && (
        <FeedSection
          videos={videos}
          loading={loading}
          loadError={loadError}
          category={category}
          setCategory={setCategory}
          shorts={shorts}
          setShorts={setShorts}
          minScore={minScore}
          setMinScore={setMinScore}
          onFilter={loadFeed}
          onSync={runSync}
          syncing={syncing}
          briefLoading={briefLoading}
          onGenerate={generateBrief}
          onDismiss={dismissVideo}
        />
      )}

      {section === "channels" && (
        <ChannelsSection
          channels={channels}
          suggestions={suggestions}
          onApprove={async (channelId) => {
            await postJson("/api/youtube/channels", { channelId, enabled: true });
            loadChannels();
          }}
        />
      )}

      <BriefDetail
        brief={brief}
        briefTab={briefTab}
        setBriefTab={setBriefTab}
        editedScript={editedScript}
        setEditedScript={setEditedScript}
        onClose={() => setBrief(null)}
        onStatus={setBriefStatus}
        onCopy={copy}
      />
    </div>
  );
}

function FeedSection({
  videos,
  loading,
  loadError,
  category,
  setCategory,
  shorts,
  setShorts,
  minScore,
  setMinScore,
  onFilter,
  onSync,
  syncing,
  briefLoading,
  onGenerate,
  onDismiss,
}: {
  videos: YtVideo[];
  loading: boolean;
  loadError: boolean;
  category: string;
  setCategory: (v: string) => void;
  shorts: string;
  setShorts: (v: string) => void;
  minScore: string;
  setMinScore: (v: string) => void;
  onFilter: () => void;
  onSync: () => void;
  syncing: boolean;
  briefLoading: boolean;
  onGenerate: (videoId: string) => void;
  onDismiss: (videoId: string) => void;
}) {
  const hotCount = videos.filter((v) => v.outlierScore >= 3).length;
  const risingCount = videos.filter((v) => v.outlierScore >= 1.5 && v.outlierScore < 3).length;
  const [view, setView] = useState<"grid" | "board">("grid");

  // Pano: outlier tier'ına göre fırsat kolonları.
  const YT_COLS: { id: string; label: string; tone: KanbanTone; match: (s: number) => boolean }[] = [
    { id: "hot", label: "Sıcak (≥3×)", tone: "danger", match: (s) => s >= 3 },
    { id: "rising", label: "Yükselen (1.5–3×)", tone: "yellow", match: (s) => s >= 1.5 && s < 3 },
    { id: "normal", label: "Normal (<1.5×)", tone: "muted", match: (s) => s < 1.5 },
  ];
  const ytKanbanColumns = YT_COLS.map((col) => ({
    id: col.id,
    label: col.label,
    tone: col.tone,
    items: videos.filter((v) => col.match(v.outlierScore)),
  })).filter((c) => c.items.length > 0);

  return (
    <>
      {/* Sessiz metrik şeridi (hero KPI kutuları kaldırıldı — arketip: quiet inline) */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <MetricStrip
          items={[
            { label: "akıştaki fırsat", value: loading ? "—" : videos.length },
            { label: "sıcak ≥3×", value: loading ? "—" : hotCount },
            { label: "yükselen 1.5–3×", value: loading ? "—" : risingCount },
          ]}
        />
      </div>

      {/* Filtre control-bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginBottom: "var(--space-4)",
          flexWrap: "wrap",
        }}
      >
        <span className="eyebrow" style={{ color: "var(--text-muted)", marginRight: 4 }}>
          FİLTRE
        </span>
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={[
            { value: "all", label: "Tüm kategoriler" },
            ...CATEGORIES.map((c) => ({ value: c, label: CAT_LABEL[c] })),
          ]}
        />
        <Select
          value={shorts}
          onChange={(e) => setShorts(e.target.value)}
          options={[
            { value: "all", label: "Hepsi" },
            { value: "exclude", label: "Shorts hariç" },
            { value: "only", label: "Sadece Shorts" },
          ]}
        />
        <Input
          type="number"
          placeholder="Min skor"
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          style={{ width: 120 }}
        />
        <Button variant="secondary" size="sm" onClick={onFilter}>
          Filtrele
        </Button>
        <div style={{ display: "inline-flex", gap: 2, marginLeft: "auto", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 3 }}>
          {([["grid", "Akış"], ["board", "Pano"]] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "5px 12px",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontSize: "var(--text-xs)",
                fontWeight: 500,
                fontFamily: "inherit",
                background: view === v ? "var(--accent)" : "transparent",
                color: view === v ? "var(--accent-fg)" : "var(--text-secondary)",
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Card variant="feature" padded={false}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{ padding: "12px 16px", borderTop: i === 0 ? "none" : "1px solid var(--border-faint)" }}
            >
              <Skeleton lines={2} height={14} />
            </div>
          ))}
        </Card>
      ) : loadError ? (
        <ErrorState onRetry={onFilter} />
      ) : videos.length === 0 ? (
        <Card variant="feature" padded>
          <EmptyState
            icon={<Radar size={22} strokeWidth={1.8} />}
            title="Henüz fırsat yok"
            description="Outlier akışı boş. Sync çalıştırarak rakip kanalları tara ya da Kanallar sekmesinden yeni kaynak ekle."
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={onSync}
                disabled={syncing}
                loading={syncing}
                iconLeft={syncing ? undefined : <RefreshCw size={15} strokeWidth={2} />}
              >
                {syncing ? "Eşitleniyor" : "Sync çalıştır"}
              </Button>
            }
          />
        </Card>
      ) : view === "board" ? (
        <KanbanBoard
          columns={ytKanbanColumns}
          renderCard={(v) => (
            <KanbanCard
              key={v.videoId}
              priority={{ label: `${v.outlierScore.toFixed(1)}×`, tone: v.outlierScore >= 3 ? "danger" : v.outlierScore >= 1.5 ? "yellow" : "muted" }}
              tag={v.channel ? { label: v.channel.category, tone: "accent" } : undefined}
              title={v.title}
              meta={
                <>
                  <span>{v.channel?.title ?? "—"}</span>
                  <span className="tnum">{v.viewCount.toLocaleString("tr-TR")} izlenme</span>
                </>
              }
              onClick={() => onGenerate(v.videoId)}
            />
          )}
        />
      ) : (
        <Card variant="feature" padded={false}>
          {videos.map((v, i) => (
            <VideoCard
              key={v.videoId}
              video={v}
              first={i === 0}
              briefLoading={briefLoading}
              onGenerate={() => onGenerate(v.videoId)}
              onDismiss={() => onDismiss(v.videoId)}
            />
          ))}
        </Card>
      )}
    </>
  );
}

/** Yoğun fırsat satırı — küçük thumb + tek satır başlık + skor chip'leri sağda. */
function VideoCard({
  video: v,
  first,
  briefLoading,
  onGenerate,
  onDismiss,
}: {
  video: YtVideo;
  first: boolean;
  briefLoading: boolean;
  onGenerate: () => void;
  onDismiss: () => void;
}) {
  const tone = scoreTone(v.outlierScore);
  const ToneIcon = tone.icon;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "10px 16px",
        borderTop: first ? "none" : "1px solid var(--border-faint)",
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 86,
          height: 48,
          flexShrink: 0,
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
          border: "1px solid var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`}
          alt=""
          width={86}
          height={48}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        <span
          style={{
            position: "absolute",
            bottom: 3,
            right: 3,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            borderRadius: "var(--radius-sm)",
            background: "color-mix(in srgb, var(--bg-base) 80%, transparent)",
            color: "var(--text-primary)",
          }}
        >
          <Play size={10} strokeWidth={2} fill="currentColor" />
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 200 }}>
        <div
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            color: "var(--text-primary)",
            lineHeight: 1.35,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {v.title}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 3,
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: "var(--text-secondary)" }}>{v.channel?.title ?? "—"}</span>
          <span>·</span>
          <span className="tnum">{ageLabel(v.publishedAt)}</span>
          {v.isShort && (
            <Badge variant="muted" size="xs">
              Short
            </Badge>
          )}
        </div>
      </div>

      {/* Skor chip'leri — sağda */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
        <span
          className="tnum"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: "var(--text-xs)",
            fontWeight: 500,
            color: tone.color,
            border: `1px solid color-mix(in srgb, ${tone.color} 40%, transparent)`,
            background: `color-mix(in srgb, ${tone.color} 12%, transparent)`,
            borderRadius: "var(--radius-sm)",
            padding: "2px 8px",
          }}
        >
          <ToneIcon size={12} strokeWidth={2} />
          {v.outlierScore.toFixed(2)}×
        </span>
        <span
          className="tnum"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          <Eye size={13} strokeWidth={1.8} />
          {Math.round(v.viewsPerDay).toLocaleString("tr-TR")} / gün
        </span>
      </div>

      {/* Aksiyonlar */}
      <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
        <Button
          variant="primary"
          size="sm"
          onClick={onGenerate}
          disabled={briefLoading}
          loading={briefLoading}
          iconLeft={briefLoading ? undefined : <Sparkles size={14} strokeWidth={2} />}
        >
          Brief Üret
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          iconLeft={<EyeOff size={14} strokeWidth={1.8} />}
        >
          Yoksay
        </Button>
      </div>
    </div>
  );
}

function ChannelsSection({
  channels,
  suggestions,
  onApprove,
}: {
  channels: YtChannel[];
  suggestions: YtChannel[];
  onApprove: (channelId: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <section>
        <SectionHeader
          eyebrow="İZLENEN KAYNAKLAR"
          title="Rakip Kanallar"
          description={`Outlier akışını besleyen ${channels.length} kanal.`}
        />
        {channels.length === 0 ? (
          <Card variant="feature" padded>
            <EmptyState
              icon={<Users2 size={22} strokeWidth={1.8} />}
              title="Henüz rakip kanal yok"
              description="Keşif önerilerini onaylayarak ya da Sync çalıştırarak izlenecek kanal ekle."
              compact
            />
          </Card>
        ) : (
          <Card variant="feature" padded={false}>
            {channels.map((c, i) => (
              <div key={c.channelId} style={{ padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid var(--border-faint)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  <div
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: 34,
                      height: 34,
                      flexShrink: 0,
                      borderRadius: "var(--radius-md)",
                      background: "var(--gradient-accent), var(--bg-elevated)",
                      border: "1px solid var(--accent-border)",
                      color: "var(--accent-text)",
                    }}
                  >
                    <Video size={16} strokeWidth={1.8} />
                  </div>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: "var(--text-sm)",
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.title || c.handle}
                  </span>
                  <Badge variant="default" size="sm">
                    {CAT_LABEL[c.category] ?? c.category}
                  </Badge>
                  <span
                    className="tnum"
                    style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", whiteSpace: "nowrap" }}
                  >
                    {c.subscriberCount.toLocaleString("tr-TR")} abone
                  </span>
                  {c.errorCount > 0 && (
                    <span
                      className="tnum"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: "var(--text-xs)",
                        color: "var(--danger)",
                      }}
                    >
                      <AlertTriangle size={12} strokeWidth={2} />
                      {c.errorCount}
                    </span>
                  )}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: "var(--text-xs)",
                      fontWeight: 500,
                      color: c.enabled ? "var(--green)" : "var(--text-muted)",
                    }}
                  >
                    <CircleDot size={11} strokeWidth={2} fill="currentColor" />
                    {c.enabled ? "aktif" : "pasif"}
                  </span>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      {suggestions.length > 0 && (
        <section>
          <SectionHeader
            eyebrow="KEŞİF"
            title="Önerilen Kanallar"
            description={`Algoritma ${suggestions.length} yeni aday buldu — onayla, akışa eklensin.`}
          />
          <Card variant="feature" padded={false}>
            {suggestions.map((c, i) => (
              <div key={c.channelId} style={{ padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid var(--border-faint)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  <div
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: 34,
                      height: 34,
                      flexShrink: 0,
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <Sparkles size={16} strokeWidth={1.8} />
                  </div>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: "var(--text-sm)",
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.title || c.handle}
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onApprove(c.channelId)}
                    iconLeft={<Check size={14} strokeWidth={2} />}
                  >
                    Onayla
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

function BriefDetail({
  brief,
  briefTab,
  setBriefTab,
  editedScript,
  setEditedScript,
  onClose,
  onStatus,
  onCopy,
}: {
  brief: YtBrief | null;
  briefTab: "titles" | "script" | "shoot" | "diff";
  setBriefTab: (t: "titles" | "script" | "shoot" | "diff") => void;
  editedScript: string;
  setEditedScript: (s: string) => void;
  onClose: () => void;
  onStatus: (s: string) => void;
  onCopy: (text: string) => void;
}) {
  const titles: string[] = safeParse(brief?.titleVariantsJson ?? "[]", []);
  const outline: Array<{ heading: string; targetSec: number; talkingPoints: string[] }> =
    safeParse(brief?.outlineJson ?? "[]", []);

  return (
    <Drawer open={brief !== null} onClose={onClose} title="Prodüksiyon Briefi" width={640}>
      {brief && (
        <>
          {!brief.transcriptUsed && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                background: "color-mix(in srgb, var(--accent-2-text) 12%, transparent)",
                border: "1px solid var(--accent-2-border)",
                borderRadius: "var(--radius-md)",
                padding: "10px 12px",
                fontSize: "var(--text-xs)",
                color: "var(--accent-2-text)",
                marginBottom: "var(--space-4)",
                lineHeight: 1.5,
              }}
            >
              <AlertTriangle size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Transkript bulunamadı — brief sadece başlık/açıklama temelli üretildi.</span>
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
            {(
              [
                ["titles", "Başlıklar", TypeIcon],
                ["script", "Konuşma Metni", FileText],
                ["shoot", "Çekim + Edit", Clapperboard],
                ["diff", "Fark Analizi", GitCompare],
              ] as const
            ).map(([key, label, Icon]) => {
              const active = briefTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setBriefTab(key)}
                  aria-pressed={active}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: "var(--radius-md)",
                    fontSize: "var(--text-xs)",
                    fontWeight: active ? 500 : 500,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "var(--accent-fg)" : "var(--text-secondary)",
                    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                    transition: "background 0.15s var(--ease-out), color 0.15s, border-color 0.15s",
                  }}
                >
                  <Icon size={14} strokeWidth={1.8} />
                  {label}
                </button>
              );
            })}
          </div>

          {briefTab === "titles" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <Field label="Başlık Varyantları" icon={TypeIcon}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {titles.map((t, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: "var(--text-sm)",
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                        padding: "7px 11px",
                      }}
                    >
                      <span style={{ flex: 1, color: "var(--text-primary)" }}>{t}</span>
                      <MiniCopy onCopy={() => onCopy(t)} />
                    </div>
                  ))}
                </div>
              </Field>
              <Field label="Thumbnail Konsepti" icon={Sparkles}>
                {brief.thumbnailConcept}
              </Field>
              <Field label="SEO Açıklaması" icon={FileText}>
                {brief.seoDescription}
              </Field>
            </div>
          )}

          {briefTab === "script" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <Field label="Hook (ilk 30sn)" icon={Flame} copyText={brief.hookScript} onCopy={onCopy}>
                {brief.hookScript}
              </Field>
              <Field label="Tam Konuşma Metni" icon={FileText} copyText={editedScript} onCopy={onCopy}>
                <Textarea
                  value={editedScript}
                  onChange={(e) => setEditedScript(e.target.value)}
                  style={{ minHeight: 240, lineHeight: 1.6 }}
                />
              </Field>
            </div>
          )}

          {briefTab === "shoot" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <Field label="Çekim Notları" icon={Clapperboard}>
                {brief.shootingNotes}
              </Field>
              <Field label="Edit Önerileri" icon={Pencil}>
                {brief.editingNotes}
              </Field>
              <Field label="İskelet" icon={ListTree}>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {outline.map((s, i) => (
                    <div key={i}>
                      <div
                        className="tnum"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: "var(--text-sm)",
                          fontWeight: 500,
                          color: "var(--text-primary)",
                        }}
                      >
                        <span>{s.heading}</span>
                        <Badge variant="muted" size="xs">
                          {s.targetSec}sn
                        </Badge>
                      </div>
                      <ul
                        style={{
                          margin: "6px 0 0",
                          paddingLeft: 18,
                          color: "var(--text-secondary)",
                          fontSize: "var(--text-sm)",
                          lineHeight: 1.6,
                        }}
                      >
                        {(s.talkingPoints ?? []).map((p, j) => (
                          <li key={j}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {briefTab === "diff" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <Field label="Pillar" icon={Sparkles}>
                <Badge variant="accent" size="sm">
                  {brief.pillar}
                </Badge>
              </Field>
              <Field label="Fark Analizi" icon={GitCompare}>
                {brief.differentiationAnalysis}
              </Field>
            </div>
          )}

          <div
            style={{
              marginTop: "var(--space-5)",
              borderTop: "1px solid var(--border)",
              paddingTop: "var(--space-4)",
            }}
          >
            <div
              className="eyebrow"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                color: "var(--text-muted)",
                marginBottom: "var(--space-2)",
              }}
            >
              <Dna size={13} strokeWidth={2} />
              Pipeline İzi
            </div>
            <PipelineTraceDrawer subjectType="yt_video" subjectId={brief.videoId} />
          </div>

          <div
            style={{
              display: "flex",
              gap: "var(--space-2)",
              marginTop: "var(--space-5)",
              flexWrap: "wrap",
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onStatus("liked")}
              iconLeft={<ThumbsUp size={14} strokeWidth={1.8} />}
            >
              Beğendim
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onStatus("edited")}
              iconLeft={<Pencil size={14} strokeWidth={1.8} />}
            >
              Düzenledim
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onStatus("recorded")}
              iconLeft={<CheckCircle2 size={14} strokeWidth={2} />}
            >
              Çektim
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onStatus("dismissed")}
              iconLeft={<X size={14} strokeWidth={2} />}
            >
              Vazgeç
            </Button>
          </div>
        </>
      )}
    </Drawer>
  );
}

function Field({
  label,
  icon: Icon,
  children,
  copyText,
  onCopy,
}: {
  label: string;
  icon?: typeof FileText;
  children: React.ReactNode;
  copyText?: string;
  onCopy?: (text: string) => void;
}) {
  return (
    <div>
      <div
        className="eyebrow"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          color: "var(--text-muted)",
          marginBottom: "var(--space-2)",
        }}
      >
        {Icon && <Icon size={13} strokeWidth={2} />}
        <span style={{ flex: 1 }}>{label}</span>
        {copyText !== undefined && onCopy && <MiniCopy onCopy={() => onCopy(copyText)} />}
      </div>
      <div
        style={{
          fontSize: "var(--text-sm)",
          lineHeight: 1.6,
          color: "var(--text-secondary)",
          whiteSpace: "pre-wrap",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function MiniCopy({ onCopy }: { onCopy: () => void }) {
  return (
    <button
      onClick={onCopy}
      aria-label="Kopyala"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "transparent",
        color: "var(--accent-text)",
        border: "1px solid var(--accent-border)",
        borderRadius: "var(--radius-sm)",
        padding: "2px 8px",
        fontSize: "var(--text-2xs)",
        fontWeight: 500,
        fontFamily: "inherit",
        cursor: "pointer",
        transition: "background 0.15s var(--ease-out), border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 14%, transparent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <Copy size={11} strokeWidth={2} />
      Kopyala
    </button>
  );
}

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
