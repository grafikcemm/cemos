"use client";

import { useState, useEffect, useCallback } from "react";
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
  ChevronRight,
} from "lucide-react";
import { PageHeader, Card, EmptyState, Badge, Skeleton } from "@/components/ui";
import { fetchJson } from "@/lib/utils/safeFetch";
import { TOOLBOX_BUCKETS } from "@/lib/toolbox/buckets";

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
type CountsResponse = {
  success: boolean;
  buckets?: { key: string; label: string; count: number }[];
  total?: number;
  favoritesCount?: number;
  error?: string;
};

const ACCOUNTS = ["grafikcem", "maskulenkod"] as const;

const reliabilityColor = (r: string) =>
  r === "high" ? "var(--green)" : r === "medium" ? "var(--yellow)" : "var(--danger)";

const linkColor = (s: string | null) =>
  s === "alive" ? "var(--green)" : s === "dead" ? "var(--danger)" : "var(--text-muted)";

export default function ToolboxTab() {
  // Bucketed/lazy model: counts load up front (cheap aggregate), each bucket's
  // rows load only when its accordion is expanded. Search and favorites are
  // flat overlays that bypass the buckets. This keeps the page off a 254-row
  // fetch on mount — the prior cause of the connection-pool 500.
  const [counts, setCounts] = useState<CountsResponse | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(true);

  const [bucketItems, setBucketItems] = useState<Record<string, Tool[]>>({});
  const [openBuckets, setOpenBuckets] = useState<Record<string, boolean>>({});
  const [loadingBucket, setLoadingBucket] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Tool[]>([]);
  const [searching, setSearching] = useState(false);

  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favItems, setFavItems] = useState<Tool[]>([]);
  const [favLoading, setFavLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [favKey, setFavKey] = useState<string | null>(null);

  const showToast = (text: string, type: "success" | "error") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const data = await fetchJson<CountsResponse>("/api/toolbox?counts=1");
      if (data.success) setCounts(data);
      else showToast(data.error || "Sayımlar alınamadı.", "error");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sunucu hatası.", "error");
    } finally {
      setLoadingCounts(false);
    }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // Debounce the search box so each keystroke doesn't fire a query.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    fetchJson<ListResponse>(`/api/toolbox?search=${encodeURIComponent(debouncedSearch)}&limit=100`)
      .then((data) => {
        if (cancelled) return;
        if (data.success && data.items) setSearchResults(data.items);
        else showToast(data.error || "Arama başarısız.", "error");
      })
      .catch((err) => {
        if (!cancelled) showToast(err instanceof Error ? err.message : "Sunucu hatası.", "error");
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const loadBucket = useCallback(async (key: string) => {
    setLoadingBucket(key);
    try {
      const data = await fetchJson<ListResponse>(`/api/toolbox?bucket=${key}&limit=200`);
      if (data.success && data.items) {
        setBucketItems((prev) => ({ ...prev, [key]: data.items! }));
      } else {
        showToast(data.error || "Grup yüklenemedi.", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sunucu hatası.", "error");
    } finally {
      setLoadingBucket(null);
    }
  }, []);

  const toggleBucket = (key: string) => {
    const willOpen = !openBuckets[key];
    setOpenBuckets((prev) => ({ ...prev, [key]: willOpen }));
    if (willOpen && !bucketItems[key]) loadBucket(key);
  };

  const toggleFavoritesView = async () => {
    const next = !favoritesOnly;
    setFavoritesOnly(next);
    if (next) {
      setFavLoading(true);
      try {
        const data = await fetchJson<ListResponse>("/api/toolbox?favorite=true&limit=300");
        if (data.success && data.items) setFavItems(data.items);
        else showToast(data.error || "Favoriler alınamadı.", "error");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Sunucu hatası.", "error");
      } finally {
        setFavLoading(false);
      }
    }
  };

  const applyFavoriteToggle = (id: string, isFavorite: boolean) => {
    const patch = (list: Tool[]) => list.map((t) => (t.id === id ? { ...t, isFavorite } : t));
    setBucketItems((prev) => {
      const next: Record<string, Tool[]> = {};
      for (const k of Object.keys(prev)) next[k] = patch(prev[k]);
      return next;
    });
    setSearchResults((prev) => patch(prev));
    setFavItems((prev) =>
      isFavorite ? patch(prev) : prev.filter((t) => t.id !== id)
    );
    setCounts((prev) =>
      prev && typeof prev.favoritesCount === "number"
        ? { ...prev, favoritesCount: Math.max(0, prev.favoritesCount + (isFavorite ? 1 : -1)) }
        : prev
    );
  };

  const toggleFavorite = async (id: string, current: boolean) => {
    setFavKey(id);
    // Optimistic flip, rolled back if the request fails.
    applyFavoriteToggle(id, !current);
    try {
      const data = await fetchJson<{ success: boolean; isFavorite?: boolean }>(
        `/api/toolbox/${id}/favorite`,
        { method: "POST" }
      );
      if (!data.success) {
        applyFavoriteToggle(id, current);
        showToast("Favori güncellenemedi.", "error");
      } else if (typeof data.isFavorite === "boolean" && data.isFavorite !== !current) {
        applyFavoriteToggle(id, data.isFavorite);
      }
    } catch {
      applyFavoriteToggle(id, current);
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

  const refresh = async () => {
    setRefreshing(true);
    try {
      const data = await fetchJson<{ success: boolean; alive?: number; dead?: number; error?: string }>(
        "/api/toolbox/refresh",
        { method: "POST" }
      );
      if (data.success) {
        showToast(`Bağlantılar kontrol edildi: ${data.alive ?? 0} canlı / ${data.dead ?? 0} ölü.`, "success");
        // Reload counts + any already-open buckets so link status reflects.
        await loadCounts();
        const openKeys = Object.keys(openBuckets).filter((k) => openBuckets[k]);
        setBucketItems({});
        openKeys.forEach((k) => loadBucket(k));
      } else {
        showToast(data.error || "Yenileme başarısız.", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sunucu hatası.", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const renderCard = (t: Tool) => (
    <ToolCard
      key={t.id}
      tool={t}
      favBusy={favKey === t.id}
      onToggleFavorite={() => toggleFavorite(t.id, t.isFavorite)}
      generatingKey={generatingKey}
      onGenerate={generate}
    />
  );

  const isSearchMode = debouncedSearch.length > 0;
  const total = counts?.total ?? 0;
  const favoritesCount = counts?.favoritesCount ?? 0;

  return (
    <div style={{ width: "100%", paddingBottom: 60 }}>
      {toast && <Toast toast={toast} />}

      <PageHeader
        eyebrow="ARAÇ KUTUSU"
        title="Toolbox"
        subtitle="İçerik üretimini besleyen araç ve kaynaklar — iş grubuna göre aç, ara, hesaplara fikir kuyruğu kur."
        actions={
          <button onClick={refresh} disabled={refreshing} style={refreshBtnStyle}>
            {refreshing ? <Loader2 size={15} strokeWidth={2} style={{ animation: "spin 0.6s linear infinite" }} /> : <RefreshCw size={15} strokeWidth={2} />}
            {refreshing ? "Kontrol ediliyor…" : "Yenile"}
          </button>
        }
        meta={
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
              <Wrench size={14} strokeWidth={2} />
              <span className="tnum">{total}</span> araç / kaynak
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--accent-text)", fontWeight: 600 }}>
              <Star size={14} strokeWidth={2} fill="currentColor" />
              <span className="tnum">{favoritesCount}</span> favori
            </span>
          </>
        }
      />

      {/* Always-visible controls: search + favorites toggle */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-4)" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", flex: 1, minWidth: 200 }}>
          <SearchIcon size={15} strokeWidth={2} style={{ position: "absolute", left: 10, color: "var(--text-muted)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Tüm araçlarda ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 32, height: 36 }}
          />
          {searching && <Loader2 size={14} strokeWidth={2} style={{ position: "absolute", right: 10, color: "var(--text-muted)", animation: "spin 0.6s linear infinite" }} />}
        </div>
        <button onClick={toggleFavoritesView} disabled={isSearchMode} style={favToggleStyle(favoritesOnly && !isSearchMode)}>
          <Star size={13} strokeWidth={2} fill={favoritesOnly && !isSearchMode ? "currentColor" : "none"} />
          Sadece Favoriler
        </button>
      </div>

      {/* Mode 1: search results (flat) */}
      {isSearchMode ? (
        searching && searchResults.length === 0 ? (
          <ToolboxSkeletonGrid />
        ) : searchResults.length === 0 ? (
          <Card variant="quiet" padded={false}>
            <EmptyState
              icon={<SearchX size={24} strokeWidth={1.8} />}
              title="Eşleşen araç yok"
              description={`"${debouncedSearch}" için sonuç bulunamadı. Farklı bir anahtar kelime dene.`}
            />
          </Card>
        ) : (
          <ToolGrid>{searchResults.map(renderCard)}</ToolGrid>
        )
      ) : favoritesOnly ? (
        /* Mode 2: favorites (flat) */
        favLoading ? (
          <ToolboxSkeletonGrid />
        ) : favItems.length === 0 ? (
          <Card variant="quiet" padded={false}>
            <EmptyState
              icon={<Star size={24} strokeWidth={1.8} />}
              title="Henüz favori yok"
              description="Bir grubu açıp araçların yıldızına dokunarak favorilere ekleyebilirsin."
            />
          </Card>
        ) : (
          <ToolGrid>{favItems.map(renderCard)}</ToolGrid>
        )
      ) : (
        /* Mode 3: collapsible buckets (default) */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {loadingCounts
            ? TOOLBOX_BUCKETS.map((b) => (
                <div key={b.key} style={bucketHeaderStyle(false)}>
                  <Skeleton width="40%" height={16} />
                </div>
              ))
            : (counts?.buckets ?? []).map((b) => {
                const open = !!openBuckets[b.key];
                const items = bucketItems[b.key];
                const isLoading = loadingBucket === b.key;
                return (
                  <div key={b.key}>
                    <button onClick={() => toggleBucket(b.key)} style={bucketHeaderStyle(open)} aria-expanded={open}>
                      <ChevronRight
                        size={16}
                        strokeWidth={2.2}
                        style={{ transition: "transform 0.18s var(--ease-out)", transform: open ? "rotate(90deg)" : "none", color: "var(--text-muted)" }}
                      />
                      <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{b.label}</span>
                      <Badge variant="muted" size="xs">{b.count}</Badge>
                    </button>
                    {open && (
                      <div style={{ paddingTop: 12 }}>
                        {isLoading || !items ? (
                          <ToolboxSkeletonGrid />
                        ) : items.length === 0 ? (
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "8px 4px" }}>
                            Bu grupta aktif araç yok.
                          </div>
                        ) : (
                          <ToolGrid>{items.map(renderCard)}</ToolGrid>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
        </div>
      )}
    </div>
  );
}

function ToolCard({
  tool: t,
  favBusy,
  onToggleFavorite,
  generatingKey,
  onGenerate,
}: {
  tool: Tool;
  favBusy: boolean;
  onToggleFavorite: () => void;
  generatingKey: string | null;
  onGenerate: (id: string, account: string) => void;
}) {
  return (
    <Card interactive style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
          onClick={onToggleFavorite}
          disabled={favBusy}
          title={t.isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}
          style={{ background: "none", border: "none", cursor: favBusy ? "wait" : "pointer", color: t.isFavorite ? "var(--accent-text)" : "var(--text-muted)", padding: 0, lineHeight: 1, display: "inline-flex", flexShrink: 0, transition: "color 0.15s var(--ease-out)" }}
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
            <button key={acc} onClick={() => onGenerate(t.id, acc)} disabled={!!generatingKey} style={genBtnStyle}>
              {busy ? <Loader2 size={12} strokeWidth={2} className="spin" /> : <Sparkles size={12} strokeWidth={2} />}
              {busy ? "…" : `Fikir → ${acc}`}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function ToolGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-3)" }}>
      {children}
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

function bucketHeaderStyle(open: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "12px 14px",
    background: open ? "var(--gradient-surface), var(--bg-elevated)" : "var(--bg-elevated)",
    border: `1px solid ${open ? "var(--accent-border)" : "var(--border)"}`,
    borderRadius: "var(--radius-lg)",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
    transition: "border-color 0.15s var(--ease-out), background 0.15s",
    boxShadow: "var(--highlight-top)",
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
    height: 36,
    transition: "background 0.15s var(--ease-out), border-color 0.15s, color 0.15s",
  };
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
