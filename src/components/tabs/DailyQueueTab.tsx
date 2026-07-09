"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Layers,
  PenLine,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Target,
  CalendarDays,
  Inbox,
  Loader2,
  RotateCcw,
  Archive,
  Save,
  Send,
  Copy,
  Check,
  X,
  Bot,
  Drama,
  Anchor,
  Dumbbell,
  Search,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import { PageHeader, Card, EmptyState, KanbanBoard, KanbanCard, type KanbanTone } from "../ui";
import OperatorReadinessGate from "../gate/OperatorReadinessGate";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { fetchJson } from "@/lib/utils/safeFetch";
import { NEXT_MOVE_LABELS_TR, type NextMove } from "@/lib/ai/next-move";
import type { Leak } from "@/lib/growth-engine/leak-detector";

type CriticScores = {
  publishScore: number;
  personaMatchScore: number;
  hookStrengthScore: number;
  clarityScore: number;
  viralityScore: number;
  noveltyScore: number;
  riskScore: number;
  publishRecommendation: string;
  rewriteSuggestion: string;
  angle: string;
  reasoning: string;
  patternUsed?: string;
  isEstimatedScore?: boolean;
  writerModel?: string;
  judgeModel?: string;
  finalEditorModel?: string;
  modelFallbackUsed?: boolean;
  modelFallbackReason?: string;
  // Faz B: content-quality "path" + leak signals.
  payoff?: NextMove;
  ctaPresent?: boolean;
  leaks?: Leak[];
  leakCount?: number;
  // Faz C: content atomization linkage (stored in scores JSON, not a DB column).
  packageId?: string | null;
  packageRole?: string | null;
};

type QueueItem = {
  id: string;
  accountId: string;
  content: string;
  editedContent: string | null;
  draftType: string;
  mode: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  accountHandle: string;
  displayName: string;
  scoresParsed: CriticScores;
  estimatedCostUsd: number;
  usedMock: boolean;
};

type Summary = {
  totalItems: number;
  draftItems: number;
  approvedItems: number;
  rejectedItems: number;
  scheduledItems: number;
  highRiskItems: number;
  averagePublishScore: number;
  todayItems: number;
  activeBacklogCount: number;
  accountsStatus?: {
    id: string;
    handle: string;
    displayName: string;
    automationEnabled: boolean;
    lastScanAt: string | null;
    todayItems: number;
  }[];
};

export default function DailyQueueTab() {
  const [summary, setSummary] = useState<Summary>({
    totalItems: 0,
    draftItems: 0,
    approvedItems: 0,
    rejectedItems: 0,
    scheduledItems: 0,
    highRiskItems: 0,
    averagePublishScore: 0,
    todayItems: 0,
    activeBacklogCount: 0
  });
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Filters
  const [accountHandle, setAccountHandle] = useState("all");
  const [status, setStatus] = useState("active");
  const [dateRange, setDateRange] = useState("today");
  const [risk, setRisk] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("createdAt");

  // Selected item for Detail Modal/Drawer
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [detailContent, setDetailContent] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackReason, setFeedbackReason] = useState("");

  const showToast = (text: string, type: "success" | "error") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        accountHandle,
        status,
        dateRange,
        risk,
        search,
        sort
      });
      const data = await fetchJson<any>(`/api/growth/daily-queue?${q.toString()}`);
      if (data.success) {
        setSummary(data.summary);
        setItems(data.items);
        
        // Sync selectedItem if it is currently open in detail modal
        if (selectedItem) {
          const updated = data.items.find((i: QueueItem) => i.id === selectedItem.id);
          if (updated) {
            setSelectedItem(updated);
          } else {
            setSelectedItem(null);
          }
        }
      } else {
        showToast(data.error || "Veriler alınamadı.", "error");
      }
    } catch {
      showToast("Sunucuyla iletişim kurulurken bir hata oluştu.", "error");
    } finally {
      setLoading(false);
    }
  }, [accountHandle, status, dateRange, risk, search, sort, selectedItem]);

  useEffect(() => {
    fetchQueue();
     
  }, [accountHandle, status, dateRange, risk, search, sort]);

  const handleSaveEdit = async (itemId: string, contentText: string) => {
    if (!contentText.trim()) {
      showToast("Taslak içeriği boş olamaz.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const data = await fetchJson<any>(`/api/growth/daily-queue/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentText })
      });
      if (data.success) {
        showToast("Taslak içeriği başarıyla güncellendi.", "success");
        // Update local list
        setItems((prev) =>
          prev.map((item) => (item.id === itemId ? { ...item, ...data.item } : item))
        );
        if (selectedItem?.id === itemId) {
          setSelectedItem((prev) => (prev ? { ...prev, content: contentText } : null));
        }
        fetchQueue();
      } else {
        showToast(data.error || "Güncelleme başarısız oldu.", "error");
      }
    } catch {
      showToast("Taslak güncellenirken sunucu hatası oluştu.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (itemId: string, newStatus: "draft" | "approved" | "rejected" | "scheduled" | "manual_published") => {
    setIsSaving(true);
    try {
      const data = await fetchJson<any>(`/api/growth/daily-queue/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      if (data.success) {
        showToast(`Durum "${newStatus}" olarak güncellendi.`, "success");
        fetchQueue();
      } else {
        showToast(data.error || "Durum güncellenemedi.", "error");
      }
    } catch {
      showToast("Durum güncellenirken sunucu hatası oluştu.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyAndOpenX = async (text: string) => {
    if (!text || !text.trim()) {
      showToast("İçerik boş olduğundan X açılamadı.", "error");
      return;
    }
    const success = await copyToClipboard(text);
    if (success) {
      showToast("Metin kopyalandı, X açılıyor.", "success");
      const intentUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
      window.open(intentUrl, "_blank", "noopener,noreferrer");
    } else {
      showToast("Kopyalama başarısız oldu, X açılmadı.", "error");
    }
  };

  const handleScheduleSubmit = async (itemId: string) => {
    if (!scheduleDate) {
      showToast("Lütfen geçerli bir tarih ve saat seçin.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const formattedDate = new Date(scheduleDate).toISOString();
      const data = await fetchJson<any>(`/api/growth/daily-queue/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "scheduled",
          scheduledAt: formattedDate
        })
      });
      if (data.success) {
        showToast("Yayın zamanı başarıyla planlandı.", "success");
        setShowScheduleForm(false);
        fetchQueue();
      } else {
        showToast(data.error || "Planlama hatası.", "error");
      }
    } catch {
      showToast("Sunucu hatası nedeniyle planlama başarısız.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFeedback = async (
    itemId: string,
    feedbackType: "approved" | "rejected" | "edited" | "not_my_tone" | "hook_weak" | "too_ai" | "make_stronger" | "make_clearer",
    editedText?: string
  ) => {
    setIsSaving(true);
    try {
      const data = await fetchJson<any>(`/api/growth/daily-queue/${itemId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackType,
          editedContent: editedText,
          reason: feedbackReason || `Editor action: ${feedbackType}`
        })
      });
      if (data.success) {
        showToast("Geri bildirim başarıyla kaydedildi.", "success");
        setFeedbackReason("");
        fetchQueue();
      } else {
        showToast(data.error || "Geri bildirim kaydedilemedi.", "error");
      }
    } catch {
      showToast("Geri bildirim gönderilirken bağlantı hatası oluştu.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRescore = async (itemId: string, textToScore: string) => {
    setIsSaving(true);
    try {
      const data = await fetchJson<any>(`/api/growth/daily-queue/${itemId}/rescore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: textToScore })
      });
      if (data.success) {
        showToast("Draft Critic analizi yenilendi.", "success");
        fetchQueue();
      } else {
        showToast(data.error || "Yeniden puanlama başarısız oldu.", "error");
      }
    } catch {
      showToast("Sunucu bağlantı hatası.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async (text: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      showToast("Metin panoya kopyalandı!", "success");
    } else {
      showToast("Kopyalama başarısız.", "error");
    }
  };

  const getStatusBadgeStyles = (statusVal: string) => {
    switch (statusVal) {
      case "approved":
        return {
          bg: "color-mix(in srgb, var(--accent) 12%, transparent)",
          border: "1px solid var(--accent-border)",
          text: "var(--accent-text)",
        };
      case "rejected":
        return {
          bg: "color-mix(in srgb, var(--danger) 14%, transparent)",
          border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
          text: "var(--danger)",
        };
      case "scheduled":
        return {
          bg: "color-mix(in srgb, var(--blue) 12%, transparent)",
          border: "1px solid color-mix(in srgb, var(--blue) 28%, transparent)",
          text: "var(--blue)",
        };
      case "published":
      case "manual_published":
        return {
          bg: "color-mix(in srgb, var(--green) 14%, transparent)",
          border: "1px solid color-mix(in srgb, var(--green) 28%, transparent)",
          text: "var(--green)",
        };
      case "new":
      case "draft":
      default:
        return { bg: "var(--bg-elevated)", border: "1px solid var(--border)", text: "var(--text-secondary)" };
    }
  };

  const getScoreBadgeColor = (score: number) => {
    if (score >= 75) return "var(--accent-text)";
    if (score >= 50) return "var(--yellow)";
    return "var(--danger)";
  };

  const getRiskBadgeColor = (score: number) => {
    if (score >= 70) return "var(--danger)";
    if (score >= 40) return "var(--yellow)";
    return "var(--green)";
  };

  const openDetail = (item: QueueItem) => {
    setSelectedItem(item);
    setDetailContent(item.editedContent || item.content);
    setScheduleDate(item.scheduledAt ? new Date(item.scheduledAt).toISOString().slice(0, 16) : "");
    setShowScheduleForm(false);
    setFeedbackReason("");
  };

  // Kanban: group the (already filtered) items by status into columns. Core
  // columns (Taslak/Onaylı/Planlandı) always render; published/rejected only
  // when populated. Click → same detail drawer as the list (no drag-and-drop).
  const KANBAN_COLS: { id: string; label: string; tone: KanbanTone; match: (s: string) => boolean; core?: boolean }[] = [
    { id: "draft", label: "Taslak", tone: "muted", match: (s) => s === "draft" || s === "new", core: true },
    { id: "approved", label: "Onaylı", tone: "green", match: (s) => s === "approved", core: true },
    { id: "scheduled", label: "Planlandı", tone: "blue", match: (s) => s === "scheduled", core: true },
    { id: "published", label: "Yayınlandı", tone: "accent", match: (s) => s === "published" || s === "manual_published" },
    { id: "rejected", label: "Reddedildi", tone: "danger", match: (s) => s === "rejected" },
  ];
  const kanbanColumns = KANBAN_COLS.map((c) => ({
    id: c.id,
    label: c.label,
    tone: c.tone,
    items: items.filter((i) => c.match(i.status)),
  })).filter((c, idx) => c.items.length > 0 || KANBAN_COLS[idx].core);

  const renderKanbanCard = (item: QueueItem) => {
    const score = item.scoresParsed?.publishScore ?? 75;
    const tone: KanbanTone = score >= 70 ? "green" : score >= 40 ? "yellow" : "danger";
    return (
      <KanbanCard
        key={item.id}
        priority={{ label: `Skor ${score}`, tone }}
        tag={{ label: `@${item.accountHandle}`, tone: "accent" }}
        title={(item.editedContent || item.content || "").replace(/@@/g, "").slice(0, 140)}
        meta={
          <>
            <span>{item.draftType}</span>
            <span>Risk {item.scoresParsed?.riskScore ?? 20}</span>
          </>
        }
        progress={{ done: score, total: 100 }}
        onClick={() => openDetail(item)}
      />
    );
  };

  return (
    <div style={{ width: "100%", paddingBottom: 60 }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 999,
          padding: "12px 18px",
          borderRadius: "var(--radius-md)",
          fontSize: "var(--text-sm)",
          fontWeight: 500,
          background: toast.type === "success" ? "var(--green)" : "var(--danger)",
          color: "var(--bg-base)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          animation: "slideIn 0.25s var(--ease-out)"
        }}>
          {toast.type === "success" ? <Check size={16} strokeWidth={2.2} /> : <X size={16} strokeWidth={2.2} />}
          <span>{toast.text}</span>
        </div>
      )}

      <PageHeader
        eyebrow="OPERASYON"
        title="Bugünkü Operasyon"
        subtitle={`${summary.todayItems} taslak bugün için hazır — onayla, düzenle, planla.`}
      />

      <OperatorReadinessGate />

      {/* Telemetry Summary Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: 10,
        marginBottom: 20
      }}>
        {[
          { label: "Toplam Taslak", val: summary.totalItems, icon: <Layers size={15} strokeWidth={1.9} /> },
          { label: "Yeni Taslak", val: summary.draftItems, icon: <PenLine size={15} strokeWidth={1.9} /> },
          { label: "Onaylı", val: summary.approvedItems, color: "var(--accent-text)", icon: <CheckCircle2 size={15} strokeWidth={1.9} /> },
          { label: "Planlandı", val: summary.scheduledItems, color: "var(--blue)", icon: <Clock size={15} strokeWidth={1.9} /> },
          { label: "Reddedildi", val: summary.rejectedItems, color: "var(--danger)", icon: <XCircle size={15} strokeWidth={1.9} /> },
          { label: "Yüksek Risk", val: summary.highRiskItems, color: summary.highRiskItems > 0 ? "var(--danger)" : undefined, icon: <AlertTriangle size={15} strokeWidth={1.9} /> },
          { label: "Ort. Skor", val: `${summary.averagePublishScore}/100`, color: getScoreBadgeColor(summary.averagePublishScore), icon: <Target size={15} strokeWidth={1.9} /> },
          { label: "Bugün", val: summary.todayItems, icon: <CalendarDays size={15} strokeWidth={1.9} /> }
        ].map((item, idx) => (
          <div key={idx} style={{
            background: "var(--gradient-surface), var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "12px 14px",
            boxShadow: "var(--highlight-top)"
          }}>
            <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)", marginBottom: 8 }}>
              <span style={{ display: "inline-flex", color: item.color || "var(--text-muted)" }}>{item.icon}</span>
              {item.label}
            </div>
            <div className="font-display tnum" style={{ fontSize: "var(--text-xl)", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: item.color || "var(--text-primary)" }}>
              {item.val}
            </div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div style={{
        background: "var(--gradient-surface), var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 14,
        marginBottom: 20,
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        boxShadow: "var(--highlight-top)"
      }}>
        {/* Account Selector (Prominent Tabs) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
          <label className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 4 }}>Hesap Seçimi</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { id: "all", label: "Tüm Hesaplar" },
              { id: "grafikcem", label: "@grafikcem" },
              { id: "maskulenkod", label: "@maskulenkod" }
            ].map(acc => (
              <button
                key={acc.id}
                onClick={() => setAccountHandle(acc.id)}
                style={{
                  flex: 1,
                  padding: "9px 16px",
                  background: accountHandle === acc.id ? "var(--gradient-accent), var(--bg-surface)" : "var(--bg-base)",
                  border: `1px solid ${accountHandle === acc.id ? "var(--accent-border)" : "var(--border)"}`,
                  color: accountHandle === acc.id ? "var(--accent-text)" : "var(--text-secondary)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--text-base)",
                  fontWeight: accountHandle === acc.id ? 500 : 500,
                  cursor: "pointer",
                  boxShadow: accountHandle === acc.id ? "var(--highlight-top)" : "none",
                  transition: "background 0.15s var(--ease-out), border-color 0.15s var(--ease-out), color 0.15s"
                }}
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filters Divider */}
        <div style={{ width: "100%", height: 1, background: "var(--border)", margin: "4px 0" }} />

        {/* Status Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <label className="eyebrow" style={{ color: "var(--text-muted)" }}>Durum</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              padding: "6px 8px",
              fontSize: "var(--text-xs)",
              outline: "none",
              cursor: "pointer",
              maxWidth: "100%"
            }}
          >
            <option value="active">Aktif İşler (Önerilen)</option>
            <option value="all">Tüm Durumlar</option>
            <option value="draft">Taslak (Yeni)</option>
            <option value="approved">Onaylı</option>
            <option value="rejected">Reddedildi</option>
            <option value="scheduled">Planlandı</option>
            <option value="published">Yayınlandı</option>
            <option value="manual_published">Manuel Yayınlandı</option>
          </select>
        </div>

        {/* Date Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <label className="eyebrow" style={{ color: "var(--text-muted)" }}>Zaman Aralığı</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              padding: "6px 8px",
              fontSize: "var(--text-xs)",
              outline: "none",
              cursor: "pointer",
              maxWidth: "100%"
            }}
          >
            <option value="all">Tüm Zamanlar</option>
            <option value="today">Bugün</option>
            <option value="tomorrow">Yarın</option>
            <option value="last_7_days">Geçmiş 7 Gün</option>
            <option value="next_7_days">Gelecek 7 Gün</option>
          </select>
        </div>

        {/* Risk Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <label className="eyebrow" style={{ color: "var(--text-muted)" }}>Risk Derecesi</label>
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              padding: "6px 8px",
              fontSize: "var(--text-xs)",
              outline: "none",
              cursor: "pointer",
              maxWidth: "100%"
            }}
          >
            <option value="all">Tüm Riskler</option>
            <option value="low">Düşük (&lt; 40)</option>
            <option value="medium">Orta (40 - 69)</option>
            <option value="high">Yüksek (&gt;= 70)</option>
          </select>
        </div>

        {/* Search */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 150 }}>
          <label className="eyebrow" style={{ color: "var(--text-muted)" }}>Arama</label>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search size={14} strokeWidth={1.9} style={{ position: "absolute", left: 9, color: "var(--text-muted)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="İçerik ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg-base)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                padding: "6px 8px 6px 28px",
                fontSize: "var(--text-xs)",
                outline: "none",
                boxSizing: "border-box"
              }}
            />
          </div>
        </div>

        {/* Sort */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <label className="eyebrow" style={{ color: "var(--text-muted)" }}>Sıralama</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              padding: "6px 8px",
              fontSize: "var(--text-xs)",
              outline: "none",
              cursor: "pointer",
              maxWidth: "100%"
            }}
          >
            <option value="createdAt">Yaratılış Tarihi</option>
            <option value="scheduledAt">Planlanma Tarihi</option>
            <option value="publishScore">Yayın Skoru</option>
            <option value="riskScore">Risk Skoru</option>
          </select>
        </div>

        {/* Reset button */}
        <button
          onClick={() => {
            setAccountHandle("all");
            setStatus("active");
            setDateRange("today");
            setRisk("all");
            setSearch("");
            setSort("createdAt");
          }}
          style={{
            alignSelf: "flex-end",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 12px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-secondary)",
            fontSize: "var(--text-xs)",
            cursor: "pointer",
            transition: "background 0.15s var(--ease-out), border-color 0.15s"
          }}
        >
          <RotateCcw size={13} strokeWidth={1.9} />
          Sıfırla
        </button>
      </div>

      {/* Main List Layout */}
      {summary.accountsStatus && summary.accountsStatus.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {summary.accountsStatus.map(acc => (
            <div key={acc.id} style={{
              background: "var(--gradient-surface), var(--bg-surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)", padding: "14px 16px", flex: "1 1 200px", minWidth: 200,
              boxShadow: "var(--highlight-top)"
            }}>
              <div style={{ fontSize: "var(--text-base)", fontWeight: 500, color: "var(--text-primary)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span className="font-display" style={{ letterSpacing: "-0.01em" }}>{acc.displayName.startsWith('@') ? acc.displayName : `@${acc.displayName}`}</span>
                {acc.automationEnabled ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--green)", fontSize: "var(--text-2xs)", fontWeight: 500, background: "color-mix(in srgb, var(--green) 12%, transparent)", padding: "3px 8px", borderRadius: "var(--radius-sm)", border: "1px solid color-mix(in srgb, var(--green) 28%, transparent)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--green) 22%, transparent)" }} />
                    Oto Açık
                  </span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--danger)", fontSize: "var(--text-2xs)", fontWeight: 500, background: "color-mix(in srgb, var(--danger) 12%, transparent)", padding: "3px 8px", borderRadius: "var(--radius-sm)", border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--danger)" }} />
                    Oto Kapalı
                  </span>
                )}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 10, display: "flex", alignItems: "center", gap: 5 }}>
                <Layers size={13} strokeWidth={1.9} />
                Bugün: <strong className="tnum" style={{ color: "var(--text-secondary)" }}>{acc.todayItems} Taslak</strong>
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
                <Clock size={13} strokeWidth={1.9} />
                Son Tarama: {acc.lastScanAt ? new Date(acc.lastScanAt).toLocaleString('tr-TR', {hour: '2-digit', minute: '2-digit'}) : "Hiç taranmadı"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View toggle: List | Kanban */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <div style={{ display: "inline-flex", gap: 2, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 3 }}>
          {([["list", "Liste"], ["kanban", "Pano"]] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "5px 14px",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontSize: "var(--text-xs)",
                fontWeight: 500,
                fontFamily: "inherit",
                background: view === v ? "var(--accent)" : "transparent",
                color: view === v ? "var(--accent-fg)" : "var(--text-secondary)",
                transition: "background .15s var(--ease-out), color .15s",
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "80px 0", textAlign: "center", color: "var(--text-muted)" }}>
          ⏳ Kuyruk verileri yükleniyor...
        </div>
      ) : items.length === 0 ? (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "60px 40px",
          textAlign: "center",
          color: "var(--text-muted)"
        }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>Bugün için hazır taslak bulunmuyor.</div>
          <div style={{ fontSize: 12, maxWidth: 450, margin: "0 auto 16px auto" }}>
            {dateRange === "today" && (
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 6, marginBottom: 12, border: "1px solid var(--border)" }}>
                🗂️ <strong>Eski aktif backlog:</strong> {summary.activeBacklogCount ?? 0} taslak bulunuyor.
              </div>
            )}
            {dateRange === "today" 
              ? "Eğer bugünkü taslaklar üretilmediyse otomasyon kapalı olabilir, günlük limitiniz dolmuş olabilir veya worker henüz çalışmamış olabilir."
              : "Bu filtreye uygun aktif taslak bulunmuyor. Lütfen filtrelerinizi kontrol edin."
            }
            <br/><br/>
            Yukarıdaki <strong>Sistem Hazırlık Panosu</strong> kartından otomasyonu ve worker durumunu kontrol edebilirsiniz.
          </div>
          <button
            onClick={() => {
              setAccountHandle("all");
              setStatus("active");
              setDateRange("all");
              setRisk("all");
              setSearch("");
            }}
            style={{
              padding: "6px 14px",
              background: "var(--accent-tint-12)",
              border: "1px solid var(--accent-border)",
              borderRadius: 6,
              color: "var(--accent)",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 500
            }}
          >
            Backlog'u Göster (Tüm Zamanlar)
          </button>
        </div>
      ) : view === "kanban" ? (
        <KanbanBoard columns={kanbanColumns} renderCard={renderKanbanCard} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          {items.map((item) => {
            const statusStyle = getStatusBadgeStyles(item.status);
            const activeText = (item.editedContent || item.content || "").replace(/@@/g, "");
            const publishScore = item.scoresParsed?.publishScore ?? 75;
            const riskScore = item.scoresParsed?.riskScore ?? 20;
            const pMatch = item.scoresParsed?.personaMatchScore ?? 75;
            const hStrength = item.scoresParsed?.hookStrengthScore ?? 75;
            // Ön-yayın viral skoru (F5d): judge sinyallerinden tek 0-10 tahmin.
            const viralityScore = item.scoresParsed?.viralityScore ?? publishScore;
            const viralScore10 =
              Math.round(((viralityScore + hStrength + publishScore) / 3 / 10) * 10) / 10;

            return (
              <div
                key={item.id}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  transition: "border-color 0.15s, transform 0.1s",
                  cursor: "pointer"
                }}
                onClick={() => {
                  setSelectedItem(item);
                  setDetailContent(item.editedContent || item.content);
                  setScheduleDate(item.scheduledAt ? new Date(item.scheduledAt).toISOString().slice(0, 16) : "");
                  setShowScheduleForm(false);
                  setFeedbackReason("");
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                {/* Card Top */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "var(--accent)" }}>@{item.accountHandle}</span>
                    <span style={{ fontSize: 9, background: "color-mix(in srgb, var(--status-info) 12%, transparent)", color: "var(--status-info)", padding: "1px 5px", borderRadius: 4, fontWeight: 500 }}>
                      {item.draftType}
                    </span>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 500,
                      padding: "1px 5px",
                      borderRadius: 4,
                      background: statusStyle.bg,
                      border: statusStyle.border,
                      color: statusStyle.text
                    }}>
                      {item.status === "new" ? "taslak" : item.status === "draft" ? "taslak" : item.status === "approved" ? "onaylı" : item.status === "scheduled" ? "planlandı" : item.status === "manual_published" ? "manuel paylaşıldı" : item.status}
                    </span>
                    {item.scheduledAt && (
                      <span style={{ fontSize: 9, color: "var(--yellow)", display: "flex", alignItems: "center", gap: 3 }}>
                        ⏰ {new Date(item.scheduledAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {new Date(item.createdAt).toLocaleDateString("tr-TR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                {/* Content Area */}
                <p style={{
                  margin: 0,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "var(--text-primary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word"
                }}>
                  {activeText.length > 220 ? `${activeText.slice(0, 220)}...` : activeText}
                </p>

                {/* Card Bottom / Badges */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 6,
                  borderTop: "1px solid rgba(255,255,255,0.03)",
                  paddingTop: 8,
                  marginTop: 2
                }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {/* Ön-yayın viral skoru (F5d) — tek net 0-10 tahmin */}
                    <span
                      title="Ön-yayın viral skoru: hook + virality + publish sinyallerinden 0-10 tahmin"
                      style={{
                        fontSize: 10,
                        fontWeight: 500,
                        color: "var(--accent-text)",
                        background: "var(--accent-tint-12)",
                        border: "1px solid var(--accent-border)",
                        padding: "1px 7px",
                        borderRadius: "var(--radius-pill)",
                      }}
                    >
                      Viral {viralScore10.toFixed(1)}
                    </span>
                    {/* Angle / Mode */}
                    <span style={{ fontSize: 9, color: "var(--text-muted)", background: "rgba(255,255,255,0.04)", padding: "1px 5px", borderRadius: 4 }}>
                      {item.scoresParsed?.angle || "safe"}
                    </span>
                    <span style={{ fontSize: 9, color: "var(--text-muted)", background: "rgba(255,255,255,0.04)", padding: "1px 5px", borderRadius: 4 }}>
                      {item.mode}
                    </span>
                    {item.scoresParsed?.packageId && (
                      <span style={{ fontSize: 9, color: "var(--accent)", background: "rgba(255,255,255,0.04)", padding: "1px 5px", borderRadius: 4 }}>
                        PAKET{item.scoresParsed.packageRole && item.scoresParsed.packageRole !== "main" ? ` · ${item.scoresParsed.packageRole}` : ""}
                      </span>
                    )}
                    {(item.scoresParsed?.leakCount ?? 0) > 0 && (
                      <span style={{ fontSize: 9, color: "var(--yellow)", background: "rgba(255,255,255,0.04)", padding: "1px 5px", borderRadius: 4 }}>
                        ⚠ {item.scoresParsed?.leakCount} sızıntı
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Score:</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: getScoreBadgeColor(publishScore) }}>
                        {publishScore}
                      </span>
                      {item.scoresParsed?.isEstimatedScore && (
                        <span style={{ marginLeft: 2, fontSize: 8, background: "var(--bg-elevated)", padding: "1px 4px", borderRadius: 4, color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                          Tahmini Skor
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Risk Score:</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: getRiskBadgeColor(riskScore) }}>{riskScore}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Hook:</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: getScoreBadgeColor(hStrength) }}>{hStrength}</span>
                    </div>

                    <span style={{
                      fontSize: 9,
                      fontWeight: 500,
                      color: item.scoresParsed?.publishRecommendation === "publish" ? "var(--accent)" : "var(--yellow)"
                    }}>
                      [{item.scoresParsed?.publishRecommendation || "publish"}]
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Drawer (Overlay / Right panel) */}
      {selectedItem && (
        <div style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "100%",
          maxWidth: 500,
          height: "100%",
          background: "var(--bg-sunken)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "-10px 0 40px rgba(0,0,0,0.6)",
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          animation: "slideLeft 0.2s ease-out"
        }}>
          {/* Drawer Header */}
          <div style={{
            padding: 16,
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)" }}>@{selectedItem.accountHandle}</span>
                <span style={{ fontSize: 9, background: "color-mix(in srgb, var(--status-info) 12%, transparent)", color: "var(--status-info)", padding: "1px 4px", borderRadius: 3 }}>{selectedItem.draftType}</span>
                <span style={{ fontSize: 9, background: getStatusBadgeStyles(selectedItem.status).bg, color: getStatusBadgeStyles(selectedItem.status).text, padding: "1px 4px", borderRadius: 3 }}>
                  {selectedItem.status}
                </span>
              </div>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                ID: {selectedItem.id.slice(0, 12)}
              </span>
            </div>
            <button
              onClick={() => setSelectedItem(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                fontSize: 16,
                cursor: "pointer",
                padding: 4
              }}
            >
              ✕
            </button>
          </div>

          {/* Drawer Content (Scrollable) */}
          <div style={{ padding: 16, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Editor Textarea */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Taslak Metni</label>
              <textarea
                value={detailContent.replace(/@@/g, "")}
                onChange={(e) => setDetailContent(e.target.value)}
                rows={6}
                disabled={selectedItem.status === "published" || selectedItem.status === "manual_published"}
                style={{
                  width: "100%",
                  background: "var(--bg-base)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: 10,
                  color: "var(--text-primary)",
                  fontSize: 12,
                  lineHeight: 1.6,
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box"
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignSelf: "center", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                <span>Limit: 280 karakter</span>
                <span style={{ color: detailContent.length > 280 ? "var(--red)" : undefined }}>{detailContent.length}/280</span>
              </div>

              {/* Editor Save action */}
              {!(selectedItem.status === "published" || selectedItem.status === "manual_published") && (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button
                    onClick={() => handleSaveEdit(selectedItem.id, detailContent)}
                    disabled={isSaving}
                    style={{
                      flex: 1,
                      padding: "6px 12px",
                      background: "var(--accent-tint-12)",
                      border: "1px solid var(--accent-border)",
                      color: "var(--accent)",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer"
                    }}
                  >
                    💾 {isSaving ? "Kaydediliyor..." : "Metni Kaydet"}
                  </button>
                  


                  <button
                    onClick={() => handleRescore(selectedItem.id, detailContent)}
                    disabled={isSaving}
                    style={{
                      padding: "6px 12px",
                      background: "rgba(59,130,246,0.1)",
                      border: "1px solid rgba(59,130,246,0.3)",
                      color: "var(--status-info)",
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: "pointer"
                    }}
                  >
                    🎯 {isSaving ? "..." : "Yeniden Puanla"}
                  </button>
                </div>
              )}
            </div>

            {/* Critic Score Breakdown */}
            <div style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: 10
            }}>
              <h4 style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)", margin: "0 0 10px 0", textTransform: "uppercase" }}>
                AI Critic Analizi
              </h4>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { name: "Publish Score", val: selectedItem.scoresParsed?.publishScore ?? 75, color: getScoreBadgeColor(selectedItem.scoresParsed?.publishScore ?? 75) },
                  { name: "Risk Score", val: selectedItem.scoresParsed?.riskScore ?? 20, color: getRiskBadgeColor(selectedItem.scoresParsed?.riskScore ?? 20) },
                  { name: "Persona Match", val: selectedItem.scoresParsed?.personaMatchScore ?? 75, color: getScoreBadgeColor(selectedItem.scoresParsed?.personaMatchScore ?? 75) },
                  { name: "Hook Strength", val: selectedItem.scoresParsed?.hookStrengthScore ?? 75, color: getScoreBadgeColor(selectedItem.scoresParsed?.hookStrengthScore ?? 75) },
                  { name: "Clarity Score", val: selectedItem.scoresParsed?.clarityScore ?? 75, color: getScoreBadgeColor(selectedItem.scoresParsed?.clarityScore ?? 75) },
                  { name: "Virality Score", val: selectedItem.scoresParsed?.viralityScore ?? 75, color: getScoreBadgeColor(selectedItem.scoresParsed?.viralityScore ?? 75) },
                  { name: "Novelty Score", val: selectedItem.scoresParsed?.noveltyScore ?? 75, color: getScoreBadgeColor(selectedItem.scoresParsed?.noveltyScore ?? 75) }
                ].map((s, idx) => (
                  <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-secondary)" }}>
                      <span>{s.name}</span>
                      <span style={{ fontWeight: 500, color: s.color }}>{s.val}</span>
                    </div>
                    <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${s.val}%`, background: s.color, borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Recommendation, Angle & Reasoning */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 8, fontSize: 11 }}>
                <div>
                  <span style={{ color: "var(--text-muted)", display: "block" }}>Tavsiye ve Açı:</span>
                  <span style={{ fontWeight: 500, color: "var(--accent)" }}>[{selectedItem.scoresParsed?.publishRecommendation || "publish"}]</span>
                  <span style={{ color: "var(--text-secondary)", marginLeft: 6 }}>{selectedItem.scoresParsed?.angle || "safe"} angle</span>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", display: "block" }}>Gerekçe (Reasoning):</span>
                  <span style={{ color: "var(--text-secondary)" }}>{selectedItem.scoresParsed?.reasoning || "Critic reasoning not loaded."}</span>
                </div>
                {/* Faz B: SONRAKİ HAREKET (payoff/path) */}
                <div>
                  <span style={{ color: "var(--text-muted)", display: "block" }}>Sonraki Hareket (Path):</span>
                  <span
                    style={{
                      fontWeight: 500,
                      color: (selectedItem.scoresParsed?.payoff ?? "none") === "none" ? "var(--yellow)" : "var(--accent)",
                    }}
                  >
                    {NEXT_MOVE_LABELS_TR[selectedItem.scoresParsed?.payoff ?? "none"]}
                  </span>
                </div>
                {/* Faz B: SIZINTILAR (content-quality leaks) */}
                <div>
                  <span style={{ color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Sızıntılar:</span>
                  {(selectedItem.scoresParsed?.leaks ?? []).length === 0 ? (
                    <span style={{ color: "var(--accent)" }}>Sızıntı yok ✓</span>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {(selectedItem.scoresParsed?.leaks ?? []).map((leak, i) => {
                        const color =
                          leak.severity === "high" ? "var(--red)" : leak.severity === "med" ? "var(--yellow)" : "var(--text-muted)";
                        return (
                          <span
                            key={`${leak.kind}-${i}`}
                            title={leak.note}
                            style={{
                              fontSize: 10,
                              fontWeight: 500,
                              color,
                              border: `1px solid ${color}`,
                              borderRadius: 4,
                              padding: "2px 6px",
                            }}
                          >
                            {leak.note}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                {selectedItem.scoresParsed?.rewriteSuggestion && (
                  <div>
                    <span style={{ color: "var(--yellow)", display: "block" }}>Yeniden Yazım Önerisi:</span>
                    <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>{selectedItem.scoresParsed.rewriteSuggestion}</span>
                  </div>
                )}
                {selectedItem.scoresParsed?.packageId && (
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block" }}>Bu fikirden üretilenler (paket):</span>
                    {items
                      .filter((it) => it.scoresParsed?.packageId === selectedItem.scoresParsed?.packageId)
                      .map((it) => (
                        <span
                          key={it.id}
                          style={{
                            display: "block",
                            color: it.id === selectedItem.id ? "var(--accent)" : "var(--text-secondary)",
                            fontWeight: it.id === selectedItem.id ? 500 : 400,
                          }}
                        >
                          • {it.scoresParsed?.packageRole || "variant"}: {(it.editedContent || it.content).slice(0, 60)}…
                        </span>
                      ))}
                  </div>
                )}
                {selectedItem.scoresParsed?.patternUsed && (
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Kullanılan Patern: </span>
                    <span style={{ color: "var(--accent)" }}>{selectedItem.scoresParsed.patternUsed}</span>
                  </div>
                )}
                {selectedItem.scoresParsed?.writerModel && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 4 }}>
                    <span style={{ color: "var(--text-muted)" }}>Writer Model:</span>
                    <span style={{ fontFamily: "monospace", fontSize: 9, color: "var(--text-secondary)" }}>{selectedItem.scoresParsed.writerModel}</span>
                  </div>
                )}
                {selectedItem.scoresParsed?.judgeModel && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Judge Model:</span>
                    <span style={{ fontFamily: "monospace", fontSize: 9, color: "var(--text-secondary)" }}>{selectedItem.scoresParsed.judgeModel}</span>
                  </div>
                )}
                {selectedItem.scoresParsed?.finalEditorModel && selectedItem.scoresParsed.finalEditorModel !== "unknown" && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Editor Model:</span>
                    <span style={{ fontFamily: "monospace", fontSize: 9, color: "var(--text-secondary)" }}>{selectedItem.scoresParsed.finalEditorModel}</span>
                  </div>
                )}
                {selectedItem.estimatedCostUsd > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Model Maliyeti:</span>
                    <span style={{ color: "var(--text-secondary)" }}>${selectedItem.estimatedCostUsd.toFixed(5)}</span>
                  </div>
                )}
                {selectedItem.scoresParsed?.modelFallbackUsed && (
                  <div style={{ fontSize: 9, color: "var(--yellow)", marginTop: 2, background: "color-mix(in srgb, var(--accent-2) 5%, transparent)", padding: "2px 6px", borderRadius: 3 }}>
                    ⚠️ Fallback Model Kullanıldı! {selectedItem.scoresParsed.modelFallbackReason ? `(${selectedItem.scoresParsed.modelFallbackReason})` : ""}
                  </div>
                )}
              </div>
            </div>

            {/* Workflow Actions */}
            {!(selectedItem.status === "published" || selectedItem.status === "manual_published") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Kuyruk & feedback İşlemleri
                </span>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {/* Approve */}
                  <button
                    onClick={() => handleFeedback(selectedItem.id, "approved", detailContent)}
                    disabled={isSaving}
                    style={{
                      padding: "8px 12px",
                      background: selectedItem.status === "approved" ? "var(--accent-tint-12)" : "var(--accent-tint-08)",
                      border: `1px solid ${selectedItem.status === "approved" ? "var(--accent)" : "var(--accent-border)"}`,
                      color: "var(--accent)",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer"
                    }}
                  >
                    ✓ Onayla
                  </button>

                  {/* Reject */}
                  <button
                    onClick={() => handleFeedback(selectedItem.id, "rejected")}
                    disabled={isSaving}
                    style={{
                      padding: "8px 12px",
                      background: selectedItem.status === "rejected" ? "rgba(239,68,68,0.15)" : "transparent",
                      border: "1px solid rgba(255,68,68,0.3)",
                      color: "var(--red)",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer"
                    }}
                  >
                    ✗ Reddet
                  </button>
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  {/* Mark Draft */}
                  <button
                    onClick={() => handleStatusChange(selectedItem.id, "draft")}
                    disabled={isSaving}
                    style={{
                      flex: 1,
                      padding: "6px 10px",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: "pointer"
                    }}
                  >
                    📝 Draft Durumuna Çek
                  </button>

                  {/* Open Schedule Form */}
                  <button
                    onClick={() => setShowScheduleForm(!showScheduleForm)}
                    style={{
                      flex: 1,
                      padding: "6px 10px",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: "pointer"
                    }}
                  >
                    ⏰ Zamanlama Ayarla
                  </button>
                </div>

                {/* Schedule Picker Form Overlay/Inline */}
                {showScheduleForm && (
                  <div style={{
                    padding: 10,
                    background: "var(--bg-base)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6
                  }}>
                    <label style={{ fontSize: 9, color: "var(--text-muted)" }}>Planlanan Yayın Zamanı (Future Date Required)</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        type="datetime-local"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        style={{
                          flex: 1,
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 5,
                          padding: "4px 8px",
                          fontSize: 11,
                          color: "var(--text-primary)",
                          outline: "none"
                        }}
                      />
                      <button
                        onClick={() => handleScheduleSubmit(selectedItem.id)}
                        disabled={isSaving}
                        style={{
                          padding: "4px 10px",
                          background: "var(--accent)",
                          color: "var(--accent-fg)",
                          border: "none",
                          borderRadius: 5,
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: "pointer"
                        }}
                      >
                        Planla
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quick Feedback Form (Too AI, not my tone, make stronger) */}
            {!(selectedItem.status === "published" || selectedItem.status === "manual_published") && (
              <div style={{
                borderTop: "1px solid rgba(255,255,255,0.04)",
                paddingTop: 10,
                display: "flex",
                flexDirection: "column",
                gap: 6
              }}>
                <label style={{ fontSize: 10, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Hızlı Kritik Geri Bildirimi
                </label>

                <input
                  type="text"
                  placeholder="Opsiyonel detaylı geri bildirim açıklaması..."
                  value={feedbackReason}
                  onChange={(e) => setFeedbackReason(e.target.value)}
                  style={{
                    background: "var(--bg-base)",
                    border: "1px solid var(--border)",
                    borderRadius: 5,
                    color: "var(--text-primary)",
                    padding: "6px 8px",
                    fontSize: 11,
                    outline: "none"
                  }}
                />

                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {[
                    { type: "too_ai", label: "🤖 Fazla AI" },
                    { type: "not_my_tone", label: "🎭 Ton Dışı" },
                    { type: "hook_weak", label: "🪝 Hook Zayıf" },
                    { type: "make_stronger", label: "💪 Güçlendir" },
                    { type: "make_clearer", label: "🔍 Netleştir" }
                  ].map((fb) => (
                    <button
                      key={fb.type}
                      onClick={() => handleFeedback(selectedItem.id, fb.type as any, detailContent)}
                      disabled={isSaving}
                      style={{
                        padding: "4px 8px",
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid var(--border)",
                        color: "var(--text-secondary)",
                        borderRadius: 4,
                        fontSize: 10,
                        cursor: "pointer"
                      }}
                    >
                      {fb.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Warn message if low score or high risk */}
            {selectedItem.scoresParsed?.publishScore < 50 && (
              <div style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                padding: 10,
                borderRadius: 6,
                fontSize: 11,
                color: "var(--red)",
                fontWeight: 500
              }}>
                ⚠️ Dikkat: Bu taslağın AI yayın skoru düşük. Yayınlamadan önce düzenleme yapılması önerilir.
              </div>
            )}

            {selectedItem.scoresParsed?.riskScore >= 70 && (
              <div style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                padding: 10,
                borderRadius: 6,
                fontSize: 11,
                color: "var(--red)",
                fontWeight: 500
              }}>
                ⚠️ Yüksek Risk Uyarısı: Bu taslak yüksek risk skoru taşımaktadır (%{selectedItem.scoresParsed.riskScore}). Lütfen içeriği detaylıca kontrol edin.
              </div>
            )}

            {/* Bottom Publish Now Button (Replaced with Operator Action) */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 10, display: "flex", gap: 8 }}>
              <button
                onClick={() => handleCopyAndOpenX(detailContent)}
                style={{
                  flex: 2,
                  padding: "10px 16px",
                  background: "rgba(29, 155, 240, 0.15)",
                  border: "1px solid rgba(29, 155, 240, 0.4)",
                  color: "var(--status-info)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6
                }}
              >
                🚀 Kopyala ve X'i Aç
              </button>

              <button
                onClick={() => handleCopy(detailContent)}
                style={{
                  padding: "10px 14px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
                title="Sadece Kopyala"
              >
                📄 Kopyala
              </button>

              <button
                onClick={() => handleStatusChange(selectedItem.id, "manual_published")}
                disabled={isSaving}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  background: "rgba(168,85,247,0.15)",
                  border: "1px solid rgba(168,85,247,0.4)",
                  color: "var(--accent-text)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6
                }}
              >
                ✓ Manuel Paylaşıldı
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
