"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  RefreshCw,
  Plus,
  Play,
  Pause,
  Pencil,
  Archive,
  Radar,
  ShieldAlert,
  Heart,
  Repeat2,
  Eye,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import {
  PageHeader,
  MetricStrip,
  type MetricStripItem,
  FilterBar,
  Card,
  SectionHeader,
  StatusBadge,
  Badge,
  Button,
  Input,
  Select,
  Drawer,
  DetailPanel,
  ScoreBars,
  EmptyState,
  ErrorState,
  BlockedExternalState,
  Skeleton,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { scoreColor } from "@/lib/utils/scoreColor";
import SaveToBoardButton from "@/components/library/SaveToBoardButton";

/**
 * Keşif / X Hesabı Kaynakları (05 §E5) — izlenen X hesaplarını yönet; taranan
 * postları ve fırsat skorlarını hesap bazlı incele. Dark-editorial arketip:
 * sessiz MetricGrid (hero StatCard YOK), FilterBar, 320px + 1fr iki-panel,
 * Drawer form + DetailPanel skor kırılımı (elle modal YOK). Ölü placeholder
 * buton YOK — her aksiyon gerçek endpoint'e bağlı ya da hiç yok.
 *
 * Gerçek veri (envelope {success,...}):
 *  GET  /api/growth/source-intelligence  → summary + sources + sourcePosts
 *  POST /api/sources                      → kaynak ekle (201 / 409 dup)
 *  PATCH/DELETE /api/sources/{id}         → durum/kriter/arşiv
 *  POST /api/growth/source-intelligence/source-posts/{id}/score → skor kırılımı
 */

// ── Ham API şekilleri (TS strict — no any) ────────────────────────────────────
type Source = {
  id: string;
  handle: string;
  displayName: string | null;
  enabled: boolean;
  mode: string;
  thresholdLikes: number;
  thresholdRetweets: number;
  accountHandle: string;
  totalPosts: number;
  averageOpportunity: number;
  averageRisk: number;
};

type SourcePost = {
  id: string;
  text: string;
  url: string;
  likeCount: number;
  retweetCount: number;
  viewCount: number;
  accountHandle: string;
  sourceHandle: string;
  opportunityScore: number;
  riskScore: number;
  suggestedAction: string;
  reason: string;
  scannedAt: string;
  status: string;
};

type Summary = {
  totalSources: number;
  activeSources: number;
  inactiveSources: number;
  totalSourcePosts: number;
  highOpportunityPosts: number;
  highRiskPosts: number;
  averageOpportunityScore: number;
  topSourceHandle: string;
};

type ScoreDetail = {
  relevanceScore: number;
  freshnessScore: number;
  controversyScore: number;
  audienceFitScore: number;
  quotePotentialScore: number;
  replyPotentialScore: number;
  standaloneTweetScore: number;
  opportunityScore: number;
  riskScore: number;
  suggestedAction: string;
  reason: string;
  suggestedAccounts: string[];
  confidence: number;
};

type IntelResponse = {
  success: boolean;
  error?: string;
  summary?: Summary;
  sources?: Source[];
  sourcePosts?: SourcePost[];
  /** SocialData taraması 402 (kredi) yediğinde GET bunu set eder; liste yine okunur. */
  scanBlocked?: boolean;
  scanBlockedReason?: string;
};

type ScoreResponse = { success: boolean; error?: string; score?: ScoreDetail };
type MutationResponse = { success: boolean; error?: string; source?: Source };

type FilterValues = {
  account: string;
  status: string;
  sourceType: string;
  action: string;
  risk: string;
  sort: string;
  search: string;
};

type SourceForm = { account: string; handle: string; mode: string; likes: string; retweets: string };

type BadgeVariant = "default" | "accent" | "muted" | "blue" | "yellow" | "red" | "danger" | "success";

// ── Sabitler ──────────────────────────────────────────────────────────────────
const DEBOUNCE_MS = 300;
const STALE_AFTER_MS = 1000 * 60 * 60 * 24 * 3; // 3 gün → "taranma DD.MM" izi
const JSON_HEADERS = { "Content-Type": "application/json" };

const EMPTY_SUMMARY: Summary = {
  totalSources: 0,
  activeSources: 0,
  inactiveSources: 0,
  totalSourcePosts: 0,
  highOpportunityPosts: 0,
  highRiskPosts: 0,
  averageOpportunityScore: 0,
  topSourceHandle: "",
};

const DEFAULT_FILTERS: FilterValues = {
  account: "all",
  status: "all",
  sourceType: "all",
  action: "all",
  risk: "all",
  sort: "opportunityScore",
  search: "",
};

const NEW_FORM: SourceForm = { account: "grafikcem", handle: "", mode: "ALL", likes: "100", retweets: "20" };

const MODE_OPTIONS = [
  { value: "ALL", label: "ALL — tweet + alıntı + yanıt" },
  { value: "TWEET", label: "TWEET — yalnız tweet" },
  { value: "QUOTE", label: "QUOTE — yalnız alıntı" },
  { value: "REPLY", label: "REPLY — yalnız yanıt" },
];

// FilterBar seçenekleri (durağan veri — render'dan ayrı tutulur)
const ACCOUNT_SEGMENTS = [
  { value: "all", label: "Tümü" },
  { value: "grafikcem", label: "@grafikcem" },
  { value: "maskulenkod", label: "@maskulenkod" },
];
const STATUS_OPTIONS = [
  { value: "all", label: "Tümü" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Pasif" },
];
const TYPE_OPTIONS = [
  { value: "all", label: "Tümü" },
  { value: "tweet", label: "Tweet" },
  { value: "quote", label: "Alıntı" },
  { value: "reply", label: "Yanıt" },
];
const ACTION_OPTIONS = [
  { value: "all", label: "Tümü" },
  { value: "tweet", label: "Tweet" },
  { value: "quote", label: "Alıntı" },
  { value: "reply", label: "Yanıt" },
  { value: "ignore", label: "Yok say" },
];
const RISK_OPTIONS = [
  { value: "all", label: "Tümü" },
  { value: "low", label: "Düşük" },
  { value: "medium", label: "Orta" },
  { value: "high", label: "Yüksek" },
];
const SORT_OPTIONS = [
  { value: "opportunityScore", label: "Fırsat skoru" },
  { value: "riskScore", label: "Risk skoru" },
  { value: "createdAt", label: "Yayın tarihi" },
  { value: "updatedAt", label: "Son taranma" },
  { value: "sourceWeight", label: "Kaynak eşiği" },
];

const ACTION_META: Record<string, { label: string; variant: BadgeVariant }> = {
  tweet: { label: "Tweet", variant: "accent" },
  quote: { label: "Alıntı", variant: "accent" },
  reply: { label: "Yanıt", variant: "accent" },
  ignore: { label: "Yok say", variant: "muted" },
};

// ── Saf yardımcılar (render-safe: argsız Date/Math.random YOK) ────────────────
function buildQuery(v: FilterValues): string {
  const p = new URLSearchParams();
  if (v.account !== "all") p.set("accountHandle", v.account);
  if (v.status !== "all") p.set("status", v.status);
  if (v.sourceType !== "all") p.set("sourceType", v.sourceType);
  if (v.action !== "all") p.set("action", v.action);
  if (v.risk !== "all") p.set("risk", v.risk);
  const q = v.search.trim();
  if (q) p.set("search", q);
  p.set("sort", v.sort);
  return p.toString();
}

function formatDayMonth(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isStale(iso: string, now: number | null): boolean {
  if (now === null) return false;
  const t = Date.parse(iso);
  return !Number.isNaN(t) && now - t > STALE_AFTER_MS;
}

function actionMeta(a: string): { label: string; variant: BadgeVariant } {
  return ACTION_META[a] ?? { label: a, variant: "muted" };
}

function oppVariant(v: number): BadgeVariant {
  return v >= 75 ? "accent" : v >= 50 ? "yellow" : "muted";
}

function riskVariant(v: number): BadgeVariant {
  return v >= 70 ? "danger" : v >= 40 ? "yellow" : "success";
}

/** javascript:/data: şemalarını ele — yalnız http(s) dış bağlantısı. */
function safeExternalUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return url;
  } catch {
    return undefined;
  }
  return undefined;
}

// ── Ekran ─────────────────────────────────────────────────────────────────────
export default function SourceIntelScreen() {
  const toast = useToast();

  const [values, setValues] = useState<FilterValues>(DEFAULT_FILTERS);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [sources, setSources] = useState<Source[]>([]);
  const [posts, setPosts] = useState<SourcePost[]>([]);
  const [scanBlocked, setScanBlocked] = useState(false);
  const [scanBlockedReason, setScanBlockedReason] = useState<string | undefined>(undefined);
  const [now, setNow] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const loadedOnceRef = useRef(false);

  // Kaynak formu (Drawer) — yeni + düzenle
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SourceForm>(NEW_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Skor detay (DetailPanel)
  const [activePost, setActivePost] = useState<SourcePost | null>(null);
  const [scoreDetail, setScoreDetail] = useState<ScoreDetail | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreError, setScoreError] = useState(false);
  const scoreCtrlRef = useRef<AbortController | null>(null);

  const query = useMemo(() => buildQuery(values), [values]);
  const hasData = sources.length > 0 || posts.length > 0;

  // Debounce'lu yükleme — filtre/arama değişiminde tek uçuş; eskisini iptal et.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch(`/api/growth/source-intelligence?${query}`, { signal: controller.signal });
        const json = (await res.json()) as IntelResponse;
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setLoading(false);
          setLoadError(true);
          return;
        }
        setSummary(json.summary ?? EMPTY_SUMMARY);
        setSources(json.sources ?? []);
        setPosts(json.sourcePosts ?? []);
        setScanBlocked(Boolean(json.scanBlocked));
        setScanBlockedReason(json.scanBlockedReason);
        setNow(Date.now());
        setLoadError(false);
        setLoading(false);
        loadedOnceRef.current = true;
      } catch {
        if (cancelled || controller.signal.aborted) return;
        setLoading(false);
        setLoadError(true);
      }
    };

    const timer = setTimeout(run, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  // ── Kaynak CRUD ──────────────────────────────────────────────────────────
  const openNewSource = () => {
    setEditingId(null);
    setForm(NEW_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditSource = (src: Source) => {
    setEditingId(src.id);
    setForm({
      account: src.accountHandle,
      handle: src.handle,
      mode: src.mode || "ALL",
      likes: String(src.thresholdLikes),
      retweets: String(src.thresholdRetweets),
    });
    setFormError(null);
    setFormOpen(true);
  };

  const submitSource = async () => {
    const cleanHandle = form.handle.replace(/^@+/, "").trim();
    if (!editingId && !cleanHandle) {
      setFormError("X kullanıcı adı gerekli.");
      return;
    }
    const likes = Math.max(0, Number.parseInt(form.likes, 10) || 0);
    const retweets = Math.max(0, Number.parseInt(form.retweets, 10) || 0);
    setSubmitting(true);
    setFormError(null);
    try {
      const res = editingId
        ? await fetch(`/api/sources/${encodeURIComponent(editingId)}`, {
            method: "PATCH",
            headers: JSON_HEADERS,
            body: JSON.stringify({ mode: form.mode, thresholdLikes: likes, thresholdRetweets: retweets }),
          })
        : await fetch(`/api/sources`, {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({
              accountHandle: form.account,
              handle: cleanHandle,
              mode: form.mode,
              thresholdLikes: likes,
              thresholdRetweets: retweets,
            }),
          });
      const json = (await res.json()) as MutationResponse;
      if (res.ok && json.success) {
        toast.success(editingId ? `@${form.handle} kriterleri güncellendi.` : `@${cleanHandle} kaynağı eklendi.`);
        setFormOpen(false);
        reload();
      } else {
        const msg = json.error ?? (res.status === 409 ? "Bu kaynak zaten ekli." : "Kaydedilemedi.");
        setFormError(msg);
        toast.error(msg);
      }
    } catch {
      setFormError("Ağ hatası. Tekrar dene.");
      toast.error("Ağ hatası. Tekrar dene.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSource = async (src: Source) => {
    try {
      const res = await fetch(`/api/sources/${encodeURIComponent(src.id)}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ enabled: !src.enabled }),
      });
      const json = (await res.json()) as MutationResponse;
      if (res.ok && json.success) {
        toast.success(`@${src.handle} ${!src.enabled ? "başlatıldı" : "durduruldu"}.`);
        reload();
      } else {
        toast.error(json.error ?? "Durum güncellenemedi.");
      }
    } catch {
      toast.error("Ağ hatası.");
    }
  };

  const archiveSource = async (src: Source) => {
    if (!window.confirm(`@${src.handle} kaynağını arşivle? Bu hesap artık taranmayacak.`)) return;
    try {
      const res = await fetch(`/api/sources/${encodeURIComponent(src.id)}`, { method: "DELETE" });
      const json = (await res.json()) as MutationResponse;
      if (res.ok && json.success) {
        toast.success(`@${src.handle} arşivlendi.`);
        if (editingId === src.id) setFormOpen(false);
        reload();
      } else {
        toast.error(json.error ?? "Arşivlenemedi.");
      }
    } catch {
      toast.error("Ağ hatası.");
    }
  };

  // ── Skor detay (SAFE, deterministik) ─────────────────────────────────────
  const openScore = async (post: SourcePost) => {
    scoreCtrlRef.current?.abort();
    const ctrl = new AbortController();
    scoreCtrlRef.current = ctrl;
    setActivePost(post);
    setScoreDetail(null);
    setScoreError(false);
    setScoreLoading(true);
    try {
      const res = await fetch(
        `/api/growth/source-intelligence/source-posts/${encodeURIComponent(post.id)}/score`,
        { method: "POST", signal: ctrl.signal },
      );
      const json = (await res.json()) as ScoreResponse;
      if (ctrl.signal.aborted) return;
      if (res.ok && json.success && json.score) setScoreDetail(json.score);
      else setScoreError(true);
    } catch {
      if (ctrl.signal.aborted) return;
      setScoreError(true);
    } finally {
      if (!ctrl.signal.aborted) setScoreLoading(false);
    }
  };

  const closeScore = () => {
    scoreCtrlRef.current?.abort();
    setActivePost(null);
  };

  const metricItems: MetricStripItem[] = [
    { label: "aktif kaynak", value: summary.activeSources },
    { label: "taranan post", value: summary.totalSourcePosts },
    { label: "yüksek fırsat", value: summary.highOpportunityPosts, tone: "ok" },
    { label: "yüksek risk", value: summary.highRiskPosts, tone: "danger" },
  ];

  const panelUrl = safeExternalUrl(activePost?.url);
  const panelReason = scoreDetail?.reason || activePost?.reason || "";
  const panelOpp = scoreDetail?.opportunityScore ?? activePost?.opportunityScore ?? 0;
  const panelRisk = scoreDetail?.riskScore ?? activePost?.riskScore ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }} data-testid="source-intel-screen">
      <PageHeader
        eyebrow="Keşif"
        title="X Hesabı Kaynakları"
        subtitle="İzlenen X hesaplarını yönet; taranan postları ve fırsat skorlarını hesap bazlı incele."
        actions={
          <Button variant="secondary" size="sm" onClick={reload} iconLeft={<RefreshCw size={15} strokeWidth={2} />}>
            Yenile
          </Button>
        }
      />

      {/* Sessiz metrikler — hero StatCard değil */}
      <MetricStrip items={metricItems} data-testid="sis-metrics" />

      <FilterBar
        values={values}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
        onReset={() => setValues(DEFAULT_FILTERS)}
        fields={[
          { kind: "segment", key: "account", label: "Hesap", options: ACCOUNT_SEGMENTS },
          { kind: "select", key: "status", label: "Durum", options: STATUS_OPTIONS },
          { kind: "select", key: "sourceType", label: "Tür", options: TYPE_OPTIONS },
          { kind: "select", key: "action", label: "Aksiyon", options: ACTION_OPTIONS },
          { kind: "select", key: "risk", label: "Risk", options: RISK_OPTIONS },
          { kind: "select", key: "sort", label: "Sırala", width: 176, options: SORT_OPTIONS },
          { kind: "search", key: "search", placeholder: "Metin veya @kaynak ara…" },
        ]}
      />

      {/* Dış engel (SocialData 402) — liste yine okunur */}
      {scanBlocked && (
        <BlockedExternalState
          compact
          title="Tarama engelli: SocialData"
          description="Yeni post taraması SocialData sağlayıcısında engelli. Aşağıdaki daha önce taranmış postlar yine okunabilir; taramayı Ayarlar → Entegrasyonlar üzerinden çöz."
          detail={scanBlockedReason ?? "Gerekli: SocialData kredisi / geçerli anahtar."}
        />
      )}

      {loading && !hasData ? (
        <LoadingSplit />
      ) : loadError && !hasData ? (
        <ErrorState
          title="Kaynak verisi yüklenemedi"
          description="Kaynaklar ve fırsat havuzu getirilemedi. Bağlantını kontrol edip yeniden dene."
          onRetry={reload}
        />
      ) : (
        <>
          {loadError && hasData && (
            <div
              role="note"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "8px 13px",
                fontSize: "var(--text-xs)",
                color: "var(--status-warn-text)",
                background: "color-mix(in srgb, var(--status-warn) 8%, var(--bg-sunken))",
                border: "1px solid color-mix(in srgb, var(--status-warn) 24%, transparent)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <span>Yenilenemedi — önceki sonuçlar gösteriliyor.</span>
              <button
                onClick={reload}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--accent-text)",
                  fontFamily: "inherit",
                  fontSize: "var(--text-xs)",
                  fontWeight: 500,
                  cursor: "pointer",
                  padding: "2px 4px",
                }}
              >
                Tekrar dene
              </button>
            </div>
          )}

          <div className="sis-split" style={{ display: "grid", gap: 16, alignItems: "start" }}>
            <style>{`.sis-split { grid-template-columns: 1fr; } @media (min-width: 1024px) { .sis-split { grid-template-columns: 320px 1fr; } }`}</style>

            {/* Sol: izlenen kaynaklar */}
            <Card variant="feature" style={{ display: "flex", flexDirection: "column", gap: 4, alignSelf: "start" }}>
              <SectionHeader
                eyebrow="İzleme"
                title="İzlenen kaynaklar"
                action={
                  <Button variant="secondary" size="sm" onClick={openNewSource} iconLeft={<Plus size={14} strokeWidth={2} />} data-testid="source-new">
                    Yeni
                  </Button>
                }
              />
              {sources.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Radar size={20} strokeWidth={1.8} />}
                  title="Henüz kaynak eklenmedi"
                  description="İzlenecek bir X hesabı ekle; kriterlerine uyan postlar fırsat havuzunda listelenir."
                  action={
                    <Button variant="primary" size="sm" onClick={openNewSource} iconLeft={<Plus size={14} strokeWidth={2} />}>
                      Yeni kaynak
                    </Button>
                  }
                />
              ) : (
                <div style={{ maxHeight: 560, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                  {sources.map((src, i) => (
                    <SourceRow
                      key={src.id}
                      src={src}
                      first={i === 0}
                      onToggle={() => toggleSource(src)}
                      onEdit={() => openEditSource(src)}
                      onArchive={() => archiveSource(src)}
                    />
                  ))}
                </div>
              )}
            </Card>

            {/* Sağ: fırsat havuzu */}
            <Card variant="feature" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <SectionHeader
                eyebrow="Fırsat"
                title="Fırsat havuzu"
                action={<Badge variant="muted" size="sm">{posts.length} gönderi</Badge>}
              />
              {posts.length === 0 ? (
                <EmptyState
                  icon={<Sparkles size={22} strokeWidth={1.8} />}
                  title="Henüz taranmış kaynak post yok"
                  description="Aktif kaynaklar tarandığında kriterlere uyan gönderiler burada fırsat/risk skorlarıyla listelenir."
                />
              ) : (
                <div style={{ maxHeight: 560, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                  {posts.map((post, i) => (
                    <PostRow key={post.id} post={post} first={i === 0} now={now} onOpen={() => openScore(post)} />
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {/* Kaynak formu — Drawer (elle modal YOK) */}
      <Drawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? `@${form.handle} kriterleri` : "Yeni kaynak ekle"}
        width={460}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {editingId ? (
            <FormField label="Hedef hesap">
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>@{form.account}</div>
            </FormField>
          ) : (
            <FormField label="Hedef hesap">
              <Select
                aria-label="Hedef hesap"
                value={form.account}
                onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))}
                options={[
                  { value: "grafikcem", label: "@grafikcem" },
                  { value: "maskulenkod", label: "@maskulenkod" },
                ]}
              />
            </FormField>
          )}

          <FormField label="X kullanıcı adı">
            {editingId ? (
              <Input value={`@${form.handle}`} disabled aria-label="X kullanıcı adı" />
            ) : (
              <Input
                value={form.handle}
                onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value }))}
                placeholder="@kullanici"
                aria-label="X kullanıcı adı"
                data-testid="source-form-handle"
              />
            )}
          </FormField>

          <FormField label="Tarama modu">
            <Select
              aria-label="Tarama modu"
              value={form.mode}
              onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}
              options={MODE_OPTIONS}
            />
          </FormField>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Beğeni eşiği">
              <Input
                type="number"
                min={0}
                value={form.likes}
                onChange={(e) => setForm((f) => ({ ...f, likes: e.target.value }))}
                aria-label="Beğeni eşiği"
              />
            </FormField>
            <FormField label="Retweet eşiği">
              <Input
                type="number"
                min={0}
                value={form.retweets}
                onChange={(e) => setForm((f) => ({ ...f, retweets: e.target.value }))}
                aria-label="Retweet eşiği"
              />
            </FormField>
          </div>

          {formError && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)", color: "var(--danger)" }}>
              <ShieldAlert size={14} strokeWidth={2} />
              {formError}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={submitSource} loading={submitting} data-testid="source-form-submit">
              {editingId ? "Kaydet" : "Kaynak ekle"}
            </Button>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Vazgeç
            </Button>
            {editingId && (
              <Button
                variant="danger"
                onClick={() => {
                  const src = sources.find((s) => s.id === editingId);
                  if (src) void archiveSource(src);
                }}
                iconLeft={<Archive size={14} strokeWidth={2} />}
                style={{ marginLeft: "auto" }}
              >
                Arşivle
              </Button>
            )}
          </div>
        </div>
      </Drawer>

      {/* Skor kırılımı — DetailPanel (elle modal YOK) */}
      <DetailPanel
        open={!!activePost}
        onClose={closeScore}
        title={activePost ? `@${activePost.sourceHandle}` : ""}
        meta={
          activePost ? (
            <>
              <Badge variant="muted" size="sm">Hedef @{activePost.accountHandle}</Badge>
              <Badge variant={actionMeta(activePost.suggestedAction).variant} size="sm">
                {actionMeta(activePost.suggestedAction).label}
              </Badge>
              {isStale(activePost.scannedAt, now) && (
                <Badge variant="yellow" size="sm">taranma {formatDayMonth(activePost.scannedAt)}</Badge>
              )}
            </>
          ) : undefined
        }
        scores={scoreDetail ? <ScoreBars title="Alt skorlar" dense rows={subScoreRows(scoreDetail)} /> : undefined}
        actions={
          panelUrl ? (
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<ExternalLink size={14} strokeWidth={2} />}
              onClick={() => window.open(panelUrl, "_blank", "noopener,noreferrer")}
            >
              Gönderiyi X&apos;te aç
            </Button>
          ) : undefined
        }
      >
        {activePost && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                background: "var(--bg-sunken)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: 14,
                fontSize: "var(--text-sm)",
                color: "var(--text-primary)",
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
              }}
            >
              {activePost.text}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <StatBlock label="Fırsat" value={panelOpp} color={scoreColor(panelOpp)} />
              <StatBlock label="Risk" value={panelRisk} color={scoreColor(panelRisk, { invert: true })} />
            </div>

            {scoreLoading ? (
              <Skeleton lines={4} height={12} />
            ) : scoreError ? (
              <ErrorState
                compact
                title="Skor hesaplanamadı"
                description="Bu gönderi için skor kırılımı getirilemedi. Yeniden dene."
                onRetry={() => void openScore(activePost)}
              />
            ) : scoreDetail ? (
              <>
                <Field label="Gerekçe">{panelReason || "Skorlama motoru bu kaynak için belirgin bir sinyal bulamadı."}</Field>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Güven</span>
                  <span className="tnum" style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)" }}>
                    {scoreDetail.confidence}%
                  </span>
                </div>
                {scoreDetail.suggestedAccounts.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Önerilen hesap</span>
                    {scoreDetail.suggestedAccounts.map((h) => (
                      <Badge key={h} variant="accent" size="sm">@{h}</Badge>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </DetailPanel>
    </div>
  );
}

// ── Skor satırları (7 alt-skor) ───────────────────────────────────────────────
function subScoreRows(s: ScoreDetail): { name: string; value: number }[] {
  return [
    { name: "Uygunluk", value: s.relevanceScore },
    { name: "Tazelik", value: s.freshnessScore },
    { name: "Tartışma", value: s.controversyScore },
    { name: "Kitle uyumu", value: s.audienceFitScore },
    { name: "Alıntı potansiyeli", value: s.quotePotentialScore },
    { name: "Yanıt potansiyeli", value: s.replyPotentialScore },
    { name: "Bağımsız tweet", value: s.standaloneTweetScore },
  ];
}

// ── Sol panel satırı ──────────────────────────────────────────────────────────
function SourceRow({
  src,
  first,
  onToggle,
  onEdit,
  onArchive,
}: {
  src: Source;
  first: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <div
      data-testid={`source-row-${src.id}`}
      style={{
        padding: "12px 2px",
        borderTop: first ? "none" : "1px solid var(--border-faint)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
            @{src.handle}
          </span>
          {src.displayName && (
            <span
              style={{
                fontSize: "var(--text-2xs)",
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {src.displayName}
            </span>
          )}
        </div>
        <StatusBadge status={src.enabled ? "active" : "inactive"} kind="source" size="sm" />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: 8,
          rowGap: 2,
          fontSize: "var(--text-2xs)",
          color: "var(--text-muted)",
        }}
      >
        <span>Hedef <span style={{ color: "var(--text-secondary)" }}>@{src.accountHandle}</span></span>
        <span aria-hidden>·</span>
        <span>Filtre <span style={{ color: "var(--text-secondary)" }}>{src.mode}</span></span>
        <span aria-hidden>·</span>
        <span>Eşik <span className="tnum" style={{ color: "var(--text-secondary)" }}>{src.thresholdLikes}♥ / {src.thresholdRetweets}🔁</span></span>
        {src.totalPosts > 0 && (
          <>
            <span aria-hidden>·</span>
            <span className="tnum">Ort. fırsat <span style={{ color: "var(--accent-text)" }}>{src.averageOpportunity}%</span></span>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        <RowAction onClick={onToggle} tone={src.enabled ? "danger" : "ok"} icon={src.enabled ? <Pause size={12} strokeWidth={2} /> : <Play size={12} strokeWidth={2} />}>
          {src.enabled ? "Durdur" : "Başlat"}
        </RowAction>
        <RowAction onClick={onEdit} tone="accent" icon={<Pencil size={12} strokeWidth={2} />}>
          Kriter
        </RowAction>
        <RowAction onClick={onArchive} tone="muted" icon={<Archive size={12} strokeWidth={2} />}>
          Arşivle
        </RowAction>
      </div>
    </div>
  );
}

// ── Sağ panel satırı ──────────────────────────────────────────────────────────
function PostRow({
  post,
  first,
  now,
  onOpen,
}: {
  post: SourcePost;
  first: boolean;
  now: number | null;
  onOpen: () => void;
}) {
  const action = actionMeta(post.suggestedAction);
  const stale = isStale(post.scannedAt, now);
  return (
    <div
      data-testid={`srcpost-${post.id}`}
      style={{
        padding: "12px 2px",
        borderTop: first ? "none" : "1px solid var(--border-faint)",
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--accent-text)", whiteSpace: "nowrap" }}>
            @{post.sourceHandle}
          </span>
          <span aria-hidden style={{ fontSize: 9, color: "var(--text-muted)" }}>·</span>
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Hedef @{post.accountHandle}</span>
          {stale && (
            <>
              <span aria-hidden style={{ fontSize: 9, color: "var(--text-muted)" }}>·</span>
              <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--status-warn-text)", whiteSpace: "nowrap" }}>
                taranma {formatDayMonth(post.scannedAt)}
              </span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <Badge variant={oppVariant(post.opportunityScore)} size="sm">Fırsat {post.opportunityScore}</Badge>
          <Badge variant={riskVariant(post.riskScore)} size="sm">Risk {post.riskScore}</Badge>
          <Badge variant={action.variant} size="sm">{action.label}</Badge>
        </div>
      </div>

      <div
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--text-secondary)",
          lineHeight: 1.5,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {post.text}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div className="tnum" style={{ display: "flex", gap: 12, fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Heart size={13} strokeWidth={1.8} /> {post.likeCount}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Repeat2 size={14} strokeWidth={1.8} /> {post.retweetCount}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Eye size={13} strokeWidth={1.8} /> {post.viewCount}</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <SaveToBoardButton source={{ kind: "sourcePost", id: post.id }} size="xs" />
          <Button variant="secondary" size="sm" onClick={onOpen} iconLeft={<Sparkles size={13} strokeWidth={2} />}>
            Skor detayı
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Küçük yapı taşları ────────────────────────────────────────────────────────
function RowAction({
  children,
  icon,
  tone,
  onClick,
}: {
  children: ReactNode;
  icon: ReactNode;
  tone: "danger" | "ok" | "accent" | "muted";
  onClick: () => void;
}) {
  const color =
    tone === "danger" ? "var(--danger)" : tone === "ok" ? "var(--status-ok-text)" : tone === "accent" ? "var(--accent-text)" : "var(--text-muted)";
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "none",
        border: "none",
        color,
        fontSize: "var(--text-2xs)",
        fontWeight: 500,
        cursor: "pointer",
        padding: "2px 4px",
        fontFamily: "inherit",
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function StatBlock({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "var(--bg-sunken)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "12px 14px" }}>
      <div className="eyebrow" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="font-display tnum" style={{ fontSize: "var(--text-2xl)", fontWeight: 500, color, letterSpacing: "-0.02em", marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span className="eyebrow" style={{ color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function LoadingSplit() {
  return (
    <div className="sis-split" style={{ display: "grid", gap: 16, alignItems: "start" }}>
      <style>{`.sis-split { grid-template-columns: 1fr; } @media (min-width: 1024px) { .sis-split { grid-template-columns: 320px 1fr; } }`}</style>
      <Card variant="feature">
        <Skeleton width={150} height={14} style={{ marginBottom: 16 }} />
        <Skeleton lines={5} height={40} />
      </Card>
      <Card variant="feature">
        <Skeleton width={150} height={14} style={{ marginBottom: 16 }} />
        <Skeleton lines={5} height={56} />
      </Card>
    </div>
  );
}
