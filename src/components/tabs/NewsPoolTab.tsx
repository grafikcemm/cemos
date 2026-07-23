"use client";
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  PageScaffold,
  Select,
  Skeleton,
  useToast,
} from "@/components/ui";
import { safeExternalHref } from "@/lib/utils/url";
import {
  RefreshCw,
  Settings2,
  Search,
  Newspaper,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Loader2,
  Clock,
  ShieldCheck,
  Flame,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";
import SaveToBoardButton from "@/components/library/SaveToBoardButton";
import { useAccountHandles } from "@/lib/accounts/useAccountHandles";

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
  buzzScore: number | null;
  hnPoints: number | null;
  hnComments: number | null;
  redditScore: number | null;
  whyPeopleCare: string | null;
  tweetAngle: string | null;
  suggestedFormat: string | null;
  sourceVerification: string | null;
  processingStatus: string;
  isRead: boolean;
  isUsed: boolean;
  fetchedAt: string;
  publishedAt: string | null;
  newsSource?: { name: string; sourceType: string; reliability: string; url: string } | null;
};

type NewsResponse = { success: boolean; items?: NewsItem[]; error?: string };
type StageResult = { processed: number; errors: number; remaining: number; deadlineHit?: boolean };
type ProcessResponse = { success: boolean; translate?: StageResult; analyze?: StageResult; error?: string };

const PAGE_SIZE = 12;

type SelectOption = { value: string; label: string };

export const STATUSES: SelectOption[] = [
  { value: "all", label: "Tümü (aktif)" },
  { value: "raw", label: "İşlenmedi" },
  { value: "translated", label: "Çevrildi" },
  { value: "analyzed", label: "Analiz edildi" },
  { value: "low_score", label: "Düşük Skor" },
  { value: "failed", label: "Hatalı" },
  { value: "quarantined", label: "Karantina" },
];

// Values MUST match NewsItem.category in the DB (set from NewsSource.category
// in src/lib/news/sources.ts + the synthetic Hacker News source).
export const CATEGORIES: SelectOption[] = [
  { value: "all", label: "Tümü" },
  { value: "tech_news", label: "Teknoloji/AI" },
  { value: "creative_design", label: "Tasarım" },
  { value: "product_tools", label: "Ürün/Araçlar" },
];

// Reader sort: "çok konuşulan" (buzz) is the default; "en yeni" is recency.
const SORTS: SelectOption[] = [
  { value: "buzz", label: "Çok konuşulan" },
  { value: "recent", label: "En yeni" },
];

/** Drafts may only be generated from fully translated + scored news. */
export function canGenerate(item: Pick<NewsItem, "processingStatus">): boolean {
  return item.processingStatus === "analyzed";
}

const RELIABILITY_COLORS: Record<string, string> = {
  high: "var(--green)",
  medium: "var(--yellow)",
  low: "var(--danger)",
};

const VERIFICATION_BADGES: Record<string, { label: string; color: string }> = {
  multi_source_confirmed: { label: "ÇOKLU KAYNAK", color: "var(--accent-text)" },
  editorial_confirmed: { label: "TEYİTLİ", color: "var(--accent-text)" },
  official_only: { label: "RESMİ KAYNAK", color: "var(--text-secondary)" },
  single_source: { label: "TEK KAYNAK", color: "var(--yellow)" },
};

export function verificationBadge(
  sourceVerification: string | null,
  score: number,
): { label: string; color: string } | null {
  if (!sourceVerification) return null;
  const badge = VERIFICATION_BADGES[sourceVerification];
  if (!badge) return null;
  if (sourceVerification === "single_source" && score < 70) return null;
  return badge;
}

// RSS <link> URL'leri şema-doğrulanmadan DB'ye girer. javascript:/data: href
// React'te tıklamada çalışır → http(s) dışını engelle (güvensiz ise href yok).
function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

function buzzMeta(buzz: number | null): { hot: boolean } | null {
  if (buzz == null) return null;
  return { hot: buzz >= 60 };
}

const CATEGORY_LABELS: Record<string, string> = {
  tech_news: "Teknoloji / AI",
  creative_design: "Tasarım",
  product_tools: "Ürün / Araçlar",
  ai: "Yapay Zekâ",
};
const catLabel = (c: string) => CATEGORY_LABELS[c] ?? c;

export default function NewsPoolTab() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const toast = useToast();

  const [sort, setSort] = useState("buzz");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Batch-C: DB-türetilmiş hesap listesi — tek yerde çağrılır, satıra prop'la
  // geçirilir (satır başına ayrı fetch yerine tek hook çağrısı).
  const accountHandles = useAccountHandles();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const q = new URLSearchParams({ limit: "100", compact: "true", sort });
      if (status !== "all") q.set("status", status);
      if (category !== "all") q.set("category", category);
      const data = await fetchJson<NewsResponse>(`/api/news-pool?${q.toString()}`);
      if (data.success && data.items) setItems(data.items);
      else setLoadFailed(true);
    } catch {
      // HATA ≠ BOŞ (item 5): geçici toast yerine kalıcı, ayrı error state.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [sort, status, category]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset pagination whenever the visible set can change.
  useEffect(() => {
    setPage(1);
  }, [sort, status, category, search]);

  const patch = async (id: string, body: Record<string, boolean>) => {
    try {
      const data = await fetchJson<{ success: boolean }>(`/api/news-pool/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (data.success) setItems((prev) => prev.map((n) => (n.id === id ? { ...n, ...body } : n)));
    } catch {
      toast.error("Güncelleme başarısız.");
    }
  };

  const generate = async (id: string, account: string) => {
    setGeneratingKey(`${id}-${account}`);
    try {
      const data = await fetchJson<{ success: boolean; blocked?: boolean; reason?: string; error?: string }>(
        `/api/news-pool/${id}/generate-draft`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account }) }
      );
      if (data.success) {
        toast.success(`@${account} için taslak üretildi.`);
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isUsed: true } : n)));
      } else if (data.blocked) {
        toast.error(`Engellendi: ${data.reason || "kalite filtresi"}`);
      } else {
        toast.error(data.error || "Üretim başarısız.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sunucu hatası.");
    } finally {
      setGeneratingKey(null);
    }
  };

  const processAll = async () => {
    setProcessing("İşleniyor...");
    try {
      for (let round = 1; round <= 5; round++) {
        const data = await fetchJson<ProcessResponse>("/api/news-pool/process", { method: "POST" });
        if (!data.success) {
          toast.error(data.error || "İşleme başarısız.");
          return;
        }
        const remaining = (data.translate?.remaining ?? 0) + (data.analyze?.remaining ?? 0);
        if (remaining <= 0) {
          toast.success("Haber havuzu işlendi (çeviri + analiz tamam).");
          return;
        }
        setProcessing(`İşleniyor... ${remaining} kaldı`);
      }
      toast.success("Kısmi işlendi — kalanlar için tekrar çalıştırın.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sunucu hatası.");
    } finally {
      setProcessing(null);
      load();
    }
  };

  // Reader feed shows ONLY translated (Turkish) news — English/raw items are
  // hidden until the pipeline translates them (competitor parity).
  const turkish = useMemo(() => items.filter((n) => n.trTitle), [items]);

  const filtered = useMemo(() => {
    if (!search) return turkish;
    const s = search.toLocaleLowerCase("tr-TR");
    return turkish.filter((n) =>
      [n.trTitle, n.trSummary, n.tweetAngle]
        .filter(Boolean)
        .some((v) => (v as string).toLocaleLowerCase("tr-TR").includes(s)),
    );
  }, [turkish, search]);

  // Öne çıkan sinyal = en yüksek buzz'lı tek haber; kalanı yoğun liste.
  const { featured, rest } = useMemo(() => {
    if (filtered.length === 0) return { featured: null as NewsItem | null, rest: [] as NewsItem[] };
    const top = [...filtered].sort((a, b) => (b.buzzScore ?? 0) - (a.buzzScore ?? 0))[0];
    return { featured: top, rest: filtered.filter((n) => n.id !== top.id) };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = rest.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const usedCount = items.filter((n) => n.isUsed).length;
  const untranslated = items.length - turkish.length;

  return (
    <PageScaffold
      header={
        <PageHeader
          title="Haber Havuzu"
          subtitle="En sağlam kaynaklardan en çok konuşulan yapay zekâ haberleri — Türkçe, kaynağıyla."
          size="compact"
          meta={
            <>
              <Stat icon={<Newspaper size={13} strokeWidth={2} />} value={turkish.length} label="Türkçe haber" />
              <Stat icon={<CheckCircle2 size={13} strokeWidth={2} />} value={usedCount} label="kullanıldı" />
              {untranslated > 0 && (
                <Stat icon={<Loader2 size={13} strokeWidth={2} />} value={untranslated} label="çevriliyor" muted />
              )}
            </>
          }
        />
      }
      toolbar={
        <div style={toolbarRow}>
          <Select aria-label="Sırala" value={sort} onChange={(e) => setSort(e.target.value)} options={SORTS} style={ctrlSm} />
          <Select aria-label="Kategori" value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES} style={ctrlSm} />
          <Select
            aria-label="Durum (operatör)"
            title="Durum (operatör)"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={STATUSES}
            style={ctrlSm}
          />
          <div style={{ flex: "1 1 200px", minWidth: 160 }}>
            <Input
              type="text"
              aria-label="Ara"
              placeholder="Haber ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              iconLeft={<Search size={14} strokeWidth={1.8} />}
              style={{ minHeight: "var(--control-h-sm)", padding: "4px 10px 4px 32px", fontSize: "var(--text-xs)" }}
            />
          </div>
          <Button size="sm" variant="ghost" iconLeft={<RefreshCw size={14} strokeWidth={2} />} onClick={load}>
            Gündemi Yenile
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={processAll}
            disabled={!!processing}
            title="Operatör: bekleyen haberleri çevir + analiz et"
            iconLeft={
              processing ? <Loader2 size={14} strokeWidth={2} className="rise" /> : <Settings2 size={14} strokeWidth={2} />
            }
          >
            {processing ?? "İşle"}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div style={listBand}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ ...rowShell, borderTop: i > 0 ? "1px solid var(--border-faint)" : "none" }}>
              <Skeleton width="46%" height={13} />
              <Skeleton width={90} height={10} />
              <Skeleton width={44} height={10} />
            </div>
          ))}
        </div>
      ) : loadFailed ? (
        <ErrorState
          title="Haberler yüklenemedi"
          description="Haber havuzu şu an alınamıyor. Sorun sürerse Ayarlar → Sistem durumu."
          onRetry={() => void load()}
        />
      ) : filtered.length === 0 ? (
        <div style={listBand}>
          <EmptyState
            icon={<Newspaper size={24} strokeWidth={1.8} />}
            title={untranslated > 0 ? "Haberler çevriliyor…" : "Filtreye uygun Türkçe haber yok"}
            description={untranslated > 0
              ? `${untranslated} haber çeviri sırasında. Birazdan 'Yenile'ye basın veya 'İşle' ile çeviriyi hızlandırın.`
              : "Seçili kategori ve aramaya uyan haber bulunamadı. Filtreleri gevşetin."}
            action={
              <Button size="sm" variant="primary" onClick={processAll} disabled={!!processing}>
                {processing ?? "Haberleri İşle"}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {featured && (
            <FeaturedSignal item={featured} onRead={() => patch(featured.id, { isRead: !featured.isRead })} />
          )}

          {rest.length > 0 && (
            <section>
              <div style={listHead}>
                <span className="eyebrow" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                  {sort === "buzz" ? "GÜNDEM" : "EN YENİLER"}
                </span>
                <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                  {rest.length} haber
                </span>
              </div>
              <div style={listBand}>
                {pageItems.map((n, i) => (
                  <NewsRow
                    key={n.id}
                    item={n}
                    divider={i > 0}
                    generatingKey={generatingKey}
                    onGenerate={generate}
                    onToggleRead={() => patch(n.id, { isRead: !n.isRead })}
                    accounts={accountHandles}
                  />
                ))}
              </div>
              {totalPages > 1 && <Pagination page={safePage} total={totalPages} onChange={setPage} />}
            </section>
          )}
        </>
      )}
    </PageScaffold>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Stat({ icon, value, label, muted }: { icon: React.ReactNode; value: number; label: string; muted?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", color: muted ? "var(--text-muted)" : "var(--text-secondary)" }}>
      <span style={{ display: "inline-flex", color: muted ? "var(--text-muted)" : "var(--accent-2-text)" }}>{icon}</span>
      <strong className="tnum" style={{ color: muted ? "var(--text-secondary)" : "var(--text-primary)", fontWeight: 500 }}>{value}</strong>
      {label}
    </span>
  );
}

/** Tek kompakt "öne çıkan sinyal" satırı — en yüksek buzz'lı haber. */
function FeaturedSignal({ item, onRead }: { item: NewsItem; onRead: () => void }) {
  const badge = verificationBadge(item.sourceVerification, item.xValueScore ?? 0);
  return (
    <section aria-label="Öne çıkan sinyal" style={featuredRow}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--accent-2-text)", flexShrink: 0 }}>
        <Flame size={14} strokeWidth={2} />
        <span className="eyebrow" style={{ fontSize: "var(--text-2xs)" }}>ÖNE ÇIKAN</span>
      </span>
      <a href={safeExternalHref(item.url)} target="_blank" rel="noopener noreferrer" style={featuredTitle} title={item.trTitle ?? undefined}>
        {item.trTitle}
      </a>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {item.buzzScore != null && (
          <span className="tnum" title={`Buzz: ${item.buzzScore}`} style={buzzChip(buzzMeta(item.buzzScore)?.hot ?? false)}>
            <Flame size={11} strokeWidth={2} />{item.buzzScore}
          </span>
        )}
        <SourceMeta item={item} />
        {badge && <span title="Çapraz kaynak teyidi" style={badgeChip(badge.color)}>{badge.label}</span>}
        <a href={safeExternalHref(item.url)} target="_blank" rel="noopener noreferrer" style={readLink}>
          Kaynak haberi oku <ExternalLink size={11} strokeWidth={2} />
        </a>
        <button onClick={onRead} style={toggleStyle(item.isRead)}>{item.isRead ? "okundu" : "okunmadı"}</button>
        <SaveToBoardButton source={{ kind: "news", id: item.id }} size="xs" title={item.trTitle ?? undefined} />
      </span>
    </section>
  );
}

/** Yoğun liste satırı — başlık (ellipsis) + kaynak + skor + zaman + aksiyonlar. */
function NewsRow({ item, divider, generatingKey, onGenerate, onToggleRead, accounts }: {
  item: NewsItem; divider: boolean; generatingKey: string | null;
  onGenerate: (id: string, account: string) => void; onToggleRead: () => void;
  /** Batch-C: DB-türetilmiş hesap listesi (bootstrap fallback'li) — tab'dan gelir. */
  accounts: string[];
}) {
  const badge = verificationBadge(item.sourceVerification, item.xValueScore ?? 0);
  const buzz = buzzMeta(item.buzzScore);
  const showOps = canGenerate(item) && !item.isUsed;
  return (
    <article style={{ ...rowShell, borderTop: divider ? "1px solid var(--border-faint)" : "none" }}>
      <a
        href={safeExternalHref(item.url)}
        target="_blank"
        rel="noopener noreferrer"
        title={item.trTitle ?? undefined}
        style={rowTitle}
      >
        {item.trTitle}
      </a>

      <span style={rowMeta}>
        {item.buzzScore != null && (
          <span className="tnum" title={`Buzz: ${item.buzzScore}`} style={buzzChip(buzz?.hot ?? false)}>
            <Flame size={11} strokeWidth={2} />{item.buzzScore}
          </span>
        )}
        <SourceMeta item={item} />
        {badge && <span title="Çapraz kaynak teyidi" style={badgeChip(badge.color)}>{badge.label}</span>}
        {timeAgo(item.publishedAt) && (
          <span style={timeChip}>
            <Clock size={10} strokeWidth={1.8} />{timeAgo(item.publishedAt)}
          </span>
        )}
      </span>

      <span style={rowActions}>
        <a href={safeExternalHref(item.url)} target="_blank" rel="noopener noreferrer" style={readLink} title="Kaynak haberi oku">
          oku <ExternalLink size={11} strokeWidth={2} />
        </a>
        {item.isUsed ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-2xs)", color: "var(--green)", fontWeight: 500 }}>
            <CheckCircle2 size={12} strokeWidth={1.8} /> Kullanıldı
          </span>
        ) : showOps ? (
          accounts.map((acc) => {
            const busy = generatingKey === `${item.id}-${acc}`;
            return (
              <button key={acc} onClick={() => onGenerate(item.id, acc)} disabled={!!generatingKey} title={`@${acc} için taslak üret`} style={genBtnStyle}>
                {busy ? <Loader2 size={11} strokeWidth={2} className="rise" /> : (<><Sparkles size={11} strokeWidth={2} />{acc}</>)}
              </button>
            );
          })
        ) : null}
        <button onClick={onToggleRead} style={toggleStyle(item.isRead)}>{item.isRead ? "okundu" : "okunmadı"}</button>
        <SaveToBoardButton source={{ kind: "news", id: item.id }} size="xs" title={item.trTitle ?? undefined} />
      </span>
    </article>
  );
}

/** Kaynak adı + güvenilirlik rengi (ShieldCheck) — tek kompakt öbek. */
function SourceMeta({ item }: { item: NewsItem }) {
  const name = item.newsSource?.name ?? catLabel(item.category);
  const reliability = item.newsSource?.reliability;
  return (
    <span
      title={reliability ? `Kaynak güvenilirliği: ${reliability}` : undefined}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-2xs)", color: "var(--text-secondary)", fontWeight: 500, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >
      {reliability && (
        <ShieldCheck size={11} strokeWidth={1.8} style={{ flexShrink: 0, color: RELIABILITY_COLORS[reliability] || "var(--text-muted)" }} />
      )}
      {name}
    </span>
  );
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", marginTop: 10 }}>
      <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)} iconLeft={<ChevronLeft size={14} strokeWidth={2} />}>
        Önceki
      </Button>
      <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", minWidth: 48, textAlign: "center" }}>
        {String(page).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </span>
      <Button size="sm" variant="ghost" disabled={page >= total} onClick={() => onChange(page + 1)} iconRight={<ChevronRight size={14} strokeWidth={2} />}>
        Sonraki
      </Button>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const toolbarRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };

const ctrlSm: React.CSSProperties = { minHeight: "var(--control-h-sm)", padding: "4px 8px", fontSize: "var(--text-xs)" };

const featuredRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  minHeight: 48,
  padding: "8px 14px",
  background: "color-mix(in srgb, var(--accent-2) 6%, var(--bg-surface))",
  border: "1px solid color-mix(in srgb, var(--accent-2) 30%, var(--border-faint))",
  borderRadius: "var(--radius-sm)",
};

const featuredTitle: React.CSSProperties = {
  flex: "1 1 240px",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  color: "var(--text-primary)",
  textDecoration: "none",
  letterSpacing: "-0.01em",
};

const listHead: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  padding: "0 2px",
  marginBottom: 8,
};

const listBand: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-faint)",
  borderRadius: "var(--radius-sm)",
  overflow: "hidden",
};

const rowShell: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minHeight: 48,
  padding: "6px 14px",
};

const rowTitle: React.CSSProperties = {
  flex: "1 1 200px",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  color: "var(--text-primary)",
  textDecoration: "none",
  letterSpacing: "-0.01em",
};

const rowMeta: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 };

const rowActions: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 };

const timeChip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--text-2xs)", color: "var(--text-muted)" };

function buzzChip(hot: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: "var(--text-2xs)",
    fontWeight: 500,
    color: hot ? "var(--accent-2-text)" : "var(--text-muted)",
    border: `1px solid ${hot ? "var(--accent-2-border)" : "var(--border-faint)"}`,
    padding: "1px 6px",
    borderRadius: "var(--radius-sm)",
  };
}

function badgeChip(color: string): React.CSSProperties {
  return { fontSize: "var(--text-2xs)", fontWeight: 500, color, border: `1px solid ${color}`, padding: "0 5px", borderRadius: "var(--radius-sm)", whiteSpace: "nowrap" };
}

const readLink: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-2xs)", fontWeight: 500, color: "var(--accent-2-text)", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.03em", whiteSpace: "nowrap" };

const genBtnStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "var(--accent-2-dark)", border: "1px solid var(--accent-2-border)", color: "var(--accent-2-text)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-2xs)", fontWeight: 500, fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.02em", cursor: "pointer" };

function toggleStyle(active: boolean): React.CSSProperties {
  return { padding: "3px 8px", background: active ? "var(--accent-dark)" : "transparent", border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`, color: active ? "var(--accent-text)" : "var(--text-muted)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-2xs)", fontFamily: "inherit", cursor: "pointer" };
}
