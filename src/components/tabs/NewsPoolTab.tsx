"use client";
import { EmptyState, ErrorState } from "@/components/ui";
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
  AlertCircle,
  Flame,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";

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

const ACCOUNTS = ["grafikcem", "maskulenkod"] as const;
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
  multi_source_confirmed: { label: "ÇOKLU KAYNAK", color: "var(--nw-accent-2)" },
  editorial_confirmed: { label: "TEYİTLİ", color: "var(--nw-accent-2)" },
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
function safeHref(url: string): string | undefined {
  try {
    const p = new URL(url).protocol;
    return p === "http:" || p === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

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
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);

  const [sort, setSort] = useState("buzz");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const showToast = (text: string, type: "success" | "error") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

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
      showToast("Güncelleme başarısız.", "error");
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
        showToast(`@${account} için taslak üretildi.`, "success");
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isUsed: true } : n)));
      } else if (data.blocked) {
        showToast(`Engellendi: ${data.reason || "kalite filtresi"}`, "error");
      } else {
        showToast(data.error || "Üretim başarısız.", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sunucu hatası.", "error");
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
          showToast(data.error || "İşleme başarısız.", "error");
          return;
        }
        const remaining = (data.translate?.remaining ?? 0) + (data.analyze?.remaining ?? 0);
        if (remaining <= 0) {
          showToast("Haber havuzu işlendi (çeviri + analiz tamam).", "success");
          return;
        }
        setProcessing(`İşleniyor... ${remaining} kaldı`);
      }
      showToast("Kısmi işlendi — kalanlar için tekrar çalıştırın.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sunucu hatası.", "error");
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

  // Öne çıkan = top buzz (1 büyük + 3). Geri kalanı seçili sıraya göre arşiv.
  const { featured, archive } = useMemo(() => {
    const ranked = [...filtered].sort((a, b) => (b.buzzScore ?? 0) - (a.buzzScore ?? 0));
    const top = ranked.slice(0, 4);
    const topIds = new Set(top.map((n) => n.id));
    return { featured: top, archive: filtered.filter((n) => !topIds.has(n.id)) };
  }, [filtered]);

  const sources = useMemo(() => {
    const names = new Set<string>();
    for (const n of items) if (n.newsSource?.name) names.add(n.newsSource.name);
    return [...names];
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(archive.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = archive.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const usedCount = items.filter((n) => n.isUsed).length;
  const untranslated = items.length - turkish.length;

  return (
    <div className="news-warm" style={{ width: "100%", paddingBottom: 64 }}>
      {toast && <Toast toast={toast} />}

      {/* Sıcak hero bandı — rakip "AI Gündem" tarzı, ortalanmış. */}
      <section className="nw-hero" style={heroBand}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginBottom: 18 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--nw-accent)", boxShadow: "0 0 10px var(--nw-accent)" }} />
          <span className="eyebrow" style={{ fontSize: "var(--text-2xs)", color: "var(--nw-accent-2)", letterSpacing: "0.14em" }}>
            DÜNYANIN CANLI YAPAY ZEKÂ GÜNDEMİ
          </span>
        </div>
        <h1 className="font-display" style={heroTitle}>
          Yapay zekânın nabzı, <em style={{ fontStyle: "italic", color: "var(--nw-accent)" }}>tek ekranda</em>
        </h1>
        <p style={heroSub}>
          En sağlam kaynaklardan en güncel ve en çok konuşulan yapay zekâ haberleri — Türkçe, kaynağıyla.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 4 }}>
          <button onClick={load} style={warmBtn} className="nw-pagebtn">
            <RefreshCw size={15} strokeWidth={2} />
            Gündemi Yenile
          </button>
          <button onClick={processAll} disabled={!!processing} style={ghostBtn} className="nw-pagebtn" title="Operatör: bekleyen haberleri çevir + analiz et">
            {processing ? <Loader2 size={14} strokeWidth={2} className="rise" /> : <Settings2 size={14} strokeWidth={2} />}
            {processing ?? "İşle"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
          <Stat icon={<Newspaper size={13} strokeWidth={2} />} value={turkish.length} label="Türkçe haber" />
          <Stat icon={<CheckCircle2 size={13} strokeWidth={2} />} value={usedCount} label="kullanıldı" />
          {untranslated > 0 && (
            <Stat icon={<Loader2 size={13} strokeWidth={2} />} value={untranslated} label="çevriliyor" muted />
          )}
        </div>
      </section>

      {sources.length > 3 && <SourceMarquee sources={sources} />}

      {/* Kontroller */}
      <div style={controlsRow}>
        <Field label="Sırala"><Select value={sort} onChange={setSort} options={SORTS} /></Field>
        <Field label="Kategori"><Select value={category} onChange={setCategory} options={CATEGORIES} /></Field>
        <Field label="Ara" grow>
          <div style={{ position: "relative", width: "100%" }}>
            <Search size={14} strokeWidth={1.8} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
            <input type="text" placeholder="Haber ara..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, paddingLeft: 30 }} />
          </div>
        </Field>
        <Field label="Durum (operatör)"><Select value={status} onChange={setStatus} options={STATUSES} /></Field>
      </div>

      {loading ? (
        <div style={archiveGrid}>{Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : loadFailed ? (
        <ErrorState
          title="Haberler yüklenemedi"
          description="Haber havuzu şu an alınamıyor. Sorun sürerse Ayarlar → Sistem durumu."
          onRetry={() => void load()}
        />
      ) : filtered.length === 0 ? (
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          <EmptyState
            icon={<Newspaper size={24} strokeWidth={1.8} />}
            title={untranslated > 0 ? "Haberler çevriliyor…" : "Filtreye uygun Türkçe haber yok"}
            description={untranslated > 0
              ? `${untranslated} haber çeviri sırasında. Birazdan 'Yenile'ye basın veya 'İşle' ile çeviriyi hızlandırın.`
              : "Seçili kategori ve aramaya uyan haber bulunamadı. Filtreleri gevşetin."}
            action={<button onClick={processAll} disabled={!!processing} style={warmBtn} className="nw-pagebtn">{processing ?? "Haberleri İşle"}</button>}
          />
        </div>
      ) : (
        <>
          {/* ÖNE ÇIKAN — 1 büyük + 3 öne çıkan kart */}
          {featured.length > 0 && (
            <section style={{ marginBottom: 40 }}>
              <SectionHead label="ÖNE ÇIKAN HABERLER" note={`${archive.length} haber arşivde`} />
              <FeaturedBig item={featured[0]} rank={1} onRead={() => patch(featured[0].id, { isRead: !featured[0].isRead })} />
              {featured.length > 1 && (
                <div style={{ ...featuredRow, marginTop: "var(--space-3)" }}>
                  {featured.slice(1, 4).map((n, i) => (
                    <FeaturedCard key={n.id} item={n} rank={i + 2} onRead={() => patch(n.id, { isRead: !n.isRead })} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ARŞİV — sayfalı grid */}
          {archive.length > 0 && (
            <section>
              <SectionHead label={sort === "buzz" ? "GÜNDEM" : "EN YENİLER"} />
              <div style={archiveGrid}>
                {pageItems.map((n) => (
                  <ArchiveCard
                    key={n.id}
                    item={n}
                    generatingKey={generatingKey}
                    onGenerate={generate}
                    onToggleRead={() => patch(n.id, { isRead: !n.isRead })}
                  />
                ))}
              </div>
              {totalPages > 1 && <Pagination page={safePage} total={totalPages} onChange={setPage} />}
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Stat({ icon, value, label, muted }: { icon: React.ReactNode; value: number; label: string; muted?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", color: muted ? "var(--text-muted)" : "var(--text-secondary)" }}>
      <span style={{ color: muted ? "var(--text-muted)" : "var(--nw-accent-2)" }}>{icon}</span>
      <strong className="tnum" style={{ color: muted ? "var(--text-secondary)" : "var(--text-primary)", fontWeight: 500 }}>{value}</strong>
      {label}
    </span>
  );
}

function SectionHead({ label, note }: { label: string; note?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: "var(--space-3)", borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
      <span className="eyebrow font-display" style={{ fontSize: "var(--text-base)", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "0.01em" }}>{label}</span>
      {note && <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{note}</span>}
    </div>
  );
}

function SourceMarquee({ sources }: { sources: string[] }) {
  const loop = [...sources, ...sources];
  return (
    <div className="news-marquee" style={{ margin: "0 0 var(--space-5)", padding: "11px 0", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
      <div className="news-marquee-track" aria-hidden>
        {loop.map((name, i) => (
          <span key={`${name}-${i}`} style={marqueeItem}>
            <ShieldCheck size={11} strokeWidth={1.8} style={{ color: "var(--nw-accent-2)" }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

// Görsel yoksa sıcak gradient placeholder (kaynak + kategori).
function Thumb({ item, height }: { item: NewsItem; height: number }) {
  if (item.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.imageUrl} alt="" style={{ width: "100%", height, objectFit: "cover", background: "var(--bg-elevated)", display: "block" }} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
    );
  }
  return (
    <div style={{ width: "100%", height, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 4, padding: 14, background: "linear-gradient(135deg, var(--nw-soft), rgba(240,169,58,0.05))", borderBottom: "1px solid var(--border)" }}>
      <Newspaper size={18} strokeWidth={1.6} style={{ color: "var(--nw-accent)", opacity: 0.7 }} />
      <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-secondary)", fontWeight: 500 }}>{item.newsSource?.name ?? catLabel(item.category)}</span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span style={{ position: "absolute", top: 12, left: 12, zIndex: 2, display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 26, height: 22, padding: "0 7px", borderRadius: "var(--radius-sm)", background: "var(--nw-accent)", color: "#1a1208", fontSize: "var(--text-2xs)", fontWeight: 500, fontFamily: "var(--font-display, inherit)" }} className="tnum">
      {String(rank).padStart(2, "0")}
    </span>
  );
}

function FeaturedBig({ item, rank, onRead }: { item: NewsItem; rank: number; onRead: () => void }) {
  const badge = verificationBadge(item.sourceVerification, item.xValueScore ?? 0);
  const buzz = buzzMeta(item.buzzScore);
  return (
    <article className="nw-card" style={{ ...cardBase, display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)", overflow: "hidden", position: "relative" }}>
      <RankBadge rank={rank} />
      <div style={{ position: "relative" }}><Thumb item={item} height={300} /></div>
      <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        <SourceLine item={item} badge={badge} buzz={buzz?.hot ? item.buzzScore : null} />
        <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" className="font-display" style={{ fontSize: "var(--text-2xl, 1.6rem)", fontWeight: 500, color: "var(--text-primary)", textDecoration: "none", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
          {item.trTitle}
        </a>
        {item.trSummary && <p style={summaryStyle(4)}>{item.trSummary}</p>}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: "auto", paddingTop: 6 }}>
          <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" style={readLink}>Kaynak haberi oku <ExternalLink size={12} strokeWidth={2} /></a>
          <button onClick={onRead} style={toggleStyle(item.isRead)}>{item.isRead ? "okundu" : "okunmadı"}</button>
        </div>
      </div>
    </article>
  );
}

function FeaturedCard({ item, rank, onRead }: { item: NewsItem; rank: number; onRead: () => void }) {
  const badge = verificationBadge(item.sourceVerification, item.xValueScore ?? 0);
  const buzz = buzzMeta(item.buzzScore);
  return (
    <article className="nw-card" style={{ ...cardBase, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <RankBadge rank={rank} />
      <Thumb item={item} height={150} />
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
        <SourceLine item={item} badge={badge} buzz={buzz?.hot ? item.buzzScore : null} small />
        <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" className="font-display" style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)", textDecoration: "none", lineHeight: 1.34, letterSpacing: "-0.01em" }}>
          {item.trTitle}
        </a>
        {item.trSummary && <p style={summaryStyle(2)}>{item.trSummary}</p>}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: "auto", paddingTop: 4 }}>
          <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" style={readLink}>Kaynak haberi oku <ExternalLink size={11} strokeWidth={2} /></a>
          <button onClick={onRead} style={toggleStyle(item.isRead)}>{item.isRead ? "okundu" : "okunmadı"}</button>
        </div>
      </div>
    </article>
  );
}

function ArchiveCard({ item, generatingKey, onGenerate, onToggleRead }: {
  item: NewsItem; generatingKey: string | null; onGenerate: (id: string, account: string) => void; onToggleRead: () => void;
}) {
  const badge = verificationBadge(item.sourceVerification, item.xValueScore ?? 0);
  const buzz = buzzMeta(item.buzzScore);
  const showOps = canGenerate(item) && !item.isUsed;
  return (
    <article className="nw-card" style={{ ...cardBase, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Thumb item={item} height={130} />
      <div style={{ padding: "13px 15px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <SourceLine item={item} badge={badge} buzz={buzz?.hot ? item.buzzScore : null} small />
        <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" className="font-display" style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)", textDecoration: "none", lineHeight: 1.36, letterSpacing: "-0.01em" }}>
          {item.trTitle}
        </a>
        {item.trSummary && <p style={summaryStyle(2)}>{item.trSummary}</p>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 9, marginTop: "auto" }}>
          <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" style={readLink}>oku <ExternalLink size={11} strokeWidth={2} /></a>
          {item.isUsed ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-2xs)", color: "var(--green)", fontWeight: 500, marginLeft: 6 }}>
              <CheckCircle2 size={12} strokeWidth={1.8} /> Kullanıldı
            </span>
          ) : showOps ? (
            ACCOUNTS.map((acc) => {
              const busy = generatingKey === `${item.id}-${acc}`;
              return (
                <button key={acc} onClick={() => onGenerate(item.id, acc)} disabled={!!generatingKey} title={`@${acc} için taslak üret`} style={{ ...genBtnStyle, marginLeft: acc === ACCOUNTS[0] ? 6 : 0 }}>
                  {busy ? <Loader2 size={11} strokeWidth={2} className="rise" /> : (<><Sparkles size={11} strokeWidth={2} />{acc}</>)}
                </button>
              );
            })
          ) : null}
          <button onClick={onToggleRead} style={toggleStyle(item.isRead)}>{item.isRead ? "okundu" : "okunmadı"}</button>
        </div>
      </div>
    </article>
  );
}

function SourceLine({ item, badge, buzz, small }: { item: NewsItem; badge: { label: string; color: string } | null; buzz: number | null; small?: boolean }) {
  const fs = small ? "var(--text-2xs)" : "var(--text-xs)";
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {item.newsSource && <span style={{ fontSize: fs, color: "var(--text-secondary)", fontWeight: 500 }}>{item.newsSource.name}</span>}
      {item.newsSource && (
        <span title={`Kaynak güvenilirliği: ${item.newsSource.reliability}`} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--text-2xs)", fontWeight: 500, color: RELIABILITY_COLORS[item.newsSource.reliability] || "var(--text-muted)", border: `1px solid ${RELIABILITY_COLORS[item.newsSource.reliability] || "var(--border)"}`, padding: "0 5px", borderRadius: "var(--radius-sm)", textTransform: "uppercase" }}>
          <ShieldCheck size={10} strokeWidth={1.8} />{item.newsSource.reliability}
        </span>
      )}
      {timeAgo(item.publishedAt) && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
          <Clock size={10} strokeWidth={1.8} />{timeAgo(item.publishedAt)}
        </span>
      )}
      {buzz != null && (
        <span title={`Buzz: ${buzz}`} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--text-2xs)", fontWeight: 500, color: "var(--nw-accent)" }}>
          <Flame size={11} strokeWidth={2} /><span className="tnum">{buzz}</span>
        </span>
      )}
      {badge && (
        <span title="Çapraz kaynak teyidi" style={{ fontSize: "var(--text-2xs)", fontWeight: 500, color: badge.color, border: `1px solid ${badge.color}`, padding: "0 5px", borderRadius: "var(--radius-sm)" }}>{badge.label}</span>
      )}
    </div>
  );
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center", marginTop: 28 }}>
      <button className="nw-pagebtn" disabled={page <= 1} onClick={() => onChange(page - 1)} style={{ ...pageBtn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? "not-allowed" : "pointer" }}>
        <ChevronLeft size={14} strokeWidth={2} /> Önceki
      </button>
      <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", minWidth: 56, textAlign: "center" }}>
        {String(page).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </span>
      <button className="nw-pagebtn" disabled={page >= total} onClick={() => onChange(page + 1)} style={{ ...pageBtn, opacity: page >= total ? 0.4 : 1, cursor: page >= total ? "not-allowed" : "pointer" }}>
        Sonraki <ChevronRight size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const heroBand: React.CSSProperties = { padding: "clamp(34px, 6vw, 56px) 24px clamp(28px, 4vw, 40px)", textAlign: "center", marginBottom: 24, border: "1px solid var(--border)" };
const heroTitle: React.CSSProperties = { fontSize: "clamp(1.9rem, 1rem + 4vw, 3.4rem)", fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.08, letterSpacing: "-0.025em", margin: "0 0 14px" };
const heroSub: React.CSSProperties = { fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55, maxWidth: 540, margin: "0 auto 22px" };

const cardBase: React.CSSProperties = { background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" };
const featuredRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-3)" };
const archiveGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-3)" };

const controlsRow: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: "var(--space-5)", padding: "14px 16px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" };

const marqueeItem: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, padding: "0 18px", fontSize: "var(--text-2xs)", fontWeight: 500, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" };

const readLink: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--text-2xs)", fontWeight: 500, color: "var(--nw-accent-2)", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.03em" };

const warmBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", background: "var(--nw-accent)", border: "1px solid var(--nw-accent)", color: "#1a1208", borderRadius: 999, fontSize: "var(--text-xs)", fontWeight: 500, fontFamily: "inherit", cursor: "pointer" };
const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 999, fontSize: "var(--text-xs)", fontWeight: 500, fontFamily: "inherit", cursor: "pointer" };
const pageBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 999, fontSize: "var(--text-xs)", fontWeight: 500, fontFamily: "inherit" };

function summaryStyle(lines: number): React.CSSProperties {
  return { margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties;
}

const inputStyle: React.CSSProperties = { background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", padding: "8px 11px", fontSize: "var(--text-xs)", fontFamily: "inherit", outline: "none", width: "100%" };

const genBtnStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "var(--nw-soft)", border: "1px solid var(--nw-border)", color: "var(--nw-accent-2)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-2xs)", fontWeight: 500, fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.02em", cursor: "pointer" };

function toggleStyle(active: boolean): React.CSSProperties {
  return { padding: "4px 9px", background: active ? "var(--nw-soft)" : "transparent", border: `1px solid ${active ? "var(--nw-border)" : "var(--border)"}`, color: active ? "var(--nw-accent-2)" : "var(--text-muted)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-2xs)", fontFamily: "inherit", cursor: "pointer", marginLeft: "auto" };
}

function Field({ label, grow, children }: { label: string; grow?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: grow ? 1 : undefined, minWidth: grow ? 160 : undefined }}>
      <label className="eyebrow" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: SelectOption[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Toast({ toast }: { toast: { text: string; type: "success" | "error" } }) {
  const ok = toast.type === "success";
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 999, display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 18px", borderRadius: "var(--radius-lg)", fontSize: "var(--text-sm)", fontWeight: 500, background: "var(--bg-elevated)", color: "var(--text-primary)", border: `1px solid ${ok ? "color-mix(in srgb, var(--status-ok) 40%, transparent)" : "color-mix(in srgb, var(--danger) 40%, transparent)"}`, boxShadow: "var(--shadow-lg)" }}>
      {ok ? <CheckCircle2 size={16} strokeWidth={1.8} style={{ color: "var(--green)" }} /> : <AlertCircle size={16} strokeWidth={1.8} style={{ color: "var(--danger)" }} />}
      {toast.text}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div style={{ ...cardBase, overflow: "hidden" }}>
      <div className="rise" style={{ height: 130, background: "var(--bg-base)" }} />
      <div style={{ padding: "13px 15px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="rise" style={{ height: 12, width: "40%", borderRadius: "var(--radius-sm)", background: "var(--bg-base)" }} />
        <div className="rise" style={{ height: 16, width: "90%", borderRadius: "var(--radius-sm)", background: "var(--bg-base)" }} />
        <div className="rise" style={{ height: 14, width: "70%", borderRadius: "var(--radius-sm)", background: "var(--bg-base)" }} />
      </div>
    </div>
  );
}
