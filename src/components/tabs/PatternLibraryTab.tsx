"use client";
import { PageHeader, Card, MetricCard, EmptyState, Badge, Button, Skeleton } from "@/components/ui";

import { useState, useEffect } from "react";
import {
  BookOpen,
  CheckCircle2,
  PauseCircle,
  TrendingUp,
  Zap,
  Crown,
  Search,
  Pencil,
  Plus,
  ArrowUp,
  ArrowDown,
  X,
  Gem,
  Flame,
  Quote,
} from "lucide-react";

type RecentPattern = {
  id: string;
  accountId: string;
  accountHandle: string;
  displayName: string;
  patternName: string;
  category?: string;
  hookType?: string;
  structureJson?: Record<string, any>;
  emotion?: string;
  viralityTrigger?: string;
  exampleGood?: string;
  exampleBad?: string;
  usageCount: number;
  successScore: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Summary = {
  totalPatterns: number;
  activePatterns: number;
  inactivePatterns: number;
  averageSuccessScore: number;
  topPatternName: string;
  totalUsageCount: number;
};

export default function PatternLibraryTab() {
  const [summary, setSummary] = useState<Summary>({
    totalPatterns: 0,
    activePatterns: 0,
    inactivePatterns: 0,
    averageSuccessScore: 0,
    topPatternName: "N/A",
    totalUsageCount: 0
  });
  const [patterns, setPatterns] = useState<RecentPattern[]>([]);
  const [loading, setLoading] = useState(true);

  // Form / Drawer state
  const [activeDetail, setActiveDetail] = useState<RecentPattern | null>(null);
  const [editPattern, setEditPattern] = useState<RecentPattern | null>(null);
  const [editForm, setEditForm] = useState({
    patternName: "",
    category: "",
    hookType: "",
    emotion: "",
    viralityTrigger: "",
    exampleGood: "",
    exampleBad: "",
    structureJsonStr: ""
  });

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Filters
  const [accountHandle, setAccountHandle] = useState("all");
  const [activeStatus, setActiveStatus] = useState("all");
  const [categoryInput, setCategoryInput] = useState("all");
  const [hookTypeInput, setHookTypeInput] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("successScore");

  const fetchData = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        accountHandle,
        active: activeStatus,
        category: categoryInput,
        hookType: hookTypeInput,
        search,
        sort
      });
      const res = await fetch(`/api/growth/pattern-library?${q.toString()}`);
      const data = await res.json();
      if (data.success) {
        setSummary(data.summary);
        setPatterns(data.patterns);
      }
    } catch (err) {
      console.error("Failed to fetch pattern library data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [accountHandle, activeStatus, categoryInput, hookTypeInput, search, sort]);

  // Adjust score action
  const handleAdjustScore = async (pat: RecentPattern, delta: number) => {
    setActionLoading(`${pat.id}-score`);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/growth/pattern-library/${pat.id}/adjust-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta })
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ text: "Başarı skoru güncellendi!", type: "success" });
        fetchData();
      } else {
        setActionMessage({ text: data.error || "Aksiyon başarısız.", type: "error" });
      }
    } catch (err) {
      setActionMessage({ text: "Ağ bağlantı hatası.", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle active / deactivate status
  const handleToggleActive = async (pat: RecentPattern) => {
    setActionLoading(`${pat.id}-active`);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/growth/pattern-library/${pat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !pat.isActive })
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({
          text: pat.isActive ? "Pattern pasifleştirildi." : "Pattern aktifleştirildi!",
          type: "success"
        });
        fetchData();
      } else {
        setActionMessage({ text: data.error || "Aksiyon başarısız.", type: "error" });
      }
    } catch (err) {
      setActionMessage({ text: "Ağ bağlantı hatası.", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Increment usage count
  const handleIncrementUsage = async (pat: RecentPattern) => {
    setActionLoading(`${pat.id}-usage`);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/growth/pattern-library/${pat.id}/increment-usage`, {
        method: "POST"
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ text: "Kullanım miktarı artırıldı!", type: "success" });
        fetchData();
      } else {
        setActionMessage({ text: data.error || "Aksiyon başarısız.", type: "error" });
      }
    } catch (err) {
      setActionMessage({ text: "Ağ bağlantı hatası.", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Edit actions
  const startEdit = (pat: RecentPattern) => {
    setEditPattern(pat);
    setEditForm({
      patternName: pat.patternName,
      category: pat.category || "",
      hookType: pat.hookType || "",
      emotion: pat.emotion || "",
      viralityTrigger: pat.viralityTrigger || "",
      exampleGood: pat.exampleGood || "",
      exampleBad: pat.exampleBad || "",
      structureJsonStr: pat.structureJson ? JSON.stringify(pat.structureJson, null, 2) : "{}"
    });
  };

  const handleSaveEdit = async () => {
    if (!editPattern) return;
    if (!editForm.patternName.trim()) {
      setActionMessage({ text: "Pattern adı boş bırakılamaz.", type: "error" });
      return;
    }

    let parsedStructure: any = {};
    try {
      parsedStructure = JSON.parse(editForm.structureJsonStr);
    } catch {
      setActionMessage({ text: "Geçersiz Structure JSON formatı.", type: "error" });
      return;
    }

    setActionLoading("save-edit");
    try {
      const res = await fetch(`/api/growth/pattern-library/${editPattern.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patternName: editForm.patternName,
          category: editForm.category,
          hookType: editForm.hookType,
          emotion: editForm.emotion,
          viralityTrigger: editForm.viralityTrigger,
          exampleGood: editForm.exampleGood,
          exampleBad: editForm.exampleBad,
          structureJson: parsedStructure
        })
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ text: "Pattern başarıyla güncellendi!", type: "success" });
        setEditPattern(null);
        fetchData();
      } else {
        setActionMessage({ text: data.error || "Güncelleme başarısız.", type: "error" });
      }
    } catch (err) {
      setActionMessage({ text: "Ağ bağlantı hatası.", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  const getScoreBadgeColor = (score: number) => {
    if (score >= 75) return { bg: "color-mix(in srgb, var(--accent) 14%, transparent)", text: "var(--accent-text)" };
    if (score >= 50) return { bg: "color-mix(in srgb, var(--accent-2-text) 14%, transparent)", text: "var(--accent-2-text)" };
    return { bg: "color-mix(in srgb, var(--danger) 14%, transparent)", text: "var(--danger)" };
  };

  // Get distinct categories & hook types for filters from patterns
  const categories = Array.from(new Set(patterns.map((p) => p.category).filter(Boolean)));
  const hookTypes = Array.from(new Set(patterns.map((p) => p.hookType).filter(Boolean)));

  return (
    <div style={{ width: "100%", position: "relative" }}>
      <PageHeader
        eyebrow="ÖĞREN"
        title="Pattern Kütüphanesi"
        subtitle="Kaydedilmiş viral pattern’leri yönet, başarı skorlarını izle ve hesap bazlı içerik formatlarını düzenle."
        meta={
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <BookOpen size={15} strokeWidth={1.8} style={{ color: "var(--text-muted)" }} />
              <strong className="tnum" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                {summary.totalPatterns}
              </strong>{" "}
              pattern
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <CheckCircle2 size={15} strokeWidth={1.8} style={{ color: "var(--green)" }} />
              <strong className="tnum" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                {summary.activePatterns}
              </strong>{" "}
              aktif
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <TrendingUp size={15} strokeWidth={1.8} style={{ color: "var(--accent-2-text)" }} />
              ort. skor{" "}
              <strong className="tnum" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                %{summary.averageSuccessScore}
              </strong>
            </span>
          </>
        }
      />

      {/* Action Message Toast */}
      {actionMessage && (
        <div style={{
          padding: "11px 16px",
          borderRadius: "var(--radius-md)",
          fontSize: "var(--text-sm)",
          marginBottom: "var(--space-4)",
          background: actionMessage.type === "success"
            ? "color-mix(in srgb, var(--green) 12%, transparent)"
            : "color-mix(in srgb, var(--danger) 12%, transparent)",
          color: actionMessage.type === "success" ? "var(--green)" : "var(--danger)",
          border: `1px solid ${actionMessage.type === "success"
            ? "color-mix(in srgb, var(--green) 30%, transparent)"
            : "color-mix(in srgb, var(--danger) 30%, transparent)"}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
            {actionMessage.type === "success"
              ? <CheckCircle2 size={16} strokeWidth={2} />
              : <X size={16} strokeWidth={2} />}
            {actionMessage.text}
          </span>
          <button
            onClick={() => setActionMessage(null)}
            style={{ background: "transparent", border: "none", color: "currentColor", cursor: "pointer", display: "inline-flex", padding: 2 }}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))",
        gap: "var(--space-3)",
        marginBottom: "var(--space-6)"
      }}>
        {[
          { label: "Toplam Pattern", val: summary.totalPatterns, icon: <BookOpen size={16} strokeWidth={1.8} /> },
          { label: "Aktif Pattern", val: summary.activePatterns, tone: "up" as const, icon: <CheckCircle2 size={16} strokeWidth={1.8} /> },
          { label: "Pasif Pattern", val: summary.inactivePatterns, tone: "neutral" as const, icon: <PauseCircle size={16} strokeWidth={1.8} /> },
          { label: "Ortalama Başarı", val: `%${summary.averageSuccessScore}`, accent: true, icon: <TrendingUp size={16} strokeWidth={1.8} /> },
          { label: "Toplam Kullanım", val: `${summary.totalUsageCount} kez`, icon: <Zap size={16} strokeWidth={1.8} /> },
          { label: "Lider Pattern", val: summary.topPatternName.slice(0, 15) + (summary.topPatternName.length > 15 ? "…" : ""), accent: true, icon: <Crown size={16} strokeWidth={1.8} /> }
        ].map((item, idx) => (
          <MetricCard
            key={idx}
            label={item.label}
            value={item.val}
            icon={item.icon}
            accent={item.accent}
            delta={item.tone ? (item.tone === "up" ? "öğrenme aktif" : "beklemede") : undefined}
            deltaTone={item.tone}
          />
        ))}
      </div>

      {/* Filter Bar */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        marginBottom: 20,
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center"
      }}>
        {/* Account Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>Hesap</label>
          <select
            value={accountHandle}
            onChange={(e) => setAccountHandle(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              color: "var(--text-primary)",
              padding: "4px 8px",
              fontSize: 11,
              outline: "none"
            }}
          >
            <option value="all">Tüm Hesaplar</option>
            <option value="grafikcem">@grafikcem</option>
            <option value="maskulenkod">@maskulenkod</option>
          </select>
        </div>

        {/* Status Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>Durum</label>
          <select
            value={activeStatus}
            onChange={(e) => setActiveStatus(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              color: "var(--text-primary)",
              padding: "4px 8px",
              fontSize: 11,
              outline: "none"
            }}
          >
            <option value="all">Tüm Durumlar</option>
            <option value="active">Aktifler</option>
            <option value="inactive">Pasifler</option>
          </select>
        </div>

        {/* Category Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>Kategori</label>
          <select
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              color: "var(--text-primary)",
              padding: "4px 8px",
              fontSize: 11,
              outline: "none"
            }}
          >
            <option value="all">Tüm Kategoriler</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Hook Type Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>Hook Tipi</label>
          <select
            value={hookTypeInput}
            onChange={(e) => setHookTypeInput(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              color: "var(--text-primary)",
              padding: "4px 8px",
              fontSize: 11,
              outline: "none"
            }}
          >
            <option value="all">Tüm Hook Tipleri</option>
            {hookTypes.map((ht) => (
              <option key={ht} value={ht}>{ht}</option>
            ))}
          </select>
        </div>

        {/* Sort Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>Sırala</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              color: "var(--text-primary)",
              padding: "4px 8px",
              fontSize: 11,
              outline: "none"
            }}
          >
            <option value="successScore">Başarı Skoru (En Yüksek)</option>
            <option value="usageCount">Kullanım Sayısı (En Yüksek)</option>
            <option value="createdAt">Kayıt Tarihi (En Yeni)</option>
            <option value="updatedAt">Güncelleme Tarihi (En Yeni)</option>
          </select>
        </div>

        {/* Search */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 150 }}>
          <label style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>Metin Arama</label>
          <input
            type="text"
            placeholder="Pattern adı veya iyi hook ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              color: "var(--text-primary)",
              padding: "4px 8px",
              fontSize: 11,
              outline: "none"
            }}
          />
        </div>

        {/* Reset button */}
        <button
          onClick={() => {
            setAccountHandle("all");
            setActiveStatus("all");
            setCategoryInput("all");
            setHookTypeInput("all");
            setSearch("");
            setSort("successScore");
          }}
          style={{
            alignSelf: "flex-end",
            padding: "5px 10px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 5,
            color: "var(--text-secondary)",
            fontSize: 11,
            cursor: "pointer",
            height: 25
          }}
        >
          Sıfırla
        </button>
      </div>

      {/* Pattern Cards Grid */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "var(--space-3)" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={172} style={{ borderRadius: "var(--radius-xl)" }} />
          ))}
        </div>
      ) : patterns.length === 0 ? (
        <Card variant="quiet">
          <EmptyState
            icon={<Gem size={22} strokeWidth={1.8} />}
            title="Henüz pattern verisi bulunmuyor"
            description="Feedback API veya Training Center UI üzerinden saved_as_pattern kullanıldığında öğrenilen pattern’ler burada listelenir."
          />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 12 }}>
          {patterns.map((pat) => {
            const scoreColor = getScoreBadgeColor(pat.successScore);
            return (
              <Card key={pat.id} padded={false} interactive style={{
                padding: "var(--space-4)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span className="tnum" style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--accent-text)" }}>@{pat.accountHandle}</span>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: "var(--text-2xs)",
                      fontWeight: 600,
                      padding: "2px 6px",
                      borderRadius: "var(--radius-sm)",
                      background: pat.isActive
                        ? "color-mix(in srgb, var(--green) 12%, transparent)"
                        : "var(--bg-hover)",
                      color: pat.isActive ? "var(--green)" : "var(--text-muted)"
                    }}>
                      <span style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: pat.isActive ? "var(--green)" : "var(--text-muted)"
                      }} />
                      {pat.isActive ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span className="tnum" style={{
                      fontSize: "var(--text-2xs)",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "var(--radius-sm)",
                      background: scoreColor.bg,
                      color: scoreColor.text
                    }}>
                      %{pat.successScore} Başarı
                    </span>
                    <span className="tnum" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-2xs)", background: "var(--bg-hover)", color: "var(--text-secondary)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>
                      <Zap size={11} strokeWidth={2} /> {pat.usageCount} kez
                    </span>
                  </div>
                </div>

                {/* Body Content */}
                <div>
                  <h3 className="font-display" style={{ fontSize: "var(--text-md)", fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-primary)", letterSpacing: "-0.01em", lineHeight: 1.25 }}>{pat.patternName}</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                    {pat.category && <span style={{ fontSize: "var(--text-2xs)", background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>{pat.category}</span>}
                    {pat.hookType && <span style={{ fontSize: "var(--text-2xs)", background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--blue)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>Hook: {pat.hookType}</span>}
                    {pat.emotion && <span style={{ fontSize: "var(--text-2xs)", background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>Duygu: {pat.emotion}</span>}
                  </div>
                  {pat.viralityTrigger && (
                    <p style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 8px 0", fontSize: "var(--text-xs)", color: "var(--accent-2-text)", fontWeight: 600 }}>
                      <Flame size={13} strokeWidth={2} style={{ flexShrink: 0 }} /> {pat.viralityTrigger}
                    </p>
                  )}
                </div>

                {/* Previews */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-xs)" }}>
                  {pat.exampleGood && (
                    <div>
                      <span className="eyebrow" style={{ color: "var(--text-muted)" }}>İyi Hook Önizleme</span>
                      <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", background: "var(--bg-base)", border: "1px solid var(--border)", padding: "5px 8px", borderRadius: "var(--radius-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: "italic" }}>
                        &ldquo;{pat.exampleGood}&rdquo;
                      </p>
                    </div>
                  )}
                </div>

                {/* Actions Grid */}
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 4,
                  marginTop: 6,
                  borderTop: "1px solid var(--border)",
                  paddingTop: 10,
                  alignItems: "center"
                }}>
                  <button
                    onClick={() => setActiveDetail(pat)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: "transparent",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "4px 8px",
                      fontSize: "var(--text-2xs)",
                      cursor: "pointer",
                      transition: "border-color var(--duration-fast) var(--ease-out)"
                    }}
                  >
                    <Search size={12} strokeWidth={2} /> Detay
                  </button>

                  <button
                    onClick={() => startEdit(pat)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: "transparent",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "4px 8px",
                      fontSize: "var(--text-2xs)",
                      cursor: "pointer"
                    }}
                  >
                    <Pencil size={12} strokeWidth={2} /> Düzenle
                  </button>

                  <button
                    onClick={() => handleToggleActive(pat)}
                    disabled={actionLoading === `${pat.id}-active`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: pat.isActive
                        ? "color-mix(in srgb, var(--danger) 8%, transparent)"
                        : "color-mix(in srgb, var(--green) 8%, transparent)",
                      color: pat.isActive ? "var(--danger)" : "var(--green)",
                      border: `1px solid ${pat.isActive
                        ? "color-mix(in srgb, var(--danger) 22%, transparent)"
                        : "color-mix(in srgb, var(--green) 22%, transparent)"}`,
                      borderRadius: "var(--radius-sm)",
                      padding: "4px 8px",
                      fontSize: "var(--text-2xs)",
                      cursor: "pointer"
                    }}
                  >
                    {pat.isActive ? <PauseCircle size={12} strokeWidth={2} /> : <CheckCircle2 size={12} strokeWidth={2} />}
                    {pat.isActive ? "Pasif Yap" : "Aktif Et"}
                  </button>

                  <button
                    onClick={() => handleIncrementUsage(pat)}
                    disabled={actionLoading === `${pat.id}-usage`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: "transparent",
                      color: "var(--accent-text)",
                      border: "1px solid var(--accent-border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "4px 8px",
                      fontSize: "var(--text-2xs)",
                      cursor: "pointer",
                      fontVariantNumeric: "tabular-nums"
                    }}
                  >
                    <Plus size={12} strokeWidth={2} /> Kullanım
                  </button>

                  {/* Score adjust buttons */}
                  <div style={{ display: "flex", gap: 1, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                    <button
                      onClick={() => handleAdjustScore(pat, 5)}
                      disabled={actionLoading === `${pat.id}-score`}
                      className="tnum"
                      style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "var(--bg-base)", border: "none", color: "var(--green)", padding: "3px 7px", fontSize: "var(--text-2xs)", fontWeight: 600, cursor: "pointer" }}
                    >
                      <ArrowUp size={11} strokeWidth={2.4} /> 5
                    </button>
                    <button
                      onClick={() => handleAdjustScore(pat, -5)}
                      disabled={actionLoading === `${pat.id}-score`}
                      className="tnum"
                      style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "var(--bg-base)", border: "none", borderLeft: "1px solid var(--border)", color: "var(--danger)", padding: "3px 7px", fontSize: "var(--text-2xs)", fontWeight: 600, cursor: "pointer" }}
                    >
                      <ArrowDown size={11} strokeWidth={2.4} /> 5
                    </button>
                  </div>

                  {/* Generate Button Placeholder */}
                  <button
                    disabled
                    title="Draft Generator Sprint 10'da aktif olacak."
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      marginLeft: "auto",
                      background: "transparent",
                      color: "var(--text-muted)",
                      border: "1px dashed var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "4px 8px",
                      fontSize: "var(--text-2xs)",
                      cursor: "not-allowed"
                    }}
                  >
                    <Zap size={12} strokeWidth={2} /> Üret
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pattern Detail Drawer (Right-sided sliding drawer style mockup) */}
      {activeDetail && (
        <div style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "100%",
          maxWidth: 420,
          height: "100vh",
          background: "#0c0c0c",
          borderLeft: "1px solid var(--border)",
          boxShadow: "-8px 0 24px rgba(0,0,0,0.7)",
          zIndex: 200,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflowY: "auto"
        }}>
          {/* Drawer Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
            <div>
              <span style={{ fontSize: 10, color: "var(--accent)" }}>@{activeDetail.accountHandle}</span>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>{activeDetail.patternName}</h2>
            </div>
            <button
              onClick={() => setActiveDetail(null)}
              style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: 16, cursor: "pointer" }}
            >
              ✕
            </button>
          </div>

          {/* Drawer Body */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: 9, textTransform: "uppercase" }}>Category / Structure</span>
              <p style={{ margin: 2, color: "var(--text-primary)" }}>{activeDetail.category || "Yok"}</p>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: 9, textTransform: "uppercase" }}>Hook Type</span>
              <p style={{ margin: 2, color: "var(--text-primary)" }}>{activeDetail.hookType || "Yok"}</p>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: 9, textTransform: "uppercase" }}>Duygu (Emotion)</span>
              <p style={{ margin: 2, color: "var(--text-primary)" }}>{activeDetail.emotion || "Yok"}</p>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: 9, textTransform: "uppercase" }}>Virality Trigger</span>
              <p style={{ margin: 2, color: "var(--yellow)" }}>{activeDetail.viralityTrigger || "Yok"}</p>
            </div>

            <div>
              <span style={{ color: "var(--text-muted)", fontSize: 9, textTransform: "uppercase" }}>Structure JSON</span>
              <pre style={{
                background: "var(--bg-base)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: 10,
                fontSize: 10,
                color: "var(--accent)",
                overflowX: "auto",
                margin: "4px 0 0 0",
                fontFamily: "monospace"
              }}>
                {activeDetail.structureJson ? JSON.stringify(activeDetail.structureJson, null, 2) : "{}"}
              </pre>
            </div>

            <div>
              <span style={{ color: "var(--text-muted)", fontSize: 9, textTransform: "uppercase" }}>Example Good</span>
              <p style={{ margin: "4px 0 0 0", color: "var(--text-primary)", background: "rgba(225,29,72,0.03)", border: "1px dashed var(--accent-border)", padding: "8px 10px", borderRadius: 6, fontStyle: "italic", lineHeight: 1.5 }}>
                &ldquo;{activeDetail.exampleGood || "Örnek girilmemiş."}&rdquo;
              </p>
            </div>

            <div>
              <span style={{ color: "var(--text-muted)", fontSize: 9, textTransform: "uppercase" }}>Example Bad</span>
              <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)", background: "var(--bg-base)", border: "1px solid var(--border)", padding: "8px 10px", borderRadius: 6, fontStyle: "italic", lineHeight: 1.5 }}>
                &ldquo;{activeDetail.exampleBad || "Örnek girilmemiş."}&rdquo;
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pattern Edit Modal */}
      {editPattern && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100vh",
          background: "rgba(0,0,0,0.7)",
          zIndex: 210,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16
        }}>
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            width: "100%",
            maxWidth: 500,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 12px 36px rgba(0,0,0,0.6)"
          }}>
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                ✏️ Pattern Düzenle: {editPattern.patternName}
              </h2>
              <button
                onClick={() => setEditPattern(null)}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: 16, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Modal Form fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Pattern Adı *</label>
                <input
                  type="text"
                  value={editForm.patternName}
                  onChange={(e) => setEditForm({ ...editForm, patternName: e.target.value })}
                  style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", color: "var(--text-primary)", outline: "none" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <label style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Kategori</label>
                  <input
                    type="text"
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", color: "var(--text-primary)", outline: "none" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <label style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Hook Tipi</label>
                  <input
                    type="text"
                    value={editForm.hookType}
                    onChange={(e) => setEditForm({ ...editForm, hookType: e.target.value })}
                    style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", color: "var(--text-primary)", outline: "none" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <label style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Duygu (Emotion)</label>
                  <input
                    type="text"
                    value={editForm.emotion}
                    onChange={(e) => setEditForm({ ...editForm, emotion: e.target.value })}
                    style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", color: "var(--text-primary)", outline: "none" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <label style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Virality Trigger</label>
                  <input
                    type="text"
                    value={editForm.viralityTrigger}
                    onChange={(e) => setEditForm({ ...editForm, viralityTrigger: e.target.value })}
                    style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", color: "var(--text-primary)", outline: "none" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Structure JSON (String olarak düzenleyin)</label>
                <textarea
                  value={editForm.structureJsonStr}
                  rows={4}
                  onChange={(e) => setEditForm({ ...editForm, structureJsonStr: e.target.value })}
                  style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", color: "var(--accent)", outline: "none", fontFamily: "monospace", fontSize: 11 }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Example Good</label>
                <textarea
                  value={editForm.exampleGood}
                  rows={2}
                  onChange={(e) => setEditForm({ ...editForm, exampleGood: e.target.value })}
                  style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", color: "var(--text-primary)", outline: "none", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Example Bad</label>
                <textarea
                  value={editForm.exampleBad}
                  rows={2}
                  onChange={(e) => setEditForm({ ...editForm, exampleBad: e.target.value })}
                  style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", color: "var(--text-primary)", outline: "none", resize: "vertical" }}
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 4 }}>
              <button
                onClick={() => setEditPattern(null)}
                style={{
                  background: "transparent",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer"
                }}
              >
                İptal
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={actionLoading === "save-edit"}
                style={{
                  background: "var(--accent)",
                  color: "#000",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                {actionLoading === "save-edit" ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
