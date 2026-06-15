"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Wrench,
  RefreshCw,
  Loader2,
  Star,
  Search as SearchIcon,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Gauge,
  SearchX,
} from "lucide-react";
import { PageHeader, Card, EmptyState, Badge, Skeleton } from "@/components/ui";
import { fetchJson } from "@/lib/utils/safeFetch";

type Tool = {
  id: string;
  title: string;
  url: string;
  resourceType: string;
  category: string;
  platform: string | null;
  useCase: string | null;
  description: string;
  whyUseful: string | null;
  tags: string[];
  xValueScore: number;
  sourceReliability: string;
  contentFormat: string | null;
  linkStatus: string | null;
  lastCheckedAt: string | null;
  isFavorite: boolean;
};

type ListResponse = { success: boolean; items?: Tool[]; error?: string };

const ACCOUNTS = ["grafikcem", "maskulenkod"] as const;

type SelectOption = { value: string; label: string };

const PLATFORM_OPTIONS: SelectOption[] = [
  { value: "all", label: "Tümü" },
  { value: "X", label: "X / Twitter" },
  { value: "IG", label: "Instagram" },
  { value: "YT", label: "YouTube" },
  { value: "genel", label: "Genel" },
];

const RELIABILITY_OPTIONS: SelectOption[] = [
  { value: "all", label: "Tümü" },
  { value: "high", label: "Yüksek" },
  { value: "medium", label: "Orta" },
  { value: "low", label: "Düşük" },
];

const CHECKED_OPTIONS: SelectOption[] = [
  { value: "all", label: "Tümü" },
  { value: "alive", label: "Canlı" },
  { value: "dead", label: "Ölü" },
  { value: "unknown", label: "Bilinmiyor" },
];

const reliabilityColor = (r: string) =>
  r === "high" ? "var(--green)" : r === "medium" ? "var(--yellow)" : "var(--danger)";

const linkColor = (s: string | null) =>
  s === "alive" ? "var(--green)" : s === "dead" ? "var(--danger)" : "var(--text-muted)";

function uniqueOptions(items: Tool[], pick: (t: Tool) => string | null): SelectOption[] {
  const set = new Set<string>();
  items.forEach((t) => {
    const v = pick(t);
    if (v) set.add(v);
  });
  return [{ value: "all", label: "Tümü" }, ...Array.from(set).sort().map((v) => ({ value: v, label: v }))];
}

export default function ToolboxTab() {
  const [allItems, setAllItems] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [favKey, setFavKey] = useState<string | null>(null);

  const [category, setCategory] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [useCase, setUseCase] = useState("all");
  const [format, setFormat] = useState("all");
  const [reliability, setReliability] = useState("all");
  const [checked, setChecked] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [search, setSearch] = useState("");

  const showToast = (text: string, type: "success" | "error") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Small dataset (~hundreds of rows): fetch the whole active set once and
  // filter in-memory, so the derived dropdown option lists stay complete and
  // stable regardless of the active filters.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<ListResponse>("/api/toolbox?limit=300");
      if (data.success && data.items) setAllItems(data.items);
      else showToast(data.error || "Kaynaklar alınamadı.", "error");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sunucu hatası.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categoryTabs = useMemo<SelectOption[]>(() => {
    const set = new Set<string>();
    allItems.forEach((t) => t.category && set.add(t.category));
    return [{ value: "all", label: "Tümü" }, ...Array.from(set).sort().map((c) => ({ value: c, label: c }))];
  }, [allItems]);

  const useCaseOptions = useMemo(() => uniqueOptions(allItems, (t) => t.useCase), [allItems]);
  const formatOptions = useMemo(() => uniqueOptions(allItems, (t) => t.contentFormat), [allItems]);

  const liveCount = useMemo(() => {
    let alive = 0;
    let dead = 0;
    allItems.forEach((t) => {
      if (t.linkStatus === "alive") alive++;
      else if (t.linkStatus === "dead") dead++;
    });
    return { alive, dead };
  }, [allItems]);

  const filtered = allItems.filter((t) => {
    if (category !== "all" && t.category !== category) return false;
    if (platform !== "all" && t.platform !== platform) return false;
    if (useCase !== "all" && t.useCase !== useCase) return false;
    if (format !== "all" && t.contentFormat !== format) return false;
    if (reliability !== "all" && t.sourceReliability !== reliability) return false;
    if (checked !== "all" && (t.linkStatus ?? "unknown") !== checked) return false;
    if (favoritesOnly && !t.isFavorite) return false;
    if (search) {
      const s = search.toLocaleLowerCase("tr-TR");
      const hay = [t.title, t.description, t.useCase, t.platform, ...t.tags]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  const refresh = async () => {
    setRefreshing(true);
    try {
      const data = await fetchJson<{ success: boolean; alive?: number; dead?: number; error?: string }>(
        "/api/toolbox/refresh",
        { method: "POST" }
      );
      if (data.success) {
        showToast(`Bağlantılar kontrol edildi: ${data.alive ?? 0} canlı / ${data.dead ?? 0} ölü.`, "success");
        await load();
      } else {
        showToast(data.error || "Yenileme başarısız.", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sunucu hatası.", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const toggleFavorite = async (id: string) => {
    setFavKey(id);
    try {
      const data = await fetchJson<{ success: boolean; isFavorite?: boolean }>(`/api/toolbox/${id}/favorite`, {
        method: "POST",
      });
      if (data.success) {
        setAllItems((prev) => prev.map((t) => (t.id === id ? { ...t, isFavorite: data.isFavorite ?? !t.isFavorite } : t)));
      } else {
        showToast("Favori güncellenemedi.", "error");
      }
    } catch {
      showToast("Favori güncellenemedi.", "error");
    } finally {
      setFavKey(null);
    }
  };

  const generate = async (id: string, account: string) => {
    setGeneratingKey(`${id}-${account}`);
    try {
      const data = await fetchJson<{ success: boolean; blocked?: boolean; reason?: string; error?: string }>(
        `/api/toolbox/${id}/generate-idea`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account }),
        }
      );
      if (data.success) {
        showToast(`@${account} için içerik fikri kuyruğa eklendi.`, "success");
      } else if (data.blocked) {
        showToast(`Engellendi: ${data.reason || "kalite/bütçe filtresi"}`, "error");
      } else {
        showToast(data.error || "Üretim başarısız.", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sunucu hatası.", "error");
    } finally {
      setGeneratingKey(null);
    }
  };

  return (
    <div style={{ width: "100%", paddingBottom: 60 }}>
      {toast && <Toast toast={toast} />}

      {/* Top bar: editöryal manşet + canlı veri künyesi + yenile aksiyonu */}
      <PageHeader
        eyebrow="ARAÇ KUTUSU"
        title="Toolbox"
        subtitle="İçerik üretimini besleyen araç ve kaynaklar — filtrele, doğrula, hesaplara fikir kuyruğu aç."
        actions={
          <button onClick={refresh} disabled={refreshing} style={refreshBtnStyle}>
            {refreshing ? <Loader2 size={15} strokeWidth={2} style={{ animation: "spin 0.6s linear infinite" }} /> : <RefreshCw size={15} strokeWidth={2} />}
            {refreshing ? "Kontrol ediliyor…" : "Yenile"}
          </button>
        }
        meta={
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: liveCount.alive > 0 ? "var(--green)" : "var(--text-muted)",
                  boxShadow: liveCount.alive > 0 ? "0 0 0 3px color-mix(in srgb, var(--green) 22%, transparent)" : undefined,
                }}
              />
              <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Canlı veri bağlantısı</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--green)", fontWeight: 600 }}>
              <CheckCircle2 size={14} strokeWidth={2} />
              <span className="tnum">{liveCount.alive}</span> canlı
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--danger)", fontWeight: 600 }}>
              <XCircle size={14} strokeWidth={2} />
              <span className="tnum">{liveCount.dead}</span> ölü
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
              <Wrench size={14} strokeWidth={2} />
              <span className="tnum">{filtered.length}</span> araç / kaynak
            </span>
          </>
        }
      />

      {/* Category shortcut tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {categoryTabs.map((c) => (
          <button key={c.value} onClick={() => setCategory(c.value)} style={tabStyle(category === c.value)}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Advanced filters — rafine kontrol şeridi */}
      <div style={{ background: "var(--gradient-surface), var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "var(--space-3)", marginBottom: "var(--space-4)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", boxShadow: "var(--highlight-top)" }}>
        <Field label="Platform">
          <Select value={platform} onChange={setPlatform} options={PLATFORM_OPTIONS} />
        </Field>
        <Field label="Kullanım Amacı">
          <Select value={useCase} onChange={setUseCase} options={useCaseOptions} />
        </Field>
        <Field label="İçerik Formatı">
          <Select value={format} onChange={setFormat} options={formatOptions} />
        </Field>
        <Field label="Güven Skoru">
          <Select value={reliability} onChange={setReliability} options={RELIABILITY_OPTIONS} />
        </Field>
        <Field label="Son Kontrol">
          <Select value={checked} onChange={setChecked} options={CHECKED_OPTIONS} />
        </Field>
        <Field label="Arama" grow>
          <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
            <SearchIcon size={14} strokeWidth={2} style={{ position: "absolute", left: 9, color: "var(--text-muted)", pointerEvents: "none" }} />
            <input type="text" placeholder="Araç ara..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, paddingLeft: 28 }} />
          </div>
        </Field>
        <button onClick={() => setFavoritesOnly((v) => !v)} style={favToggleStyle(favoritesOnly)}>
          <Star size={13} strokeWidth={2} fill={favoritesOnly ? "currentColor" : "none"} />
          Sadece Favoriler
        </button>
      </div>

      {loading ? (
        <ToolboxSkeletonGrid />
      ) : filtered.length === 0 ? (
        <Card variant="quiet" padded={false}>
          <EmptyState
            icon={<SearchX size={24} strokeWidth={1.8} />}
            title="Filtreye uygun kaynak yok"
            description="Aktif filtreler hiçbir araçla eşleşmedi. Filtreleri gevşet ya da yeni kaynak doğrulamak için bağlantıları yenile."
            action={
              <button onClick={refresh} disabled={refreshing} style={refreshBtnStyle}>
                {refreshing ? <Loader2 size={15} strokeWidth={2} style={{ animation: "spin 0.6s linear infinite" }} /> : <RefreshCw size={15} strokeWidth={2} />}
                {refreshing ? "Kontrol ediliyor…" : "Bağlantıları yenile"}
              </button>
            }
          />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-3)" }}>
          {filtered.map((t) => (
            <Card key={t.id} interactive style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                <a
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "flex-start", gap: 6, fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-primary)", textDecoration: "none", lineHeight: 1.4, letterSpacing: "-0.01em" }}
                >
                  {t.title}
                  <ExternalLink size={13} strokeWidth={2} style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: 2 }} />
                </a>
                <button
                  onClick={() => toggleFavorite(t.id)}
                  disabled={favKey === t.id}
                  title={t.isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}
                  style={{ background: "none", border: "none", cursor: favKey === t.id ? "wait" : "pointer", color: t.isFavorite ? "var(--accent-text)" : "var(--text-muted)", padding: 0, lineHeight: 1, display: "inline-flex", flexShrink: 0, transition: "color 0.15s var(--ease-out)" }}
                >
                  <Star size={15} strokeWidth={2} fill={t.isFavorite ? "currentColor" : "none"} />
                </button>
              </div>

              {t.description && (
                <div>
                  <Kicker>Bu kaynak ne?</Kicker>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>{t.description}</div>
                </div>
              )}

              {t.useCase && (
                <div>
                  <Kicker>Bundan ne üretebilirim?</Kicker>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--accent-text)", background: "var(--gradient-accent), var(--accent-dark)", padding: "3px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--accent-border)" }}>
                    <Sparkles size={12} strokeWidth={2} />
                    {t.useCase}
                  </span>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: "auto" }}>
                <Badge variant="muted" size="xs">{t.category}</Badge>
                {t.platform && <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{t.platform}</span>}
                <span title={`Güven: ${t.sourceReliability}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-2xs)", fontWeight: 700, color: reliabilityColor(t.sourceReliability) }}>
                  <ShieldCheck size={13} strokeWidth={2} />
                  {t.sourceReliability}
                </span>
                <span title={`Bağlantı: ${t.linkStatus ?? "bilinmiyor"}`} style={{ width: 7, height: 7, borderRadius: "50%", background: linkColor(t.linkStatus), boxShadow: `0 0 0 3px color-mix(in srgb, ${linkColor(t.linkStatus)} 20%, transparent)` }} />
                {t.xValueScore > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-2xs)", fontWeight: 700, color: "var(--accent-text)", marginLeft: "auto" }}>
                    <Gauge size={13} strokeWidth={2} />
                    DEĞER <span className="tnum">{t.xValueScore}</span>
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ACCOUNTS.map((acc) => {
                  const busy = generatingKey === `${t.id}-${acc}`;
                  return (
                    <button key={acc} onClick={() => generate(t.id, acc)} disabled={!!generatingKey} style={genBtnStyle}>
                      {busy ? <Loader2 size={12} strokeWidth={2} className="spin" /> : <Sparkles size={12} strokeWidth={2} />}
                      {busy ? "…" : `Fikir → ${acc}`}
                    </button>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-primary)",
  padding: "5px 8px",
  fontSize: "var(--text-xs)",
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
};

const refreshBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-secondary)",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
  height: 32,
  transition: "background 0.15s var(--ease-out), border-color 0.15s",
};

const genBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  padding: "5px 8px",
  background: "var(--gradient-accent), var(--accent-dark)",
  border: "1px solid var(--accent-border)",
  color: "var(--accent-text)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--text-2xs)",
  fontWeight: 700,
  fontFamily: "inherit",
  cursor: "pointer",
  flex: 1,
  transition: "border-color 0.15s var(--ease-out)",
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 12px",
    background: active ? "var(--gradient-accent), var(--accent-dark)" : "transparent",
    border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
    borderRadius: "var(--radius-md)",
    fontSize: "var(--text-xs)",
    fontWeight: active ? 700 : 500,
    fontFamily: "inherit",
    cursor: "pointer",
    textTransform: "capitalize",
    transition: "background 0.15s var(--ease-out), border-color 0.15s, color 0.15s",
  };
}

function favToggleStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    background: active ? "var(--gradient-accent), var(--accent-dark)" : "transparent",
    border: `1px solid ${active ? "var(--accent-border)" : "var(--border-strong)"}`,
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
    borderRadius: "var(--radius-md)",
    fontSize: "var(--text-xs)",
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
    height: 30,
    transition: "background 0.15s var(--ease-out), border-color 0.15s, color 0.15s",
  };
}

function Field({ label, grow, children }: { label: string; grow?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: grow ? 1 : undefined, minWidth: grow ? 150 : undefined }}>
      <label className="eyebrow" style={{ color: "var(--text-muted)" }}>{label}</label>
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

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="eyebrow" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginBottom: 4 }}>
      {children}
    </div>
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
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 18px",
        borderRadius: "var(--radius-lg)",
        fontSize: "var(--text-sm)",
        fontWeight: 600,
        background: "var(--gradient-surface), var(--bg-elevated)",
        border: `1px solid ${ok ? "var(--green)" : "var(--danger)"}`,
        color: ok ? "var(--green)" : "var(--danger)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      {ok ? <CheckCircle2 size={16} strokeWidth={2} /> : <XCircle size={16} strokeWidth={2} />}
      <span style={{ color: "var(--text-primary)" }}>{toast.text}</span>
    </div>
  );
}

function ToolboxSkeletonGrid() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-3)" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton width="70%" height={14} />
          <Skeleton height={36} />
          <Skeleton width="45%" height={20} />
          <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
            <Skeleton width="48%" height={26} />
            <Skeleton width="48%" height={26} />
          </div>
        </Card>
      ))}
    </div>
  );
}
