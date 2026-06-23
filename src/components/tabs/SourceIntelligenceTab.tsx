"use client";

import { useState, useEffect, useRef } from "react";
import {
  RefreshCw,
  Radar,
  Target,
  TrendingUp,
  ShieldAlert,
  Percent,
  Crown,
  Search,
  Heart,
  Repeat2,
  Eye,
  Send,
  Sparkles,
  Pencil,
  Play,
  Pause,
  X,
  Check,
  CircleDot,
  Plus,
  Trash2,
} from "lucide-react";
import { PageHeader, Card, EmptyState, SectionHeader, Badge, Skeleton, Button, Input, Select } from "@/components/ui";

interface Source {
  id: string;
  accountId: string;
  handle: string;
  displayName: string | null;
  enabled: boolean;
  mode: string;
  thresholdLikes: number;
  thresholdRetweets: number;
  createdAt: string;
  accountHandle: string;
  totalPosts: number;
  averageOpportunity: number;
  averageRisk: number;
}

interface SourcePost {
  id: string;
  accountId: string;
  sourceId: string;
  tweetId: string;
  text: string;
  likeCount: number;
  retweetCount: number;
  viewCount: number;
  viralScore: number;
  url: string;
  publishedAt: string | null;
  opportunityScore: number;
  status: string;
  scannedAt: string;
  accountHandle: string;
  sourceHandle: string;
  riskScore: number;
  suggestedAction: string;
  reason: string;
}

interface Summary {
  totalSources: number;
  activeSources: number;
  inactiveSources: number;
  totalSourcePosts: number;
  highOpportunityPosts: number;
  highRiskPosts: number;
  averageOpportunityScore: number;
  topSourceHandle: string;
}

interface PreviewScoreResult {
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
}

export default function SourceIntelligenceTab() {
  // Query Filters
  const [account, setAccount] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sourceType, setSourceType] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [risk, setRisk] = useState<string>("all");
  const [search, setSearch] = useState<string>("all"); // default all (empty string is safe)
  const [searchText, setSearchText] = useState<string>("");
  const [sort, setSort] = useState<string>("opportunityScore");

  // API Data
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcePosts, setSourcePosts] = useState<SourcePost[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalSources: 0,
    activeSources: 0,
    inactiveSources: 0,
    totalSourcePosts: 0,
    highOpportunityPosts: 0,
    highRiskPosts: 0,
    averageOpportunityScore: 0,
    topSourceHandle: ""
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // UI Selection Modals
  const [selectedPost, setSelectedPost] = useState<SourcePost | null>(null);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [previewScore, setPreviewScore] = useState<PreviewScoreResult | null>(null);
  const [scoringLoading, setScoringLoading] = useState<boolean>(false);

  // Edit Source States
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [editDisplayName, setEditDisplayName] = useState<string>("");
  const [editMode, setEditMode] = useState<string>("TWEET");
  const [editThresholdLikes, setEditThresholdLikes] = useState<number>(10);
  const [editThresholdRetweets, setEditThresholdRetweets] = useState<number>(2);
  const [updatingSource, setUpdatingSource] = useState<boolean>(false);

  // Add Source States (merged in from the former Keşfet → Kaynaklar tab so all
  // X-account source management lives in one place).
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [addAccount, setAddAccount] = useState<string>("grafikcem");
  const [addHandle, setAddHandle] = useState<string>("");
  const [addMode, setAddMode] = useState<string>("TWEET");
  const [addLikes, setAddLikes] = useState<number>(100);
  const [addRTs, setAddRTs] = useState<number>(20);
  const [addError, setAddError] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState<boolean>(false);

  // Tooltip Notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Fetch Telemetry Data
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const qParams = new URLSearchParams();
      if (account !== "all") qParams.set("accountHandle", account);
      if (status !== "all") qParams.set("status", status);
      if (sourceType !== "all") qParams.set("sourceType", sourceType);
      if (action !== "all") qParams.set("action", action);
      if (risk !== "all") qParams.set("risk", risk);
      if (searchText.trim()) qParams.set("search", searchText);
      qParams.set("sort", sort);

      const res = await fetch(`/api/growth/source-intelligence?${qParams.toString()}`);
      if (!res.ok) throw new Error("Fırsat analizi verileri yüklenemedi.");
      const data = await res.json();
      if (data.success) {
        setSources(data.sources || []);
        setSourcePosts(data.sourcePosts || []);
        setSummary(data.summary || {
          totalSources: 0,
          activeSources: 0,
          inactiveSources: 0,
          totalSourcePosts: 0,
          highOpportunityPosts: 0,
          highRiskPosts: 0,
          averageOpportunityScore: 0,
          topSourceHandle: ""
        });
      } else {
        throw new Error(data.error || "Bilinmeyen bir API hatası oluştu.");
      }
    } catch (err: any) {
      setError(err.message || "Veriler yüklenirken ağ hatası oluştu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [account, status, sourceType, action, risk, sort]);

  // Search input handler
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  // Toggle Source status
  const handleToggleSource = async (src: Source) => {
    try {
      const res = await fetch(`/api/sources/${src.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !src.enabled })
      });
      const data = await res.json();
      if (data.success) {
        triggerToast(`@${src.handle} başarıyla ${!src.enabled ? "aktif" : "pasif"} yapıldı.`);
        loadData();
      } else {
        triggerToast(data.error || "Kaynak durumu güncellenemedi.");
      }
    } catch {
      triggerToast("Kaynak güncellenirken ağ hatası oluştu.");
    }
  };

  // Open Edit Source Modal
  const openEditSource = (src: Source) => {
    setEditingSource(src);
    setEditDisplayName(src.displayName || "");
    setEditMode(src.mode);
    setEditThresholdLikes(src.thresholdLikes);
    setEditThresholdRetweets(src.thresholdRetweets);
  };

  // Save Source Criteria Updates
  const handleSaveSourceEdit = async () => {
    if (!editingSource) return;
    setUpdatingSource(true);
    try {
      const res = await fetch(`/api/sources/${editingSource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editDisplayName || null,
          mode: editMode,
          thresholdLikes: Number(editThresholdLikes),
          thresholdRetweets: Number(editThresholdRetweets)
        })
      });
      const data = await res.json();
      if (data.success) {
        triggerToast(`@${editingSource.handle} kriterleri güncellendi.`);
        setEditingSource(null);
        loadData();
      } else {
        triggerToast(data.error || "Kriterler kaydedilemedi.");
      }
    } catch {
      triggerToast("Ağ bağlantısı hatası oluştu.");
    } finally {
      setUpdatingSource(false);
    }
  };

  // Add a new source (POST /api/sources), then refresh telemetry.
  const handleAddSource = async () => {
    const cleanHandle = addHandle.replace("@", "").trim();
    if (!cleanHandle) {
      setAddError("X handle gerekli.");
      return;
    }
    setAddingSource(true);
    setAddError(null);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountHandle: addAccount,
          handle: cleanHandle,
          mode: addMode,
          thresholdLikes: Number(addLikes) || 100,
          thresholdRetweets: Number(addRTs) || 20,
        }),
      });
      const data = await res.json();
      if (data.success) {
        triggerToast(`@${cleanHandle} kaynağı eklendi.`);
        setAddOpen(false);
        setAddHandle("");
        setAddMode("TWEET");
        setAddLikes(100);
        setAddRTs(20);
        loadData();
      } else {
        setAddError(data.error || "Kaynak eklenemedi.");
      }
    } catch {
      setAddError("Ağ hatası oluştu.");
    } finally {
      setAddingSource(false);
    }
  };

  // Archive (soft-delete) the source currently open in the edit modal.
  const handleArchiveSource = async () => {
    if (!editingSource) return;
    if (!window.confirm(`@${editingSource.handle} kaynağını arşivlemek istediğine emin misin?`)) return;
    setUpdatingSource(true);
    try {
      const res = await fetch(`/api/sources/${editingSource.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        triggerToast(`@${editingSource.handle} arşivlendi.`);
        setEditingSource(null);
        loadData();
      } else {
        triggerToast(data.error || "Kaynak arşivlenemedi.");
      }
    } catch {
      triggerToast("Ağ hatası oluştu.");
    } finally {
      setUpdatingSource(false);
    }
  };

  // Dynamic score preview trigger
  const handlePreviewScore = async (post: SourcePost) => {
    setScoringLoading(true);
    setPreviewScore(null);
    try {
      const res = await fetch(`/api/growth/source-intelligence/source-posts/${post.id}/score`, {
        method: "POST"
      });
      const data = await res.json();
      if (data.success && data.score) {
        setPreviewScore(data.score);
      } else {
        triggerToast(data.error || "Önizleme puanlaması yapılamadı.");
      }
    } catch {
      triggerToast("Önizleme puanlanırken ağ hatası oluştu.");
    } finally {
      setScoringLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "var(--bg-elevated)",
            border: "1px solid var(--accent-border)",
            color: "var(--text-primary)",
            padding: "12px 18px",
            borderRadius: "var(--radius-md)",
            zIndex: 999,
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 8,
            boxShadow: "var(--shadow-lg), var(--highlight-top)"
          }}
        >
          <Check size={15} strokeWidth={2.4} style={{ color: "var(--green)" }} /> {toastMessage}
        </div>
      )}

      {/* Header */}
      <PageHeader
        eyebrow="ÖĞREN"
        title="X Hesabı Kaynakları"
        subtitle="İzlenen X hesaplarını ekle/düzenle, taranan postları ve fırsat skorlarını hesap bazlı yönet."
        meta={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Radar size={14} strokeWidth={2} style={{ color: "var(--accent-text)" }} />
            <span>Aktif kaynak izleme · </span>
            <strong className="tnum" style={{ color: "var(--text-primary)", fontWeight: 500 }}>{summary.totalSources}</strong>
            <span>kaynak</span>
          </span>
        }
        actions={
          <Button variant="secondary" size="md" onClick={loadData} iconLeft={<RefreshCw size={15} strokeWidth={2} />}>
            Yenile
          </Button>
        }
      />

      {/* Summary Statistics Panel */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "var(--space-3)"
        }}
      >
        <StatCard
          label="Toplam Kaynak"
          value={summary.totalSources}
          sub="Kaydedilmiş hesap"
          tone="default"
          icon={<Radar size={16} strokeWidth={1.8} />}
        />
        <StatCard
          label="Aktif Kaynak"
          value={summary.activeSources}
          sub={`${summary.inactiveSources} pasif`}
          tone="accent"
          icon={<Target size={16} strokeWidth={1.8} />}
        />
        <StatCard
          label="Taranan Post"
          value={summary.totalSourcePosts}
          sub="En son post havuzu"
          tone="default"
          icon={<CircleDot size={16} strokeWidth={1.8} />}
        />
        <StatCard
          label="Yüksek Fırsat"
          value={summary.highOpportunityPosts}
          sub="Fırsat skoru 75+"
          tone="green"
          icon={<TrendingUp size={16} strokeWidth={1.8} />}
        />
        <StatCard
          label="Yüksek Risk"
          value={summary.highRiskPosts}
          sub="Risk skoru 70+"
          tone="danger"
          icon={<ShieldAlert size={16} strokeWidth={1.8} />}
        />
        <StatCard
          label="Ortalama Fırsat"
          value={`${summary.averageOpportunityScore}%`}
          sub="Tüm kaynak ortalaması"
          tone="default"
          icon={<Percent size={16} strokeWidth={1.8} />}
        />
        <StatCard
          label="En Başarılı Kaynak"
          value={summary.topSourceHandle ? `@${summary.topSourceHandle}` : "Yok"}
          sub="En yüksek fırsat skoru"
          tone="accent"
          icon={<Crown size={16} strokeWidth={1.8} />}
          truncate
        />
      </div>

      {/* Filter Control Bar */}
      <Card variant="quiet" padded>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "flex-end" }}>
          <FilterField label="HEDEF HESAP">
            <Select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              options={[
                { value: "all", label: "Tümü" },
                { value: "grafikcem", label: "grafikcem" },
                { value: "maskulenkod", label: "maskulenkod" }
              ]}
            />
          </FilterField>

          <FilterField label="KAYNAK DURUMU">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: "all", label: "Tümü" },
                { value: "active", label: "Aktif" },
                { value: "inactive", label: "Pasif" }
              ]}
            />
          </FilterField>

          <FilterField label="KATEGORİ / TÜR">
            <Select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              options={[
                { value: "all", label: "Tümü" },
                { value: "tweet", label: "Tweet" },
                { value: "quote", label: "Quote" },
                { value: "reply", label: "Reply" }
              ]}
            />
          </FilterField>

          <FilterField label="ÖNERİLEN AKSİYON">
            <Select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              options={[
                { value: "all", label: "Tümü" },
                { value: "tweet", label: "Tweet" },
                { value: "quote", label: "Quote" },
                { value: "reply", label: "Reply" },
                { value: "ignore", label: "Ignore" }
              ]}
            />
          </FilterField>

          <FilterField label="RİSK DÜZEYİ">
            <Select
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
              options={[
                { value: "all", label: "Tümü" },
                { value: "low", label: "Düşük Risk" },
                { value: "medium", label: "Orta Risk" },
                { value: "high", label: "Yüksek Risk" }
              ]}
            />
          </FilterField>

          <FilterField label="SIRALAMA">
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              options={[
                { value: "opportunityScore", label: "Fırsat Skoru (Yüksek-Düşük)" },
                { value: "riskScore", label: "Risk Skoru (Yüksek-Düşük)" },
                { value: "createdAt", label: "Yayınlanma Tarihi" },
                { value: "updatedAt", label: "Son Taranma Tarihi" },
                { value: "sourceWeight", label: "Kaynak Kriteri/Eşiği" }
              ]}
            />
          </FilterField>

          {/* Search bar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 200 }}>
            <span className="eyebrow" style={{ color: "var(--text-muted)" }}>METİN ARAMA</span>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <Input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="@kullanici veya anahtar kelime..."
                iconLeft={<Search size={15} strokeWidth={1.8} />}
              />
              <Button type="submit" variant="primary" size="md">
                Ara
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Main Split Layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 16
        }}
        className="main-grid-layout"
      >
        {/* CSS override for larger screen split-pane layout */}
        <style>{`
          @media (min-width: 1024px) {
            .main-grid-layout {
              grid-template-columns: 320px 1fr !important;
            }
          }
        `}</style>

        {/* Left Side: Sources Panel */}
        <Card
          variant="feature"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            alignSelf: "start"
          }}
        >
          <SectionHeader
            eyebrow="İZLEME"
            title="Takip Edilen Kaynaklar"
            action={
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Badge variant="accent" size="sm">{sources.length}</Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setAddOpen(true); setAddError(null); }}
                  iconLeft={<Plus size={14} strokeWidth={2} />}
                >
                  Yeni Kaynak
                </Button>
              </div>
            }
          />

          <div
            style={{
              maxHeight: 520,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              paddingRight: 4
            }}
          >
            {sources.length === 0 ? (
              <EmptyState
                compact
                icon={<Radar size={20} strokeWidth={1.8} />}
                title="Henüz kaynak eklenmedi"
                description="Tarama kaynağı eklendiğinde takip edilen hesaplar burada listelenir."
              />
            ) : (
              sources.map((src) => (
                <div
                  key={src.id}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    padding: "var(--space-3)",
                    borderRadius: "var(--radius-lg)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    position: "relative"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div>
                      <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)" }}>
                        @{src.handle}
                      </div>
                      {src.displayName && (
                        <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                          {src.displayName}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 9,
                        background: src.enabled ? "rgba(63,178,127,0.12)" : "var(--bg-elevated)",
                        color: src.enabled ? "var(--green)" : "var(--text-muted)",
                        border: src.enabled ? "1px solid rgba(63,178,127,0.25)" : "1px solid var(--border)",
                        padding: "2px 6px",
                        borderRadius: "var(--radius-sm)",
                        fontWeight: 500,
                        letterSpacing: "0.04em"
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: src.enabled ? "var(--green)" : "var(--text-muted)" }} />
                      {src.enabled ? "AKTİF" : "PASİF"}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, fontSize: "var(--text-2xs)" }}>
                    <span style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>
                      Hedef: @{src.accountHandle}
                    </span>
                    <span style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>
                      Filtre: {src.mode}
                    </span>
                    <span style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>
                      Eşik: {src.thresholdLikes} Beğeni
                    </span>
                  </div>

                  {src.totalPosts > 0 && (
                    <div className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginTop: 2, display: "flex", justifyContent: "space-between" }}>
                      <span>Toplam Post: <strong style={{ color: "var(--text-secondary)" }}>{src.totalPosts}</strong></span>
                      <span>Ort. Fırsat: <strong style={{ color: "var(--accent-text)" }}>{src.averageOpportunity}%</strong></span>
                    </div>
                  )}

                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: 8,
                      marginTop: 4,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 4,
                      alignItems: "center"
                    }}
                  >
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={() => handleToggleSource(src)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          background: "none",
                          border: "none",
                          color: src.enabled ? "var(--danger)" : "var(--green)",
                          fontSize: "var(--text-2xs)",
                          fontWeight: 500,
                          cursor: "pointer",
                          padding: "2px 4px",
                          fontFamily: "inherit"
                        }}
                      >
                        {src.enabled ? <Pause size={12} strokeWidth={2} /> : <Play size={12} strokeWidth={2} />}
                        {src.enabled ? "Durdur" : "Başlat"}
                      </button>
                      <button
                        onClick={() => openEditSource(src)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          background: "none",
                          border: "none",
                          color: "var(--accent-text)",
                          fontSize: "var(--text-2xs)",
                          fontWeight: 500,
                          cursor: "pointer",
                          padding: "2px 4px",
                          fontFamily: "inherit"
                        }}
                      >
                        <Pencil size={12} strokeWidth={2} />
                        Kriter
                      </button>
                    </div>

                    {/* Scan Now Placeholder */}
                    <div style={{ position: "relative" }} className="action-tooltip-group">
                      <button
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          fontSize: "var(--text-2xs)",
                          fontWeight: 500,
                          cursor: "not-allowed",
                          padding: "2px 4px",
                          fontFamily: "inherit",
                          opacity: 0.55
                        }}
                      >
                        <Radar size={12} strokeWidth={2} />
                        Tara
                      </button>
                      <div
                        className="tooltip-content"
                        style={{
                          visibility: "hidden",
                          width: 170,
                          background: "var(--bg-elevated)",
                          color: "var(--text-primary)",
                          textAlign: "center",
                          borderRadius: "var(--radius-md)",
                          padding: "6px 8px",
                          position: "absolute",
                          zIndex: 10,
                          bottom: "125%",
                          left: "50%",
                          marginLeft: -85,
                          opacity: 0,
                          transition: "opacity 0.2s var(--ease-out)",
                          fontSize: "var(--text-2xs)",
                          border: "1px solid var(--border-strong)",
                          boxShadow: "var(--shadow-md)",
                          pointerEvents: "none"
                        }}
                      >
                        Source scanning Sprint 9/sonrası aktif olacak.
                      </div>
                      <style>{`
                        .action-tooltip-group:hover .tooltip-content {
                          visibility: visible !important;
                          opacity: 1 !important;
                        }
                      `}</style>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Right Side: Source Posts Panel */}
        <Card
          variant="feature"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)"
          }}
        >
          <SectionHeader
            eyebrow="FIRSAT"
            title="Fırsat Havuzu"
            action={<Badge variant="accent" size="sm">{sourcePosts.length} gönderi</Badge>}
          />

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-2) 0" }}>
              <Skeleton height={96} />
              <Skeleton height={96} />
              <Skeleton height={96} />
            </div>
          ) : error ? (
            <EmptyState
              icon={<ShieldAlert size={22} strokeWidth={1.8} />}
              title="Fırsatlar yüklenemedi"
              description={error}
            />
          ) : sourcePosts.length === 0 ? (
            <EmptyState
              icon={<Radar size={22} strokeWidth={1.8} />}
              title="Henüz taranmış kaynak post yok"
              description="Tarayıcı aktif edildiğinde kriterlere uyan gönderiler burada listelenecek."
            />
          ) : (
            <div
              style={{
                maxHeight: 520,
                overflowY: "auto",
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 10,
                paddingRight: 4
              }}
            >
              {sourcePosts.map((post) => {
                const isHighOpp = post.opportunityScore >= 75;
                const isHighRisk = post.riskScore >= 70;

                return (
                  <div
                    key={post.id}
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      padding: "var(--space-3)",
                      borderRadius: "var(--radius-lg)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                      {/* Source details */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--accent-text)" }}>@{post.sourceHandle}</span>
                        <span style={{ fontSize: 9, color: "var(--text-muted)" }}>•</span>
                        <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>Hedef: @{post.accountHandle}</span>
                        {post.publishedAt && (
                          <>
                            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>•</span>
                            <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                              {new Date(post.publishedAt).toLocaleDateString("tr-TR")}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Score indicators */}
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {/* Opportunity Score */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span className="eyebrow" style={{ fontSize: 9, color: "var(--text-muted)" }}>Fırsat</span>
                          <span
                            className="tnum"
                            style={{
                              fontSize: "var(--text-2xs)",
                              fontWeight: 500,
                              background: isHighOpp ? "rgba(63,178,127,0.14)" : "var(--bg-elevated)",
                              color: isHighOpp ? "var(--green)" : "var(--text-primary)",
                              border: isHighOpp ? "1px solid rgba(63,178,127,0.25)" : "1px solid var(--border)",
                              padding: "2px 6px",
                              borderRadius: "var(--radius-sm)"
                            }}
                          >
                            {post.opportunityScore}%
                          </span>
                        </div>

                        {/* Risk Score */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span className="eyebrow" style={{ fontSize: 9, color: "var(--text-muted)" }}>Risk</span>
                          <span
                            className="tnum"
                            style={{
                              fontSize: "var(--text-2xs)",
                              fontWeight: 500,
                              background: isHighRisk ? "rgba(229,72,77,0.14)" : "var(--bg-elevated)",
                              color: isHighRisk ? "var(--danger)" : "var(--text-primary)",
                              border: isHighRisk ? "1px solid rgba(229,72,77,0.25)" : "1px solid var(--border)",
                              padding: "2px 6px",
                              borderRadius: "var(--radius-sm)"
                            }}
                          >
                            {post.riskScore}%
                          </span>
                        </div>

                        {/* Suggested Action */}
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 500,
                            padding: "2px 7px",
                            borderRadius: "var(--radius-sm)",
                            letterSpacing: "0.04em",
                            background:
                              post.suggestedAction === "tweet"
                                ? "var(--accent-dark)"
                                : post.suggestedAction === "quote"
                                ? "rgba(76,141,255,0.12)"
                                : post.suggestedAction === "reply"
                                ? "rgba(229,72,77,0.12)"
                                : "var(--bg-elevated)",
                            border:
                              post.suggestedAction === "tweet"
                                ? "1px solid var(--accent-border)"
                                : post.suggestedAction === "quote"
                                ? "1px solid rgba(76,141,255,0.25)"
                                : post.suggestedAction === "reply"
                                ? "1px solid rgba(229,72,77,0.25)"
                                : "1px solid var(--border)",
                            color:
                              post.suggestedAction === "tweet"
                                ? "var(--accent-text)"
                                : post.suggestedAction === "quote"
                                ? "var(--blue)"
                                : post.suggestedAction === "reply"
                                ? "var(--danger)"
                                : "var(--text-muted)",
                            textTransform: "uppercase"
                          }}
                        >
                          {post.suggestedAction}
                        </span>
                      </div>
                    </div>

                    {/* Text Preview */}
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {post.text}
                    </div>

                    {/* Telemetry metrics & actions */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 10,
                        borderTop: "1px solid var(--border)",
                        paddingTop: 8,
                        marginTop: 4
                      }}
                    >
                      <div className="tnum" style={{ display: "flex", gap: 12, fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Heart size={13} strokeWidth={1.8} /> {post.likeCount}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Repeat2 size={14} strokeWidth={1.8} /> {post.retweetCount}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Eye size={13} strokeWidth={1.8} /> {post.viewCount}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setSelectedPost(post);
                            handlePreviewScore(post);
                          }}
                          iconLeft={<Sparkles size={13} strokeWidth={2} />}
                        >
                          Skor Detayı
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedPost(post)}
                        >
                          Detayları Gör
                        </Button>

                        {/* Send to Flow Radar Placeholder */}
                        <div style={{ position: "relative" }} className="action-tooltip-group">
                          <button
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: "none",
                              border: "none",
                              color: "var(--text-muted)",
                              fontSize: "var(--text-2xs)",
                              fontWeight: 500,
                              cursor: "not-allowed",
                              padding: "4px 8px",
                              fontFamily: "inherit",
                              opacity: 0.55
                            }}
                          >
                            <Send size={13} strokeWidth={1.8} />
                            Flow&apos;a Gönder
                          </button>
                          <div
                            className="tooltip-content"
                            style={{
                              visibility: "hidden",
                              width: 170,
                              background: "var(--bg-elevated)",
                              color: "var(--text-primary)",
                              textAlign: "center",
                              borderRadius: "var(--radius-md)",
                              padding: "6px 8px",
                              position: "absolute",
                              zIndex: 10,
                              bottom: "125%",
                              right: 0,
                              opacity: 0,
                              transition: "opacity 0.2s var(--ease-out)",
                              fontSize: "var(--text-2xs)",
                              border: "1px solid var(--border-strong)",
                              boxShadow: "var(--shadow-md)",
                              pointerEvents: "none"
                            }}
                          >
                            Flow Radar Sprint 9&apos;da aktif olacak.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* 1. Modal: Edit Source Criteria (Beğeni/Repost Eşikleri) */}
      {editingSource && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.72)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: 16
          }}
        >
          <Card
            variant="hero"
            padded={false}
            style={{
              padding: "var(--space-6)",
              maxWidth: 420,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div className="eyebrow" style={{ color: "var(--accent-text)", marginBottom: 6 }}>KRİTER</div>
                <h3 className="font-display" style={{ fontSize: "var(--text-lg)", fontWeight: 500, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                  @{editingSource.handle} Tarama Kriteri
                </h3>
              </div>
              <button
                onClick={() => setEditingSource(null)}
                style={{ display: "inline-flex", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
                aria-label="Kapat"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Görünen İsim</span>
                <Input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="Kanal / Kişi Adı"
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Tarama Modu</span>
                <Select
                  value={editMode}
                  onChange={(e) => setEditMode(e.target.value)}
                  style={{ padding: "8px 10px", fontSize: "var(--text-sm)" }}
                  options={[
                    { value: "ALL", label: "ALL (Tweet, Re-tweet, Reply)" },
                    { value: "TWEET", label: "TWEET (Sadece tweetler)" },
                    { value: "QUOTE", label: "QUOTE (Sadece alıntılar)" },
                    { value: "REPLY", label: "REPLY (Sadece yanıtlar)" }
                  ]}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Beğeni Eşiği</span>
                  <Input
                    type="number"
                    value={editThresholdLikes}
                    onChange={(e) => setEditThresholdLikes(Number(e.target.value))}
                    min="0"
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Retweet Eşiği</span>
                  <Input
                    type="number"
                    value={editThresholdRetweets}
                    onChange={(e) => setEditThresholdRetweets(Number(e.target.value))}
                    min="0"
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", marginTop: 4 }}>
              <Button
                variant="ghost"
                size="md"
                onClick={handleArchiveSource}
                disabled={updatingSource}
                iconLeft={<Trash2 size={14} strokeWidth={2} />}
                style={{ color: "var(--danger)" }}
              >
                Arşivle
              </Button>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <Button variant="ghost" size="md" onClick={() => setEditingSource(null)}>
                  İptal
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleSaveSourceEdit}
                  disabled={updatingSource}
                  loading={updatingSource}
                >
                  {updatingSource ? "Kaydediliyor..." : "Kaydet"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Add Source Modal (merged from Keşfet → Kaynaklar) */}
      {addOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.72)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: 16,
          }}
        >
          <Card
            variant="hero"
            padded={false}
            style={{
              padding: "var(--space-6)",
              maxWidth: 420,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div className="eyebrow" style={{ color: "var(--accent-text)", marginBottom: 6 }}>YENİ KAYNAK</div>
                <h3 className="font-display" style={{ fontSize: "var(--text-lg)", fontWeight: 500, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                  İzlenecek X Hesabı Ekle
                </h3>
              </div>
              <button
                onClick={() => setAddOpen(false)}
                style={{ display: "inline-flex", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
                aria-label="Kapat"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Hangi Hesap İçin?</span>
                <Select
                  value={addAccount}
                  onChange={(e) => setAddAccount(e.target.value)}
                  style={{ padding: "8px 10px", fontSize: "var(--text-sm)" }}
                  options={[
                    { value: "grafikcem", label: "@grafikcem" },
                    { value: "maskulenkod", label: "@maskulenkod" },
                  ]}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="eyebrow" style={{ color: "var(--text-muted)" }}>X Handle</span>
                <Input
                  type="text"
                  value={addHandle}
                  onChange={(e) => setAddHandle(e.target.value)}
                  placeholder="@twitter_handle"
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Tarama Modu</span>
                <Select
                  value={addMode}
                  onChange={(e) => setAddMode(e.target.value)}
                  style={{ padding: "8px 10px", fontSize: "var(--text-sm)" }}
                  options={[
                    { value: "ALL", label: "ALL (Tweet, Re-tweet, Reply)" },
                    { value: "TWEET", label: "TWEET (Sadece tweetler)" },
                    { value: "QUOTE", label: "QUOTE (Sadece alıntılar)" },
                    { value: "REPLY", label: "REPLY (Sadece yanıtlar)" },
                  ]}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Beğeni Eşiği</span>
                  <Input type="number" value={addLikes} onChange={(e) => setAddLikes(Number(e.target.value))} min="0" />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Retweet Eşiği</span>
                  <Input type="number" value={addRTs} onChange={(e) => setAddRTs(Number(e.target.value))} min="0" />
                </div>
              </div>

              {addError && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)", color: "var(--danger)" }}>
                  <ShieldAlert size={14} strokeWidth={2} />
                  {addError}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: 4 }}>
              <Button variant="ghost" size="md" onClick={() => setAddOpen(false)}>
                İptal
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleAddSource}
                disabled={addingSource}
                loading={addingSource}
              >
                {addingSource ? "Ekleniyor..." : "Ekle"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 2. Modal: Details & Score Preview details */}
      {selectedPost && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.78)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: 16
          }}
        >
          <Card
            variant="hero"
            padded={false}
            style={{
              padding: "var(--space-6)",
              maxWidth: 600,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div className="eyebrow" style={{ color: "var(--accent-text)", marginBottom: 6 }}>GÖNDERİ DETAYI</div>
                <h3 className="font-display" style={{ fontSize: "var(--text-lg)", fontWeight: 500, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                  @{selectedPost.sourceHandle}
                </h3>
                <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>Hedef hesap: @{selectedPost.accountHandle}</span>
              </div>
              <button
                onClick={() => {
                  setSelectedPost(null);
                  setPreviewScore(null);
                }}
                style={{ display: "inline-flex", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
                aria-label="Kapat"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            {/* Post text */}
            <div style={{ background: "var(--bg-base)", padding: "var(--space-4)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
              <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 8 }}>Gönderi Metni</div>
              <div style={{ fontSize: "var(--text-base)", color: "var(--text-primary)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {selectedPost.text}
              </div>
            </div>

            {/* Opportunity Analysis & Sub-scores */}
            <div>
              <SectionHeader
                eyebrow="ANALİZ"
                title="Puanlama Önizleme Analizi"
                action={scoringLoading ? <Badge variant="accent" size="sm">Analiz ediliyor…</Badge> : undefined}
              />

              {previewScore ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {/* Progress bars of positive sub-scores */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "var(--space-3)",
                      background: "var(--bg-base)",
                      padding: "var(--space-3)",
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--border)"
                    }}
                  >
                    <ScoreBar label="Uygunluk (Relevance)" pct={previewScore.relevanceScore} color="var(--accent)" />
                    <ScoreBar label="Tazelik (Freshness)" pct={previewScore.freshnessScore} color="var(--accent)" />
                    <ScoreBar label="Kitle Uyumu (Audience)" pct={previewScore.audienceFitScore} color="var(--blue)" />
                    <ScoreBar
                      label="Risk Skoru (Risk)"
                      pct={previewScore.riskScore}
                      color={previewScore.riskScore > 50 ? "var(--danger)" : "var(--green)"}
                      valueColor={previewScore.riskScore > 50 ? "var(--danger)" : "var(--text-muted)"}
                    />
                  </div>

                  {/* Summary & Reasoning */}
                  <div style={{ background: "var(--bg-base)", padding: "var(--space-3)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: "var(--space-3)" }}>
                      <div>
                        <div className="eyebrow" style={{ color: "var(--text-muted)" }}>Fırsat Değeri</div>
                        <div className="font-display tnum" style={{ fontSize: "var(--text-2xl)", fontWeight: 500, letterSpacing: "-0.02em", marginTop: 4, color: previewScore.opportunityScore >= 75 ? "var(--green)" : "var(--text-primary)" }}>
                          {previewScore.opportunityScore}%
                        </div>
                      </div>

                      <div>
                        <div className="eyebrow" style={{ color: "var(--text-muted)" }}>Önerilen Eylem</div>
                        <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--accent-text)", textTransform: "uppercase", marginTop: 6 }}>
                          {previewScore.suggestedAction}
                        </div>
                      </div>

                      <div>
                        <div className="eyebrow" style={{ color: "var(--text-muted)" }}>Güven Endeksi</div>
                        <div className="tnum" style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)", marginTop: 6 }}>
                          {previewScore.confidence}%
                        </div>
                      </div>
                    </div>

                    <div className="eyebrow" style={{ color: "var(--text-muted)" }}>Gerekçe / Açıklama</div>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
                      {previewScore.reason || "Skorlama motoru bu kaynak için özel bir kural tetikledi."}
                    </div>
                  </div>
                </div>
              ) : (
                  <div style={{ background: "var(--bg-base)", padding: "var(--space-4)", borderRadius: "var(--radius-lg)", textAlign: "center", border: "1px solid var(--border)" }}>
                    {scoringLoading ? (
                      <Skeleton lines={3} height={16} />
                    ) : (
                      <Button
                        variant="primary"
                        size="md"
                        onClick={() => handlePreviewScore(selectedPost)}
                        iconLeft={<Sparkles size={14} strokeWidth={2} />}
                      >
                        Analizi Başlat
                      </Button>
                    )}
                  </div>
                )}
              </div>

            {/* Footer buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-4)" }}>
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  setSelectedPost(null);
                  setPreviewScore(null);
                }}
              >
                Kapat
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Editöryal filtre alanı — eyebrow etiket + kontrol (Select/Input). */
function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="eyebrow" style={{ color: "var(--text-muted)" }}>{label}</span>
      {children}
    </div>
  );
}

type StatTone = "default" | "accent" | "green" | "danger";

const STAT_TONE_COLOR: Record<StatTone, string> = {
  default: "var(--text-primary)",
  accent: "var(--accent-text)",
  green: "var(--green)",
  danger: "var(--danger)",
};

/** Semantik-tonlu KPI kartı — editöryal display sayı + Lucide ikon + alt etiket. */
function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
  truncate = false,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  tone: StatTone;
  icon: React.ReactNode;
  truncate?: boolean;
}) {
  const color = STAT_TONE_COLOR[tone];
  return (
    <div
      style={{
        background: tone === "accent" ? "var(--gradient-accent), var(--bg-surface)" : "var(--gradient-surface), var(--bg-surface)",
        border: `1px solid ${tone === "accent" ? "var(--accent-border)" : "var(--border)"}`,
        borderRadius: "var(--radius-xl)",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxShadow: "var(--highlight-top)",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="eyebrow" style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ display: "inline-flex", color, opacity: 0.85, flexShrink: 0 }}>{icon}</span>
      </div>
      <div
        className="font-display tnum"
        style={{
          fontSize: "var(--text-xl)",
          fontWeight: 500,
          color,
          lineHeight: 1.1,
          letterSpacing: "-0.01em",
          ...(truncate ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } : {}),
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{sub}</div>
    </div>
  );
}

/** Etiketli ince ilerleme çubuğu — modal alt-skor satırı. */
function ScoreBar({ label, pct, color, valueColor }: { label: string; pct: number; color: string; valueColor?: string }) {
  return (
    <div>
      <div className="tnum" style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
        <span>{label}</span>
        <span style={{ color: valueColor || "var(--text-secondary)", fontWeight: 500 }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", marginTop: 5, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "var(--radius-sm)", transition: "width 0.3s var(--ease-out)" }} />
      </div>
    </div>
  );
}
