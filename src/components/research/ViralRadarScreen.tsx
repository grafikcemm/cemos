"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  Radar,
  RefreshCw,
  Heart,
  Repeat2,
  Eye,
  ExternalLink,
  Sparkles,
  Check,
  EyeOff,
  Send,
  Copy,
} from "lucide-react";
import {
  PageHeader,
  MetricStrip,
  type MetricStripItem,
  FilterBar,
  EntityCard,
  AvatarTile,
  ScoreBars,
  DetailPanel,
  Drawer,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  BlockedExternalState,
  StaleNotice,
  Textarea,
  Skeleton,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useXAgentStore } from "@/store/xagent";
import SaveToBoardButton from "@/components/library/SaveToBoardButton";

/**
 * Keşif / Viral Radar (spec 05 §E3) — REDESIGNED-ADVANCED araştırma ekranı.
 * Legacy FlowRadarTab'ın 8-kutu KPI hero'su, ham <select>'leri ve elle yapılmış
 * fixed-overlay modalları KALKTI; yerine dark-editorial arketip: kendi PageHeader'ı,
 * sessiz MetricGrid, FilterBar, EntityCard listesi, DetailPanel + Drawer.
 *
 * Bare değil — advanced ekran kendi PageHeader'ını taşır (shell vermez).
 * Ücretli uçlar (generate-drafts / save-pattern) YALNIZ kullanıcı tıklamasıyla;
 * 402 → BlockedExternalState (liste çalışmaya devam eder). summary null → "–".
 */

/* ── Tipler (ham API şekilleri — envelope {success, ...}) ─────────────────── */

interface Metrics {
  likes: number;
  reposts: number;
  views: number;
}
interface Score {
  opportunityScore: number;
  riskScore: number;
  suggestedAction: string;
  reason: string;
}
interface Pattern {
  suggestedPatterns: string[];
  emotionalTrigger: string;
  viralityReason: string;
}
interface Candidate {
  id: string;
  sourceHandle: string;
  sourceName: string;
  accountHandle: string;
  content: string;
  url: string;
  publishedAt: string | null;
  metrics: Metrics;
  score: Score;
  pattern: Pattern;
  status: string;
  scannedAt: string | null;
  viralScore: number;
}
interface Summary {
  totalCandidates: number;
  highOpportunity: number;
  highRisk: number;
  tweetCandidates: number;
  quoteCandidates: number;
  replyCandidates: number;
  ignored: number;
  averageOpportunityScore: number;
}
interface FlowRadarResponse {
  success: boolean;
  summary?: Summary | null;
  candidates?: Candidate[];
  error?: string;
}

interface Critic {
  publishScore: number;
  personaMatchScore: number;
  hookStrengthScore: number;
  riskScore: number;
  rewriteSuggestion?: string;
}
interface Draft {
  id: string;
  content: string;
  angle: string;
  reasoning: string;
  accountHandle: string;
  modeId?: string;
}
interface DraftItem {
  draft: Draft;
  critic: Critic;
}
interface GenerateResponse {
  success: boolean;
  drafts?: DraftItem[];
  error?: string;
}
interface ActionResponse {
  success: boolean;
  message?: string;
  error?: string;
}

type BadgeVariant = "default" | "accent" | "muted" | "blue" | "yellow" | "red" | "danger" | "success";
type DraftActionType = "tweet" | "quote" | "reply";
type Opt = { value: string; label: string };

/* ── Sabit eşlemeler (StatusBadge bu enum'ları taşımaz → Badge + yerel harita) ─ */

const ACTION_META: Record<string, { label: string; variant: BadgeVariant }> = {
  tweet: { label: "Tweet", variant: "accent" },
  quote: { label: "Alıntı", variant: "blue" },
  reply: { label: "Yanıt", variant: "yellow" },
  ignore: { label: "Yoksay", variant: "muted" },
};
const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  new: { label: "Yeni", variant: "muted" },
  reviewed: { label: "İncelendi", variant: "blue" },
  used: { label: "Kullanıldı", variant: "success" },
  ignored: { label: "Yoksayıldı", variant: "muted" },
};
const ANGLE_META: Record<string, { label: string; variant: BadgeVariant }> = {
  safe: { label: "Güvenli", variant: "success" },
  strong: { label: "Güçlü", variant: "blue" },
  bold: { label: "Cesur", variant: "danger" },
};

const ACCOUNT_OPTIONS: Opt[] = [
  { value: "all", label: "Tümü" },
  { value: "grafikcem", label: "@grafikcem" },
  { value: "maskulenkod", label: "@maskulenkod" },
];
const ACTION_OPTIONS: Opt[] = [
  { value: "all", label: "Tümü" },
  { value: "tweet", label: "Tweet" },
  { value: "quote", label: "Alıntı" },
  { value: "reply", label: "Yanıt" },
];
const RISK_OPTIONS: Opt[] = [
  { value: "all", label: "Tümü" },
  { value: "low", label: "Düşük" },
  { value: "medium", label: "Orta" },
  { value: "high", label: "Yüksek" },
];
const STATUS_OPTIONS: Opt[] = [
  { value: "all", label: "Tümü" },
  { value: "new", label: "Yeni" },
  { value: "reviewed", label: "İncelendi" },
  { value: "used", label: "Kullanıldı" },
  { value: "ignored", label: "Yoksayılan" },
];
const SORT_OPTIONS: Opt[] = [
  { value: "opportunityScore", label: "Fırsat" },
  { value: "riskScore", label: "Risk" },
  { value: "publishedAt", label: "Tarih" },
];

const STALE_HOURS = 12;
const TWEET_LIMIT = 280;

const CLAMP_3: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  lineHeight: 1.6,
  margin: 0,
};

/* ── Saf yardımcılar ──────────────────────────────────────────────────────── */

function stop(e: MouseEvent): void {
  e.stopPropagation();
}

function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeAction(s: string): DraftActionType {
  const a = s.toLowerCase();
  return a === "quote" || a === "reply" ? a : "tweet";
}

function oppVariant(v: number): BadgeVariant {
  if (v >= 75) return "accent";
  if (v >= 50) return "yellow";
  return "muted";
}

function compactNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

/* ── Ekran ────────────────────────────────────────────────────────────────── */

export default function ViralRadarScreen() {
  const toast = useToast();
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);

  // React 19 saflık: Date.now() render'da (useMemo fabrikası dâhil) çağrılamaz —
  // yalnız mount effect'inde okunur, state'e yazılır. Effect gelene dek null.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);

  // toast'ı load bağımlılığına sokmadan güncel tut (toast göründüğünde refetch olmasın).
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  const loadedRef = useRef(false);

  // Filtreler
  const [account, setAccount] = useState("all");
  const [action, setAction] = useState("all");
  const [risk, setRisk] = useState("all");
  const [status, setStatus] = useState("new");
  const [sort, setSort] = useState("opportunityScore");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Veri
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  // Kart aksiyon meşguliyeti
  const [cardBusy, setCardBusy] = useState<{ id: string; kind: "review" | "ignore" } | null>(null);

  // Detay paneli
  const [detailCand, setDetailCand] = useState<Candidate | null>(null);
  const [detailBusy, setDetailBusy] = useState<"pattern" | "queue" | null>(null);
  const [patternBlocked, setPatternBlocked] = useState(false);

  // Taslak üretici drawer
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftCand, setDraftCand] = useState<Candidate | null>(null);
  const [draftAction, setDraftAction] = useState<DraftActionType>("tweet");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftBlocked, setDraftBlocked] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [editedDrafts, setEditedDrafts] = useState<Record<string, string>>({});
  const [queuingId, setQueuingId] = useState<string | null>(null);

  // Arama debounce (her tuşta refetch yapma).
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 320);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (account !== "all") params.set("accountHandle", account);
      if (action !== "all") params.set("action", action);
      if (risk !== "all") params.set("risk", risk);
      if (status !== "all") params.set("status", status);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      params.set("sort", sort);

      const res = await fetch(`/api/growth/flow-radar?${params.toString()}`);
      if (!res.ok) throw new Error("http");
      const json = (await res.json()) as FlowRadarResponse;
      if (!json.success) throw new Error(json.error ?? "payload");

      setCandidates(json.candidates ?? []);
      setSummary(json.summary ?? null);
      setError(false);
      loadedRef.current = true;
    } catch {
      // summary null → sahte 0 değil "–". Zaten yüklüyse listeyi koru + uyar.
      setSummary(null);
      if (loadedRef.current) {
        toastRef.current.error("Aday akışı yenilenemedi — mevcut liste korunuyor.");
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [account, action, risk, status, sort, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const onFilterChange = (key: string, value: string) => {
    if (key === "account") setAccount(value);
    else if (key === "action") setAction(value);
    else if (key === "risk") setRisk(value);
    else if (key === "status") setStatus(value);
    else if (key === "sort") setSort(value);
    else if (key === "search") setSearch(value);
  };

  const onFilterReset = () => {
    setAccount("all");
    setAction("all");
    setRisk("all");
    setStatus("new");
    setSort("opportunityScore");
    setSearch("");
  };

  /* ── Aksiyonlar (hepsi gerçek: fetch + toast; ölü buton yok) ─────────────── */

  const ignoreCandidate = async (cand: Candidate) => {
    setCardBusy({ id: cand.id, kind: "ignore" });
    try {
      const res = await fetch(`/api/growth/flow-radar/source-posts/${cand.id}/ignore`, { method: "POST" });
      const json = (await res.json()) as ActionResponse;
      if (res.ok && json.success) {
        toast.success("Aday yoksayıldı.");
        load();
      } else {
        toast.error(json.error ?? "Aday yoksayılamadı.");
      }
    } catch {
      toast.error("İşlem başarısız (ağ hatası).");
    } finally {
      setCardBusy(null);
    }
  };

  const markReviewed = async (cand: Candidate) => {
    setCardBusy({ id: cand.id, kind: "review" });
    try {
      const res = await fetch(`/api/growth/flow-radar/source-posts/${cand.id}/mark-reviewed`, { method: "POST" });
      const json = (await res.json()) as ActionResponse;
      if (res.ok && json.success) {
        toast.success("Aday incelendi olarak işaretlendi.");
        load();
      } else {
        toast.error(json.error ?? "Aday güncellenemedi.");
      }
    } catch {
      toast.error("İşlem başarısız (ağ hatası).");
    } finally {
      setCardBusy(null);
    }
  };

  // Ücretli (402): desen çıkarımı. 402 → panelde BlockedExternalState.
  const savePattern = async (cand: Candidate) => {
    setDetailBusy("pattern");
    try {
      const res = await fetch(`/api/growth/flow-radar/source-posts/${cand.id}/save-pattern`, { method: "POST" });
      if (res.status === 402) {
        setPatternBlocked(true);
        toast.error("Desen kaydı engelli: OpenRouter kredisi gerekiyor.");
        return;
      }
      const json = (await res.json()) as ActionResponse;
      if (res.ok && json.success) {
        toast.success("Desen ve eğitim örneği kaydedildi.");
        load();
      } else {
        toast.error(json.error ?? "Desen çıkarılamadı.");
      }
    } catch {
      toast.error("İşlem başarısız (ağ hatası).");
    } finally {
      setDetailBusy(null);
    }
  };

  // Kaynak gönderiyi olduğu gibi kuyruğa (güvenli uç). Başarı → Bugün'e geç.
  const sendSourceToQueue = async (cand: Candidate) => {
    setDetailBusy("queue");
    try {
      const res = await fetch(`/api/growth/flow-radar/source-posts/${cand.id}/send-to-queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: cand.content, accountHandle: cand.accountHandle }),
      });
      const json = (await res.json()) as ActionResponse;
      if (res.ok && json.success) {
        toast.success(json.message ?? "Kaynak kuyruğa eklendi.");
        setDetailCand(null);
        setActiveTab("morning");
      } else {
        toast.error(json.error ?? "Kuyruğa eklenemedi.");
      }
    } catch {
      toast.error("Kuyruğa eklenemedi (ağ hatası).");
    } finally {
      setDetailBusy(null);
    }
  };

  // Ücretli (402): 3 taslak üretimi. YALNIZ tıklamayla; 402 → drawer'da blocked.
  const openDraftGenerator = async (cand: Candidate) => {
    const actionType = normalizeAction(cand.score.suggestedAction);
    setDetailCand(null);
    setDraftCand(cand);
    setDraftAction(actionType);
    setDraftOpen(true);
    setDrafts([]);
    setEditedDrafts({});
    setDraftBlocked(false);
    setDraftError(false);
    setDraftLoading(true);
    try {
      const res = await fetch("/api/growth/generate-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountHandle: cand.accountHandle,
          actionType,
          sourcePostId: cand.id,
          count: 3,
        }),
      });
      if (res.status === 402) {
        setDraftBlocked(true);
        return;
      }
      if (!res.ok) throw new Error("http");
      const json = (await res.json()) as GenerateResponse;
      if (!json.success || !json.drafts) throw new Error(json.error ?? "payload");
      setDrafts(json.drafts);
      const seed: Record<string, string> = {};
      for (const d of json.drafts) seed[d.draft.id] = d.draft.content;
      setEditedDrafts(seed);
    } catch {
      setDraftError(true);
    } finally {
      setDraftLoading(false);
    }
  };

  const queueDraft = async (item: DraftItem) => {
    if (!draftCand) return;
    const content = editedDrafts[item.draft.id] ?? item.draft.content;
    setQueuingId(item.draft.id);
    try {
      const res = await fetch(`/api/growth/flow-radar/source-posts/${draftCand.id}/send-to-queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, accountHandle: item.draft.accountHandle, modeId: item.draft.modeId }),
      });
      const json = (await res.json()) as ActionResponse;
      if (res.ok && json.success) {
        toast.success(json.message ?? "Taslak kuyruğa eklendi.");
        setDraftOpen(false);
        setActiveTab("morning");
      } else {
        toast.error(json.error ?? "Kuyruğa eklenemedi.");
      }
    } catch {
      toast.error("Kuyruğa eklenemedi (ağ hatası).");
    } finally {
      setQueuingId(null);
    }
  };

  const copyDraft = async (item: DraftItem) => {
    const content = editedDrafts[item.draft.id] ?? item.draft.content;
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Taslak panoya kopyalandı.");
    } catch {
      toast.error("Panoya kopyalanamadı.");
    }
  };

  /* ── Türetilmiş değerler ────────────────────────────────────────────────── */

  const list = candidates ?? [];
  const showInitialLoading = loading && candidates === null;
  const showError = error && candidates === null;

  const sv = (v: number | undefined): string => (summary ? String(v ?? 0) : "–");
  const avgLabel = summary ? `${Math.round(summary.averageOpportunityScore)}%` : "–";

  const staleHours = useMemo(() => {
    if (now === null) return null;
    let latest = 0;
    for (const c of list) {
      if (!c.scannedAt) continue;
      const t = Date.parse(c.scannedAt);
      if (!Number.isNaN(t) && t > latest) latest = t;
    }
    if (latest === 0) return null;
    return Math.max(0, (now - latest) / 3_600_000);
  }, [list, now]);
  const isStale = staleHours !== null && staleHours >= STALE_HOURS;

  const metricItems: MetricStripItem[] = [
    { label: "Toplam aday", value: sv(summary?.totalCandidates) },
    { label: "yüksek fırsat ≥75", value: sv(summary?.highOpportunity), tone: "ok" },
    { label: "yüksek risk ≥70", value: sv(summary?.highRisk), tone: "danger" },
    { label: "ort. fırsat", value: avgLabel },
  ];

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}>
      <PageHeader
        eyebrow="Keşif"
        title="Viral Radar"
        subtitle="Kaynaklardan gelen viral adayları incele, aksiyonu belirle, üretime yönlendir."
        actions={
          <Button
            variant="secondary"
            onClick={load}
            loading={refreshing}
            iconLeft={<RefreshCw size={15} strokeWidth={2} />}
          >
            Yenile
          </Button>
        }
      />

      {/* Pipeline künyesi — kutu değil, ince satır */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginTop: -8,
          fontSize: "var(--text-xs)",
          fontWeight: 500,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        <span style={{ color: "var(--accent-text)" }}>Tara</span>
        <span aria-hidden style={{ opacity: 0.4 }}>→</span>
        <span>Puanla</span>
        <span aria-hidden style={{ opacity: 0.4 }}>→</span>
        <span>Karar Ver</span>
        <span aria-hidden style={{ opacity: 0.4 }}>→</span>
        <span>Üret</span>
      </div>

      {/* Sessiz metrik şeridi — hero KPI kutuları değil */}
      <MetricStrip items={metricItems} data-testid="radar-metrics" />

      <FilterBar
        fields={[
          { kind: "segment", key: "account", label: "Hesap", options: ACCOUNT_OPTIONS },
          { kind: "select", key: "action", label: "Aksiyon", options: ACTION_OPTIONS },
          { kind: "select", key: "risk", label: "Risk", options: RISK_OPTIONS },
          { kind: "select", key: "status", label: "Durum", options: STATUS_OPTIONS },
          { kind: "select", key: "sort", label: "Sırala", options: SORT_OPTIONS },
          { kind: "search", key: "search", placeholder: "Metin, kanca veya kaynak ara…" },
        ]}
        values={{ account, action, risk, status, sort, search }}
        onChange={onFilterChange}
        onReset={onFilterReset}
        rightSlot={
          <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            {list.length} aday
          </span>
        }
      />

      {/* Taranma tazelik uyarısı (doğrulama DEĞİL) */}
      {!showInitialLoading && !showError && isStale && staleHours !== null && (
        <StaleNotice
          ageLabel={`taranma ${Math.round(staleHours)} saat önce`}
          message="Bu bir tazelik işareti — taranmış olmak doğrulanmış olmak değildir. Karar öncesi kaynağı teyit et."
        />
      )}

      {showInitialLoading ? (
        <LoadingCards />
      ) : showError ? (
        <ErrorState
          title="Adaylar yüklenemedi"
          description="Viral aday akışı getirilemedi. Bağlantını kontrol edip yeniden dene."
          onRetry={load}
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Radar size={22} strokeWidth={1.8} />}
          title="Henüz Viral Radar adayı yok"
          description="Kaynak taramasından beslenir — kaynak gönderiler tarandığında ve fırsat puanı oluştuğunda adaylar burada listelenir."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}>
          {list.map((cand) => {
            const act = cand.score.suggestedAction;
            const opp = cand.score.opportunityScore;
            const rsk = cand.score.riskScore;
            const st = STATUS_META[cand.status];
            const actMeta = ACTION_META[act];
            return (
              <EntityCard
                key={cand.id}
                onClick={() => setDetailCand(cand)}
                avatar={<AvatarTile label={cand.sourceHandle} />}
                eyebrow={cand.sourceName || undefined}
                title={`@${cand.sourceHandle} → @${cand.accountHandle}`}
                badges={
                  <>
                    <Badge variant={actMeta?.variant ?? "muted"} size="sm">
                      {actMeta?.label ?? act}
                    </Badge>
                    <Badge variant={oppVariant(opp)} size="sm">
                      Fırsat {Math.round(opp)}
                    </Badge>
                    {rsk >= 70 && (
                      <Badge variant="danger" size="sm">
                        Risk {Math.round(rsk)}
                      </Badge>
                    )}
                  </>
                }
                body={
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <p style={CLAMP_3}>{cand.content}</p>
                    {cand.pattern.suggestedPatterns.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {cand.pattern.suggestedPatterns.slice(0, 4).map((p) => (
                          <Badge key={p} variant="muted" size="xs">
                            {p}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                }
                scores={
                  <ScoreBars
                    dense
                    rows={[
                      { name: "Fırsat", value: opp },
                      { name: "Risk", value: rsk, invert: true },
                    ]}
                  />
                }
                meta={
                  <>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Heart size={12} /> {compactNum(cand.metrics.likes)}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Repeat2 size={12} /> {compactNum(cand.metrics.reposts)}
                    </span>
                    {cand.metrics.views > 0 && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Eye size={12} /> {compactNum(cand.metrics.views)}
                      </span>
                    )}
                    {st && (
                      <Badge variant={st.variant} size="xs">
                        {st.label}
                      </Badge>
                    )}
                    {isHttpUrl(cand.url) && (
                      <a
                        href={cand.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={stop}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          color: "var(--accent-text)",
                          textDecoration: "none",
                        }}
                      >
                        Kaynak <ExternalLink size={11} />
                      </a>
                    )}
                  </>
                }
                actions={
                  <div onClick={stop} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <SaveToBoardButton source={{ kind: "sourcePost", id: cand.id }} size="xs" />
                    <Button size="sm" variant="ghost" onClick={() => setDetailCand(cand)}>
                      Detay
                    </Button>
                    <Button
                      size="sm"
                      intent="generate"
                      iconLeft={<Sparkles size={14} strokeWidth={2} />}
                      onClick={() => openDraftGenerator(cand)}
                    >
                      Üret
                    </Button>
                    {cand.status === "new" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        iconLeft={<Check size={14} strokeWidth={2} />}
                        loading={cardBusy?.id === cand.id && cardBusy.kind === "review"}
                        onClick={() => markReviewed(cand)}
                      >
                        İncelendi
                      </Button>
                    )}
                    {cand.status !== "ignored" && (
                      <Button
                        size="sm"
                        variant="danger"
                        iconLeft={<EyeOff size={14} strokeWidth={2} />}
                        loading={cardBusy?.id === cand.id && cardBusy.kind === "ignore"}
                        onClick={() => ignoreCandidate(cand)}
                      >
                        Yoksay
                      </Button>
                    )}
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      {/* Aday detay paneli (Drawer tabanlı) */}
      <DetailPanel
        open={detailCand !== null}
        onClose={() => {
          setDetailCand(null);
          setPatternBlocked(false);
        }}
        title={detailCand ? `@${detailCand.sourceHandle}` : ""}
        meta={
          detailCand && (
            <>
              <Badge
                variant={ACTION_META[detailCand.score.suggestedAction]?.variant ?? "muted"}
                size="sm"
              >
                {ACTION_META[detailCand.score.suggestedAction]?.label ?? detailCand.score.suggestedAction}
              </Badge>
              {STATUS_META[detailCand.status] && (
                <Badge variant={STATUS_META[detailCand.status].variant} size="sm">
                  {STATUS_META[detailCand.status].label}
                </Badge>
              )}
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                @{detailCand.sourceHandle} → @{detailCand.accountHandle}
              </span>
              {formatDate(detailCand.publishedAt) && (
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  {formatDate(detailCand.publishedAt)}
                </span>
              )}
            </>
          )
        }
        scores={
          detailCand && (
            <ScoreBars
              title="Skorlar"
              rows={[
                { name: "Fırsat", value: detailCand.score.opportunityScore },
                { name: "Risk", value: detailCand.score.riskScore, invert: true },
              ]}
            />
          )
        }
        actions={
          detailCand && (
            <>
              <Button
                size="sm"
                variant="secondary"
                loading={detailBusy === "pattern"}
                onClick={() => savePattern(detailCand)}
              >
                Desen Yap
              </Button>
              <Button
                size="sm"
                intent="generate"
                iconLeft={<Sparkles size={14} strokeWidth={2} />}
                onClick={() => openDraftGenerator(detailCand)}
              >
                Üret
              </Button>
              <Button
                size="sm"
                variant="primary"
                iconLeft={<Send size={14} strokeWidth={2} />}
                loading={detailBusy === "queue"}
                onClick={() => sendSourceToQueue(detailCand)}
              >
                Kuyruğa At
              </Button>
            </>
          )
        }
      >
        {detailCand && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
            {patternBlocked && (
              <BlockedExternalState
                compact
                title="Desen çıkarımı engelli"
                description="Desen çıkarımı dış sağlayıcı kredisi gerektiriyor (OpenRouter 402). Radar listesi ve karar aksiyonları çalışmaya devam eder."
                detail="Gerekli: OpenRouter kredisi."
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDetailCand(null);
                      setPatternBlocked(false);
                      setActiveTab("profile-integrations");
                    }}
                  >
                    Entegrasyonlar
                  </Button>
                }
              />
            )}
            <DetailBlock label="Kaynak gönderi">
              <span style={{ whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>{detailCand.content}</span>
            </DetailBlock>
            <DetailBlock label="Öneri gerekçesi">{detailCand.score.reason || "—"}</DetailBlock>
            <DetailBlock label="Desen analizi">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Tetikleyici duygu: </span>
                  <span style={{ color: "var(--text-primary)" }}>{detailCand.pattern.emotionalTrigger || "—"}</span>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Viral mekanik: </span>
                  <span style={{ color: "var(--text-primary)" }}>{detailCand.pattern.viralityReason || "—"}</span>
                </div>
                {detailCand.pattern.suggestedPatterns.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {detailCand.pattern.suggestedPatterns.map((p) => (
                      <Badge key={p} variant="accent" size="xs">
                        {p}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </DetailBlock>
          </div>
        )}
      </DetailPanel>

      {/* Taslak üretici drawer (3 varyant) */}
      <Drawer
        open={draftOpen}
        onClose={() => setDraftOpen(false)}
        title="Taslak üretici"
        width={780}
      >
        {draftCand && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Badge variant={ACTION_META[draftAction]?.variant ?? "muted"} size="sm">
                {ACTION_META[draftAction]?.label ?? draftAction}
              </Badge>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                @{draftCand.accountHandle} için 3 alternatif
              </span>
            </div>

            <div
              style={{
                background: "var(--bg-sunken)",
                border: "1px solid var(--border-faint)",
                borderRadius: "var(--radius-md)",
                padding: "10px 12px",
              }}
            >
              <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 4 }}>
                Kaynak gönderi
              </div>
              <p style={{ ...CLAMP_3, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                {draftCand.content}
              </p>
            </div>

            {draftLoading ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-lg)",
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <Skeleton width={90} height={12} />
                    <Skeleton height={80} />
                    <Skeleton lines={3} />
                  </div>
                ))}
              </div>
            ) : draftBlocked ? (
              <BlockedExternalState
                title="Üretim engelli: OpenRouter kredisi"
                description="Taslak üretimi dış sağlayıcı kredisi gerektiriyor (OpenRouter 402). Radar listesi ve karar aksiyonları çalışmaya devam eder."
                detail="Gerekli: OpenRouter kredisi."
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDraftOpen(false);
                      setActiveTab("profile-integrations");
                    }}
                  >
                    Entegrasyonlar
                  </Button>
                }
              />
            ) : draftError ? (
              <ErrorState
                title="Taslaklar üretilemedi"
                description="Üretim tamamlanamadı. Yeniden dene."
                onRetry={() => openDraftGenerator(draftCand)}
              />
            ) : drafts.length === 0 ? (
              <EmptyState compact icon={<Sparkles size={20} strokeWidth={1.8} />} title="Taslak dönmedi" description="Bu kaynak için taslak üretilemedi." />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
                {drafts.map((item) => (
                  <DraftVariantCard
                    key={item.draft.id}
                    item={item}
                    value={editedDrafts[item.draft.id] ?? item.draft.content}
                    onEdit={(v) => setEditedDrafts((prev) => ({ ...prev, [item.draft.id]: v }))}
                    onCopy={() => copyDraft(item)}
                    onQueue={() => queueDraft(item)}
                    queuing={queuingId === item.draft.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

/* ── Alt bileşenler (saf/sunum) ───────────────────────────────────────────── */

function DetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="eyebrow" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function LoadingCards() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            padding: "var(--card-pad)",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-xl)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Skeleton width={36} height={36} />
            <Skeleton width={240} height={14} />
          </div>
          <Skeleton lines={2} />
          <Skeleton height={5} />
        </div>
      ))}
    </div>
  );
}

function DraftVariantCard({
  item,
  value,
  onEdit,
  onCopy,
  onQueue,
  queuing,
}: {
  item: DraftItem;
  value: string;
  onEdit: (v: string) => void;
  onCopy: () => void;
  onQueue: () => void;
  queuing: boolean;
}) {
  const angle = ANGLE_META[item.draft.angle];
  const isEdited = value.trim() !== item.draft.content.trim();
  const critic = item.critic;
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Badge variant={angle?.variant ?? "muted"} size="sm">
            {angle?.label ?? item.draft.angle}
          </Badge>
          {isEdited && (
            <Badge variant="yellow" size="xs">
              düzenlendi
            </Badge>
          )}
        </div>
        <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--accent-text)", fontWeight: 500 }}>
          {Math.round(critic.publishScore)}%
        </span>
      </div>

      {item.draft.reasoning && (
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            lineHeight: 1.5,
            background: "var(--bg-sunken)",
            border: "1px solid var(--border-faint)",
            borderRadius: "var(--radius-sm)",
            padding: "6px 8px",
          }}
        >
          {item.draft.reasoning}
        </p>
      )}

      <Textarea
        value={value}
        onChange={(e) => onEdit(e.target.value)}
        aria-label="Taslak metni"
        charCount={{ current: value.length, max: TWEET_LIMIT }}
        style={{ minHeight: 96 }}
      />

      <ScoreBars
        dense
        rows={[
          { name: "Persona", value: critic.personaMatchScore },
          { name: "Kanca", value: critic.hookStrengthScore },
          { name: "Risk", value: critic.riskScore, invert: true },
        ]}
      />

      {critic.rewriteSuggestion && (
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-xs)",
            color: "var(--status-warn-text)",
            lineHeight: 1.5,
            background: "color-mix(in srgb, var(--status-warn) 8%, var(--bg-sunken))",
            border: "1px solid color-mix(in srgb, var(--status-warn) 24%, transparent)",
            borderRadius: "var(--radius-sm)",
            padding: "6px 8px",
          }}
        >
          Öneri: {critic.rewriteSuggestion}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto" }}>
        <Button size="sm" variant="ghost" iconLeft={<Copy size={13} strokeWidth={2} />} onClick={onCopy}>
          Kopyala
        </Button>
        <Button
          size="sm"
          variant="primary"
          iconLeft={<Send size={13} strokeWidth={2} />}
          loading={queuing}
          onClick={onQueue}
          style={{ marginLeft: "auto" }}
        >
          Kuyruğa At
        </Button>
      </div>
    </div>
  );
}
