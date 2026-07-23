"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Wrench,
  RefreshCw,
  Loader2,
  Star,
  Search as SearchIcon,
  SearchX,
} from "lucide-react";
import {
  PageHeader,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  SubNav,
  Button,
  Input,
  useToast,
} from "@/components/ui";
import { fetchJson } from "@/lib/utils/safeFetch";
import { TOOLBOX_BUCKETS, chipLabel } from "@/lib/toolbox/buckets";
import ToolboxFolderRow, { type FolderItem } from "./toolbox/ToolboxFolderRow";
import ToolboxToolCard from "./toolbox/ToolboxToolCard";
import { type Tool } from "./toolbox/types";
import { useAccountHandles } from "@/lib/accounts/useAccountHandles";

type ListResponse = { success: boolean; items?: Tool[]; error?: string };
type CountsResponse = {
  success: boolean;
  buckets?: { key: string; label: string; count: number }[];
  total?: number;
  favoritesCount?: number;
  error?: string;
};

const FAV_KEY = "__fav";
const ALL = "__all";

export default function ToolboxTab() {
  // Folder model: counts load up front (cheap aggregate); the selected bucket's
  // rows load on demand. AI is the featured default. Multi-category buckets get
  // a SubNav sub-category strip; search + favorites are flat overlays/folders.
  const [counts, setCounts] = useState<CountsResponse | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(true);

  const [bucketItems, setBucketItems] = useState<Record<string, Tool[]>>({});
  const [loadingBucket, setLoadingBucket] = useState<string | null>(null);
  const [bucketErrors, setBucketErrors] = useState<Record<string, boolean>>({});

  const [activeKey, setActiveKey] = useState<string>("ai");
  const [activeSubCat, setActiveSubCat] = useState<string>(ALL);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Tool[]>([]);
  const [searching, setSearching] = useState(false);

  const [favItems, setFavItems] = useState<Tool[]>([]);
  const [favLoading, setFavLoading] = useState(false);
  const [favError, setFavError] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [favKey, setFavKey] = useState<string | null>(null);

  // Batch-C: DB-türetilmiş hesap listesi — tek yerde çağrılır, karta prop'la
  // geçirilir (kart başına ayrı fetch yerine tek hook çağrısı).
  const accountHandles = useAccountHandles();

  // App-level toast (mesajlar birebir korunur). Ref üzerinden çağrılır ki
  // provider re-render'ları useCallback kimliklerini bozup yükleme
  // efektlerini tekrar tetiklemesin.
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  const showToast = useCallback((text: string, type: "success" | "error") => {
    if (type === "success") toastRef.current.success(text);
    else toastRef.current.error(text);
  }, []);

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
  }, [showToast]);

  const loadBucket = useCallback(
    async (key: string) => {
      setLoadingBucket(key);
      setBucketErrors((prev) => ({ ...prev, [key]: false }));
      try {
        const data = await fetchJson<ListResponse>(`/api/toolbox?bucket=${key}&limit=200`);
        if (data.success && data.items) {
          setBucketItems((prev) => ({ ...prev, [key]: data.items! }));
        } else {
          setBucketErrors((prev) => ({ ...prev, [key]: true }));
          showToast(data.error || "Grup yüklenemedi.", "error");
        }
      } catch (err) {
        setBucketErrors((prev) => ({ ...prev, [key]: true }));
        showToast(err instanceof Error ? err.message : "Sunucu hatası.", "error");
      } finally {
        setLoadingBucket(null);
      }
    },
    [showToast]
  );

  const loadFavorites = useCallback(async () => {
    setFavLoading(true);
    setFavError(false);
    try {
      const data = await fetchJson<ListResponse>("/api/toolbox?favorite=true&limit=300");
      if (data.success && data.items) setFavItems(data.items);
      else {
        setFavError(true);
        showToast(data.error || "Favoriler alınamadı.", "error");
      }
    } catch (err) {
      setFavError(true);
      showToast(err instanceof Error ? err.message : "Sunucu hatası.", "error");
    } finally {
      setFavLoading(false);
    }
  }, [showToast]);

  // Mount: counts + featured AI bucket.
  useEffect(() => {
    loadCounts();
    loadBucket("ai");
  }, [loadCounts, loadBucket]);

  // Debounced search.
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
  }, [debouncedSearch, showToast]);

  const selectFolder = (key: string) => {
    setActiveKey(key);
    setActiveSubCat(ALL);
    if (key === FAV_KEY) loadFavorites();
    else if (!bucketItems[key]) loadBucket(key);
  };

  const applyFavoriteToggle = (id: string, isFavorite: boolean) => {
    const patch = (list: Tool[]) => list.map((t) => (t.id === id ? { ...t, isFavorite } : t));
    setBucketItems((prev) => {
      const next: Record<string, Tool[]> = {};
      for (const k of Object.keys(prev)) next[k] = patch(prev[k]);
      return next;
    });
    setSearchResults((prev) => patch(prev));
    setFavItems((prev) => (isFavorite ? patch(prev) : prev.filter((t) => t.id !== id)));
    setCounts((prev) =>
      prev && typeof prev.favoritesCount === "number"
        ? { ...prev, favoritesCount: Math.max(0, prev.favoritesCount + (isFavorite ? 1 : -1)) }
        : prev
    );
  };

  const toggleFavorite = async (id: string, current: boolean) => {
    setFavKey(id);
    applyFavoriteToggle(id, !current); // optimistic
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
        await loadCounts();
        setBucketItems({});
        if (activeKey === FAV_KEY) loadFavorites();
        else loadBucket(activeKey);
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
    <ToolboxToolCard
      key={t.id}
      tool={t}
      favBusy={favKey === t.id}
      onToggleFavorite={() => toggleFavorite(t.id, t.isFavorite)}
      generatingKey={generatingKey}
      onGenerate={generate}
      accounts={accountHandles}
    />
  );

  const isSearchMode = debouncedSearch.length > 0;
  const total = counts?.total ?? 0;
  const favoritesCount = counts?.favoritesCount ?? 0;

  // Folder tiles from counts + a Favorites tile (icons/accent from TOOLBOX_BUCKETS).
  const folderItems: FolderItem[] = [
    ...(counts?.buckets ?? []).map((b) => {
      const meta = TOOLBOX_BUCKETS.find((x) => x.key === b.key);
      return { key: b.key, label: b.label, count: b.count, icon: meta?.icon, accent2: meta?.accent2 };
    }),
    { key: FAV_KEY, label: "Favoriler", count: favoritesCount, icon: "Star" },
  ];

  // Active folder content + sub-category strip (multi-category buckets only).
  const activeItems = activeKey === FAV_KEY ? favItems : bucketItems[activeKey] ?? [];
  const activeBucket = TOOLBOX_BUCKETS.find((b) => b.key === activeKey);
  const presentSubCats =
    activeBucket && activeBucket.categories.length > 1
      ? activeBucket.categories
          .map((c) => ({ c, n: activeItems.filter((t) => t.category === c).length }))
          .filter((x) => x.n > 0)
      : [];
  const subNavItems =
    presentSubCats.length > 1
      ? [
          { id: ALL, label: "Tümü", badge: activeItems.length },
          ...presentSubCats.map((x) => ({ id: x.c, label: chipLabel(x.c), badge: x.n })),
        ]
      : [];
  const visibleItems = activeSubCat === ALL ? activeItems : activeItems.filter((t) => t.category === activeSubCat);

  const activeError = activeKey === FAV_KEY ? favError : !!bucketErrors[activeKey];
  const activeLoading =
    activeKey === FAV_KEY
      ? favLoading
      : loadingBucket === activeKey || (!bucketItems[activeKey] && !activeError);

  return (
    <div style={{ width: "100%", paddingBottom: "var(--space-10)" }}>
      <PageHeader
        eyebrow="ARAÇ KUTUSU"
        title="Toolbox"
        subtitle="İçerik üretimini besleyen araç ve kaynaklar — gruba göre seç, alt-kategoride filtrele, hesaplara fikir kuyruğu kur."
        size="compact"
        meta={
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
              <Wrench size={13} strokeWidth={2} />
              <span className="tnum">{total}</span> araç / kaynak
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--accent-text)", fontWeight: 500 }}>
              <Star size={13} strokeWidth={2} fill="currentColor" />
              <span className="tnum">{favoritesCount}</span> favori
            </span>
          </>
        }
      />

      {/* Toolbar: arama + yenile — tek kompakt satır */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "var(--space-4)",
        }}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center", flex: 1, minWidth: 200 }}>
          <Input
            type="text"
            placeholder="Tüm araçlarda ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<SearchIcon size={14} strokeWidth={2} />}
            style={{
              minHeight: "var(--control-h-sm)",
              padding: "0 30px 0 32px",
              fontSize: "var(--text-xs)",
            }}
          />
          {searching && (
            <Loader2
              size={14}
              strokeWidth={2}
              style={{ position: "absolute", right: 10, color: "var(--text-muted)", animation: "spin 0.6s linear infinite" }}
            />
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={refresh}
          loading={refreshing}
          iconLeft={<RefreshCw size={14} strokeWidth={2} />}
        >
          {refreshing ? "Kontrol ediliyor…" : "Yenile"}
        </Button>
      </div>

      {isSearchMode ? (
        /* Search overlay (flat) */
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
      ) : (
        <>
          {/* Folder shortcuts */}
          <ToolboxFolderRow
            items={folderItems}
            activeKey={activeKey}
            onSelect={selectFolder}
            loading={loadingCounts && !counts}
          />

          {/* Sub-category strip (multi-category buckets) */}
          {subNavItems.length > 1 && (
            <SubNav items={subNavItems} activeId={activeSubCat} onSelect={setActiveSubCat} />
          )}

          {/* Grid */}
          {activeLoading ? (
            <ToolboxSkeletonGrid />
          ) : activeError ? (
            <ErrorState
              title={activeKey === FAV_KEY ? "Favoriler alınamadı" : "Grup yüklenemedi"}
              description="Araç listesi şu an alınamıyor. Sorun sürerse Ayarlar → Sistem durumu."
              onRetry={() => (activeKey === FAV_KEY ? loadFavorites() : loadBucket(activeKey))}
            />
          ) : visibleItems.length === 0 ? (
            <Card variant="quiet" padded={false}>
              <EmptyState
                icon={activeKey === FAV_KEY ? <Star size={24} strokeWidth={1.8} /> : <Wrench size={24} strokeWidth={1.8} />}
                title={activeKey === FAV_KEY ? "Henüz favori yok" : "Bu grupta araç yok"}
                description={
                  activeKey === FAV_KEY
                    ? "Araçların yıldızına dokunarak favorilere ekleyebilirsin."
                    : "Başka bir grup ya da alt-kategori dene."
                }
              />
            </Card>
          ) : (
            <ToolGrid>{visibleItems.map(renderCard)}</ToolGrid>
          )}
        </>
      )}
    </div>
  );
}

function ToolGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "var(--space-2)" }}>
      {children}
    </div>
  );
}

function ToolboxSkeletonGrid() {
  return (
    <ToolGrid>
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 13 }}>
          <Skeleton width="70%" height={14} />
          <Skeleton height={32} />
          <Skeleton width="45%" height={18} />
          <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
            <Skeleton width="48%" height={24} />
            <Skeleton width="48%" height={24} />
          </div>
        </Card>
      ))}
    </ToolGrid>
  );
}
