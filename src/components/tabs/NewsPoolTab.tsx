"use client";
import { PageHeader, Card, Badge, EmptyState, Button } from "@/components/ui";
import {
  RefreshCw,
  Settings2,
  Search,
  Newspaper,
  Target,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Loader2,
  Clock,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

import { useState, useEffect, useCallback } from "react";
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

/** Drafts may only be generated from fully translated + scored news. */
export function canGenerate(item: Pick<NewsItem, "processingStatus">): boolean {
  return item.processingStatus === "analyzed";
}

const scoreColor = (s: number) => (s >= 75 ? "var(--green)" : s >= 50 ? "var(--yellow)" : "var(--danger)");

const RELIABILITY_COLORS: Record<string, string> = {
  high: "var(--green)",
  medium: "var(--yellow)",
  low: "var(--danger)",
};

// Cross-source corroboration badge. "TEK KAYNAK" only matters on items the
// operator might actually publish (score >= 70) — see verificationBadge().
const VERIFICATION_BADGES: Record<string, { label: string; color: string }> = {
  multi_source_confirmed: { label: "ÇOKLU KAYNAK", color: "var(--accent)" },
  editorial_confirmed: { label: "TEYİTLİ", color: "var(--accent)" },
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

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}sa önce`;
  return `${Math.floor(hours / 24)}g önce`;
}

export default function NewsPoolTab() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);

  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  const showToast = (text: string, type: "success" | "error") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: "100", compact: "true" });
      if (status !== "all") q.set("status", status);
      if (category !== "all") q.set("category", category);
      const data = await fetchJson<NewsResponse>(`/api/news-pool?${q.toString()}`);
      if (data.success && data.items) setItems(data.items);
      else showToast(data.error || "Haberler alınamadı.", "error");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sunucu hatası.", "error");
    } finally {
      setLoading(false);
    }
  }, [status, category]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, body: Record<string, boolean>) => {
    try {
      const data = await fetchJson<{ success: boolean }>(`/api/news-pool/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (data.success) {
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, ...body } : n)));
      }
    } catch {
      showToast("Güncelleme başarısız.", "error");
    }
  };

  const generate = async (id: string, account: string) => {
    setGeneratingKey(`${id}-${account}`);
    try {
      const data = await fetchJson<{ success: boolean; blocked?: boolean; reason?: string; error?: string }>(
        `/api/news-pool/${id}/generate-draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account }),
        }
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

  // Drain the raw → translated → analyzed backlog. Each POST is one budgeted
  // pass; loop until the server reports nothing left (max 5 rounds).
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

  const filtered = items.filter((n) => {
    if (!search) return true;
    const s = search.toLocaleLowerCase("tr-TR");
    return [n.trTitle, n.originalTitle, n.trSummary, n.tweetAngle]
      .filter(Boolean)
      .some((v) => (v as string).toLocaleLowerCase("tr-TR").includes(s));
  });

  const usedCount = items.filter((n) => n.isUsed).length;

  return (
    <div style={{ width: "100%", paddingBottom: 60 }}>
      {toast && <Toast toast={toast} />}

      <PageHeader
        eyebrow="KAYNAK"
        title="Haber Havuzu"
        subtitle="Çeviri ve skorlama sonrası taslağa hazır haber akışı — skor, kategori ve duruma göre süzülür."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={load} iconLeft={<RefreshCw size={15} strokeWidth={1.8} />}>
              Yenile
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={processAll}
              disabled={!!processing}
              loading={!!processing}
              title="Bekleyen haberleri çevir + analiz et (skorla)"
              iconLeft={processing ? undefined : <Settings2 size={15} strokeWidth={1.8} />}
            >
              {processing ?? "Tümünü İşle"}
            </Button>
          </>
        }
        meta={
          <>
            <span style={metaStat}>
              <Newspaper size={14} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />
              <strong className="tnum" style={metaNum}>{filtered.length}</strong> haber
            </span>
            <span style={metaStat}>
              <CheckCircle2 size={14} strokeWidth={1.8} style={{ color: "var(--green)" }} />
              <strong className="tnum" style={metaNum}>{usedCount}</strong> kullanıldı
            </span>
          </>
        }
      />

      {/* Filters */}
      <Card
        variant="feature"
        padded={false}
        style={{ marginBottom: "var(--space-5)" }}
      >
        <div style={{ padding: "14px 16px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Durum">
            <Select value={status} onChange={setStatus} options={STATUSES} />
          </Field>
          <Field label="Kategori">
            <Select value={category} onChange={setCategory} options={CATEGORIES} />
          </Field>
          <Field label="Arama" grow>
            <div style={{ position: "relative", width: "100%" }}>
              <Search
                size={14}
                strokeWidth={1.8}
                style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}
              />
              <input
                type="text"
                placeholder="Başlık veya açı ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 28 }}
              />
            </div>
          </Field>
        </div>
      </Card>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--space-3)" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card variant="feature" padded={false}>
          <EmptyState
            icon={<Newspaper size={24} strokeWidth={1.8} />}
            title="Filtreye uygun haber yok"
            description="Seçili durum, kategori ve aramaya uyan haber bulunamadı. Filtreleri gevşetin veya yeni havuz çekmek için yeniden işleyin."
            action={
              <Button variant="primary" size="sm" onClick={processAll} disabled={!!processing} loading={!!processing} iconLeft={processing ? undefined : <Settings2 size={15} strokeWidth={1.8} />}>
                {processing ?? "Tümünü İşle"}
              </Button>
            }
          />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--space-3)" }}>
          {filtered.map((n) => {
            const score = n.xValueScore ?? n.viralScore ?? 0;
            return (
              <Card
                key={n.id}
                variant={n.isUsed ? "feature" : "default"}
                padded={false}
                style={{ display: "flex", flexDirection: "column", gap: 0, overflow: "hidden" }}
              >
                {n.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={n.imageUrl}
                    alt=""
                    style={{ width: "100%", height: 132, objectFit: "cover", background: "var(--bg-elevated)" }}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <Badge variant="blue" size="xs">{n.category}</Badge>
                      <span className="eyebrow" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{n.processingStatus}</span>
                    </div>
                    <span
                      className="font-display tnum"
                      style={{ fontSize: "var(--text-lg)", fontWeight: 500, color: scoreColor(score), letterSpacing: "-0.02em", lineHeight: 1 }}
                      title={`X-değer skoru: ${score}`}
                    >
                      {score}
                    </span>
                  </div>

                  {n.newsSource && (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-secondary)", fontWeight: 500 }}>{n.newsSource.name}</span>
                      <span
                        title={`Kaynak güvenilirliği: ${n.newsSource.reliability}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--text-2xs)", fontWeight: 500, color: RELIABILITY_COLORS[n.newsSource.reliability] || "var(--text-muted)", border: `1px solid ${RELIABILITY_COLORS[n.newsSource.reliability] || "var(--border)"}`, padding: "0 5px", borderRadius: "var(--radius-sm)", textTransform: "uppercase" }}
                      >
                        <ShieldCheck size={11} strokeWidth={1.8} />
                        {n.newsSource.reliability}
                      </span>
                      {timeAgo(n.publishedAt) && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                          <Clock size={11} strokeWidth={1.8} />
                          {timeAgo(n.publishedAt)}
                        </span>
                      )}
                      {(() => {
                        const badge = verificationBadge(n.sourceVerification, score);
                        if (!badge) return null;
                        return (
                          <span
                            title="Çapraz kaynak teyidi"
                            style={{ fontSize: "var(--text-2xs)", fontWeight: 500, color: badge.color, border: `1px solid ${badge.color}`, padding: "0 5px", borderRadius: "var(--radius-sm)" }}
                          >
                            {badge.label}
                          </span>
                        );
                      })()}
                    </div>
                  )}

                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-display"
                    style={{ display: "inline-flex", alignItems: "flex-start", gap: 6, fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)", textDecoration: "none", lineHeight: 1.4, letterSpacing: "-0.01em" }}
                  >
                    <span>{n.trTitle || n.originalTitle}</span>
                    <ExternalLink size={13} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 3, color: "var(--text-muted)" }} />
                  </a>
                  {n.tweetAngle && (
                    <div style={{ display: "flex", gap: 6, fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                      <Target size={13} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 2, color: "var(--accent-text)" }} />
                      <span>{n.tweetAngle}</span>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: "auto" }}>
                    {n.isUsed ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-2xs)", color: "var(--green)", fontWeight: 500 }}>
                        <CheckCircle2 size={13} strokeWidth={1.8} />
                        Kullanıldı
                      </span>
                    ) : (
                      ACCOUNTS.map((acc) => {
                        const busy = generatingKey === `${n.id}-${acc}`;
                        const enabled = canGenerate(n);
                        return (
                          <button
                            key={acc}
                            onClick={() => generate(n.id, acc)}
                            disabled={!!generatingKey || !enabled}
                            title={enabled ? undefined : "Önce çeviri + analiz tamamlanmalı ('Tümünü İşle')"}
                            style={enabled ? genBtnStyle : { ...genBtnStyle, opacity: 0.35, cursor: "not-allowed" }}
                          >
                            {busy ? (
                              <Loader2 size={12} strokeWidth={2} className="rise" />
                            ) : (
                              <>
                                <Sparkles size={12} strokeWidth={2} />
                                {acc}
                              </>
                            )}
                          </button>
                        );
                      })
                    )}
                    <button onClick={() => patch(n.id, { isRead: !n.isRead })} style={toggleStyle(n.isRead)}>
                      {n.isRead ? "okundu" : "okunmadı"}
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const metaStat: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const metaNum: React.CSSProperties = {
  color: "var(--text-primary)",
  fontWeight: 500,
  fontSize: "var(--text-base)",
};

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-primary)",
  padding: "7px 10px",
  fontSize: "var(--text-xs)",
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
};

const genBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "5px 9px",
  background: "var(--accent-dark)",
  border: "1px solid var(--accent-border)",
  color: "var(--accent-text)",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--text-2xs)",
  fontWeight: 500,
  fontFamily: "inherit",
  textTransform: "uppercase",
  letterSpacing: "0.02em",
  cursor: "pointer",
};

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 9px",
    background: active ? "var(--accent-dark)" : "transparent",
    border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
    color: active ? "var(--accent-text)" : "var(--text-muted)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--text-2xs)",
    fontFamily: "inherit",
    cursor: "pointer",
    marginLeft: "auto",
  };
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
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Toast({ toast }: { toast: { text: string; type: "success" | "error" } }) {
  const ok = toast.type === "success";
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 999,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 18px",
        borderRadius: "var(--radius-lg)",
        fontSize: "var(--text-sm)",
        fontWeight: 500,
        background: "var(--bg-elevated)",
        color: "var(--text-primary)",
        border: `1px solid ${ok ? "rgba(63,178,127,0.4)" : "rgba(229,72,77,0.4)"}`,
        boxShadow: "var(--shadow-lg)",
      }}
    >
      {ok ? (
        <CheckCircle2 size={16} strokeWidth={1.8} style={{ color: "var(--green)" }} />
      ) : (
        <AlertCircle size={16} strokeWidth={1.8} style={{ color: "var(--danger)" }} />
      )}
      {toast.text}
    </div>
  );
}

/** İskelet kart — yükleme sırasında havuz akışının yerini tutar. */
function CardSkeleton() {
  return (
    <Card variant="default" padded={false} style={{ overflow: "hidden" }}>
      <div className="rise" style={{ height: 132, background: "var(--bg-elevated)" }} />
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="rise" style={{ height: 12, width: "40%", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)" }} />
        <div className="rise" style={{ height: 16, width: "90%", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)" }} />
        <div className="rise" style={{ height: 14, width: "70%", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)" }} />
      </div>
    </Card>
  );
}
