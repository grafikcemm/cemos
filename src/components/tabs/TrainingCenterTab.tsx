"use client";

import { useState, useEffect } from "react";
import {
  MessageSquare,
  BookOpen,
  CheckCircle2,
  XCircle,
  Pencil,
  Gem,
  Inbox,
  X,
  RotateCcw,
  Gauge,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { PageHeader, Card, MetricCard, EmptyState, SectionHeader, Badge, Skeleton } from "@/components/ui";

type FeedbackEvent = {
  id: string;
  accountId: string;
  accountHandle: string;
  displayName: string;
  queueItemId?: string;
  sourcePostId?: string;
  feedbackType: string;
  originalContent?: string;
  editedContent?: string;
  reason?: string;
  createdAt: string;
};

type TrainingExample = {
  id: string;
  accountId: string;
  accountHandle: string;
  displayName: string;
  inputType: string;
  sourceContent?: string;
  outputContent: string;
  label: string;
  reason?: string;
  metricsJson?: Record<string, any>;
  createdAt: string;
};

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
};

type Summary = {
  totalFeedbackEvents: number;
  totalTrainingExamples: number;
  goodExamples: number;
  badExamples: number;
  editedExamples: number;
  savedPatterns: number;
};

export default function TrainingCenterTab() {
  const [summary, setSummary] = useState<Summary>({
    totalFeedbackEvents: 0,
    totalTrainingExamples: 0,
    goodExamples: 0,
    badExamples: 0,
    editedExamples: 0,
    savedPatterns: 0
  });
  const [feedbackEvents, setFeedbackEvents] = useState<FeedbackEvent[]>([]);
  const [trainingExamples, setTrainingExamples] = useState<TrainingExample[]>([]);
  const [recentPatterns, setRecentPatterns] = useState<RecentPattern[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Filters
  const [accountHandle, setAccountHandle] = useState("all");
  const [feedbackType, setFeedbackType] = useState("all");
  const [label, setLabel] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [search, setSearch] = useState("");

  // Sub Tab view within panel
  const [viewTab, setViewTab] = useState<"feedback" | "training">("feedback");

  const fetchData = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        accountHandle,
        feedbackType,
        label,
        dateRange,
        search
      });
      const res = await fetch(`/api/growth/training-center?${q.toString()}`);
      const data = await res.json();
      if (data.success) {
        setSummary(data.summary);
        setFeedbackEvents(data.feedbackEvents);
        setTrainingExamples(data.trainingExamples);
        setRecentPatterns(data.recentPatterns);
      }
    } catch (err) {
      console.error("Failed to fetch training center data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [accountHandle, feedbackType, label, dateRange, search]);

  const handleFeedbackAction = async (
    evt: FeedbackEvent,
    action: "saveAsPattern" | "saveTrainingExample"
  ) => {
    setActionLoading(`${evt.id}-${action}`);
    setActionMessage(null);
    try {
      const res = await fetch("/api/growth/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: evt.accountId,
          accountHandle: evt.accountHandle,
          feedbackType: evt.feedbackType,
          originalContent: evt.originalContent,
          editedContent: evt.editedContent,
          reason: evt.reason,
          queueItemId: evt.queueItemId,
          sourcePostId: evt.sourcePostId,
          saveAsPattern: action === "saveAsPattern",
          saveTrainingExample: action === "saveTrainingExample"
        })
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({
          text: action === "saveAsPattern" ? "Pattern başarıyla kaydedildi!" : "Eğitim örneği oluşturuldu!",
          type: "success"
        });
        fetchData(); // Refetch
      } else {
        setActionMessage({ text: data.error || "Aksiyon başarısız oldu.", type: "error" });
      }
    } catch (err) {
      setActionMessage({ text: "Ağ bağlantı hatası.", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Predefined lists for filters
  const feedbackTypes = [
    { value: "approved", label: "Onaylandı (approved)" },
    { value: "rejected", label: "Reddedildi (rejected)" },
    { value: "edited", label: "Düzenlendi (edited)" },
    { value: "saved_as_pattern", label: "Pattern Kaydedildi (saved_as_pattern)" },
    { value: "not_my_tone", label: "Tonuma Uymuyor (not_my_tone)" },
    { value: "hook_weak", label: "Hook Zayıf (hook_weak)" },
    { value: "too_ai", label: "Fazla Yapay/AI (too_ai)" },
    { value: "make_stronger", label: "Güçlendir (make_stronger)" },
    { value: "make_clearer", label: "Netleştir (make_clearer)" }
  ];

  const getFeedbackBadgeColor = (type: string) => {
    switch (type) {
      case "approved":
      case "saved_as_pattern":
        return { bg: "rgba(225,29,72,0.12)", text: "var(--accent)" };
      case "rejected":
      case "too_ai":
      case "not_my_tone":
        return { bg: "rgba(239,68,68,0.15)", text: "var(--red)" };
      case "edited":
      case "make_stronger":
      case "make_clearer":
        return { bg: "rgba(59,130,246,0.12)", text: "var(--blue)" };
      default:
        return { bg: "var(--bg-elevated)", text: "var(--text-secondary)" };
    }
  };

  const getLabelBadgeColor = (labelVal: string) => {
    switch (labelVal) {
      case "good":
        return { bg: "rgba(225,29,72,0.12)", text: "var(--accent)" };
      case "bad":
        return { bg: "rgba(239,68,68,0.15)", text: "var(--red)" };
      case "edited":
        return { bg: "rgba(59,130,246,0.12)", text: "var(--blue)" };
      default:
        return { bg: "var(--bg-elevated)", text: "var(--text-secondary)" };
    }
  };

  return (
    <div style={{ width: "100%" }}>
      <PageHeader
        eyebrow="ÖĞREN"
        title="Eğitim Merkezi"
        subtitle="Growth Intelligence Engine’in öğrendiği geri bildirim (feedback) olaylarını, eğitim örneklerini ve pattern kayıtlarını yönet."
      />

      {/* Action Toast message */}
      {actionMessage && (
        <div style={{
          padding: "10px 16px",
          borderRadius: "var(--radius-md)",
          fontSize: "var(--text-sm)",
          marginBottom: "var(--space-4)",
          background: actionMessage.type === "success"
            ? "color-mix(in srgb, var(--green) 10%, transparent)"
            : "color-mix(in srgb, var(--danger) 10%, transparent)",
          color: actionMessage.type === "success" ? "var(--green)" : "var(--danger)",
          border: `1px solid ${actionMessage.type === "success"
            ? "color-mix(in srgb, var(--green) 35%, transparent)"
            : "color-mix(in srgb, var(--danger) 30%, transparent)"}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--space-3)",
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
            {actionMessage.type === "success"
              ? <CheckCircle2 size={15} strokeWidth={2} />
              : <ShieldAlert size={15} strokeWidth={2} />}
            {actionMessage.text}
          </span>
          <button
            onClick={() => setActionMessage(null)}
            title="Kapat"
            style={{ background: "transparent", border: "none", color: "currentColor", cursor: "pointer", display: "inline-flex", padding: 0 }}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Summary Cards — editöryal metrik şeridi */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: "var(--space-3)",
        marginBottom: "var(--space-6)"
      }}>
        <MetricCard
          label="Toplam Geri Bildirim"
          value={summary.totalFeedbackEvents}
          icon={<MessageSquare size={16} strokeWidth={1.8} />}
          accent
        />
        <MetricCard
          label="Eğitim Örneği"
          value={summary.totalTrainingExamples}
          icon={<BookOpen size={16} strokeWidth={1.8} />}
        />
        <MetricCard
          label="İyi Örnek"
          value={summary.goodExamples}
          icon={<CheckCircle2 size={16} strokeWidth={1.8} style={{ color: "var(--green)" }} />}
        />
        <MetricCard
          label="Kötü Örnek"
          value={summary.badExamples}
          icon={<XCircle size={16} strokeWidth={1.8} style={{ color: "var(--danger)" }} />}
        />
        <MetricCard
          label="Düzenlenen Örnek"
          value={summary.editedExamples}
          icon={<Pencil size={16} strokeWidth={1.8} style={{ color: "var(--blue)" }} />}
        />
        <MetricCard
          label="Kayıtlı Pattern"
          value={summary.savedPatterns}
          icon={<Gem size={16} strokeWidth={1.8} />}
          accent
        />
      </div>

      {/* Filter Bar */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-3)",
        marginBottom: "var(--space-6)",
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--space-2)",
        alignItems: "flex-end",
        boxShadow: "var(--shadow-sm), var(--highlight-top)"
      }}>
        {/* Account Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label className="eyebrow" style={{ color: "var(--text-muted)" }}>Hesap</label>
          <select
            value={accountHandle}
            onChange={(e) => setAccountHandle(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              padding: "6px 10px",
              fontSize: "var(--text-xs)",
              fontFamily: "inherit",
              outline: "none"
            }}
          >
            <option value="all">Tüm Hesaplar</option>
            <option value="grafikcem">@grafikcem</option>
            <option value="maskulenkod">@maskulenkod</option>
          </select>
        </div>

        {/* Feedback Type Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label className="eyebrow" style={{ color: "var(--text-muted)" }}>Geri Bildirim</label>
          <select
            value={feedbackType}
            onChange={(e) => setFeedbackType(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              padding: "6px 10px",
              fontSize: "var(--text-xs)",
              fontFamily: "inherit",
              outline: "none"
            }}
          >
            <option value="all">Tüm Tipler</option>
            {feedbackTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Label Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label className="eyebrow" style={{ color: "var(--text-muted)" }}>Eğitim Etiketi</label>
          <select
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              padding: "6px 10px",
              fontSize: "var(--text-xs)",
              fontFamily: "inherit",
              outline: "none"
            }}
          >
            <option value="all">Tüm Etiketler</option>
            <option value="good">Good (İyi)</option>
            <option value="bad">Bad (Kötü)</option>
            <option value="edited">Edited (Düzenlenmiş)</option>
          </select>
        </div>

        {/* Date Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label className="eyebrow" style={{ color: "var(--text-muted)" }}>Tarih Aralığı</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              padding: "6px 10px",
              fontSize: "var(--text-xs)",
              fontFamily: "inherit",
              outline: "none"
            }}
          >
            <option value="all">Tüm Zamanlar</option>
            <option value="today">Bugün</option>
            <option value="last_7_days">Son 7 Gün</option>
            <option value="last_30_days">Son 30 Gün</option>
          </select>
        </div>

        {/* Search */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 150 }}>
          <label className="eyebrow" style={{ color: "var(--text-muted)" }}>Metin Arama</label>
          <input
            type="text"
            placeholder="İçerik, sebep veya detay ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              padding: "6px 10px",
              fontSize: "var(--text-xs)",
              fontFamily: "inherit",
              outline: "none"
            }}
          />
        </div>

        {/* Reset button */}
        <button
          onClick={() => {
            setAccountHandle("all");
            setFeedbackType("all");
            setLabel("all");
            setDateRange("all");
            setSearch("");
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-secondary)",
            fontSize: "var(--text-xs)",
            fontFamily: "inherit",
            cursor: "pointer",
            transition: "color 0.15s var(--ease-out), border-color 0.15s var(--ease-out)"
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = "var(--border)"; }}
        >
          <RotateCcw size={14} strokeWidth={2} />
          Sıfırla
        </button>
      </div>

      {/* Main Tab Panel selectors */}
      <div style={{ display: "flex", gap: 4, marginBottom: 0 }}>
        <button
          onClick={() => setViewTab("feedback")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "9px 16px",
            borderRadius: "var(--radius-md) var(--radius-md) 0 0",
            border: "none",
            background: viewTab === "feedback" ? "var(--bg-surface)" : "transparent",
            borderTop: viewTab === "feedback" ? "2px solid var(--accent)" : "2px solid transparent",
            color: viewTab === "feedback" ? "var(--text-primary)" : "var(--text-secondary)",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: "pointer",
            transition: "color 0.15s var(--ease-out)"
          }}
        >
          <MessageSquare size={15} strokeWidth={1.8} style={{ color: viewTab === "feedback" ? "var(--accent-text)" : "var(--text-muted)" }} />
          Geri Bildirim
          <span className="tnum" style={{ fontWeight: 700, color: viewTab === "feedback" ? "var(--accent-text)" : "var(--text-muted)" }}>{feedbackEvents.length}</span>
        </button>
        <button
          onClick={() => setViewTab("training")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "9px 16px",
            borderRadius: "var(--radius-md) var(--radius-md) 0 0",
            border: "none",
            background: viewTab === "training" ? "var(--bg-surface)" : "transparent",
            borderTop: viewTab === "training" ? "2px solid var(--accent)" : "2px solid transparent",
            color: viewTab === "training" ? "var(--text-primary)" : "var(--text-secondary)",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: "pointer",
            transition: "color 0.15s var(--ease-out)"
          }}
        >
          <BookOpen size={15} strokeWidth={1.8} style={{ color: viewTab === "training" ? "var(--accent-text)" : "var(--text-muted)" }} />
          Eğitim Örnekleri
          <span className="tnum" style={{ fontWeight: 700, color: viewTab === "training" ? "var(--accent-text)" : "var(--text-muted)" }}>{trainingExamples.length}</span>
        </button>
      </div>

      {/* Content Lists */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "0 var(--radius-lg) var(--radius-lg) var(--radius-lg)",
        padding: "var(--space-4)",
        minHeight: 250,
        marginBottom: "var(--space-6)",
        boxShadow: "var(--shadow-sm), var(--highlight-top)"
      }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <Skeleton lines={4} height={64} />
          </div>
        ) : viewTab === "feedback" ? (
          /* Feedback Events Panel */
          feedbackEvents.length === 0 ? (
            <EmptyState
              icon={<Inbox size={22} strokeWidth={1.8} />}
              title="Henüz geri bildirim verisi yok"
              description="Sistemde taslakları onayladıkça, düzenledikçe veya reddettikçe veriler burada birikecektir."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {feedbackEvents.map((evt) => {
                const badge = getFeedbackBadgeColor(evt.feedbackType);
                return (
                  <Card key={evt.id} variant="feature" padded={false}>
                  <div style={{
                    padding: "var(--space-4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)"
                  }}>
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--accent-text)" }}>@{evt.accountHandle}</span>
                        <span style={{
                          fontSize: "var(--text-2xs)",
                          fontWeight: 600,
                          padding: "2px 7px",
                          borderRadius: "var(--radius-sm)",
                          background: badge.bg,
                          color: badge.text
                        }}>
                          {evt.feedbackType}
                        </span>
                        {evt.queueItemId && (
                          <span className="tnum" style={{ fontSize: "var(--text-2xs)", background: "var(--bg-elevated)", color: "var(--text-muted)", padding: "2px 7px", borderRadius: "var(--radius-sm)" }}>
                            Queue ID: {evt.queueItemId.slice(0, 8)}…
                          </span>
                        )}
                        {evt.sourcePostId && (
                          <span className="tnum" style={{ fontSize: "var(--text-2xs)", background: "var(--bg-elevated)", color: "var(--text-muted)", padding: "2px 7px", borderRadius: "var(--radius-sm)" }}>
                            Source ID: {evt.sourcePostId.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                      <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                        {new Date(evt.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </div>

                    {/* Content Previews */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                      {evt.originalContent && (
                        <div>
                          <span className="eyebrow" style={{ color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Orijinal İçerik</span>
                          <p style={{ margin: 0, color: "var(--text-secondary)", background: "var(--bg-hover)", padding: "8px 10px", borderRadius: "var(--radius-sm)", lineHeight: 1.5 }}>
                            {evt.originalContent}
                          </p>
                        </div>
                      )}
                      {evt.editedContent && (
                        <div>
                          <span className="eyebrow" style={{ color: "var(--accent-text)", display: "block", marginBottom: 4 }}>Düzenlenmiş İçerik</span>
                          <p style={{ margin: 0, color: "var(--text-primary)", background: "color-mix(in srgb, var(--accent) 5%, transparent)", border: "1px dashed var(--accent-border)", padding: "8px 10px", borderRadius: "var(--radius-sm)", lineHeight: 1.5 }}>
                            {evt.editedContent}
                          </p>
                        </div>
                      )}
                      {evt.reason && (
                        <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                          <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Sebep</span>
                          <span style={{ color: "var(--accent-2-text)" }}>{evt.reason}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: "var(--space-2)", marginTop: 2, borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
                      <button
                        onClick={() => handleFeedbackAction(evt, "saveAsPattern")}
                        disabled={actionLoading != null}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                          color: "var(--accent-text)",
                          border: "1px solid var(--accent-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "5px 10px",
                          fontSize: "var(--text-xs)",
                          fontWeight: 600,
                          fontFamily: "inherit",
                          cursor: actionLoading != null ? "default" : "pointer",
                          opacity: actionLoading != null && actionLoading !== `${evt.id}-saveAsPattern` ? 0.5 : 1,
                          transition: "opacity 0.15s var(--ease-out)"
                        }}
                      >
                        <Gem size={13} strokeWidth={2} />
                        {actionLoading === `${evt.id}-saveAsPattern` ? "Kaydediliyor…" : "Pattern Olarak Kaydet"}
                      </button>
                      <button
                        onClick={() => handleFeedbackAction(evt, "saveTrainingExample")}
                        disabled={actionLoading != null}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: "transparent",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "5px 10px",
                          fontSize: "var(--text-xs)",
                          fontWeight: 600,
                          fontFamily: "inherit",
                          cursor: actionLoading != null ? "default" : "pointer",
                          opacity: actionLoading != null && actionLoading !== `${evt.id}-saveTrainingExample` ? 0.5 : 1,
                          transition: "opacity 0.15s var(--ease-out)"
                        }}
                      >
                        <BookOpen size={13} strokeWidth={2} />
                        {actionLoading === `${evt.id}-saveTrainingExample` ? "Kaydediliyor…" : "Eğitim Örneği Oluştur"}
                      </button>
                    </div>
                  </div>
                  </Card>
                );
              })}
            </div>
          )
        ) : (
          /* Training Examples Panel */
          trainingExamples.length === 0 ? (
            <EmptyState
              icon={<Inbox size={22} strokeWidth={1.8} />}
              title="Henüz eğitim örneği verisi yok"
              description="Filtrelere uygun veri bulunamadı ya da henüz DB'ye eğitim örneği girilmedi."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {trainingExamples.map((te) => {
                const labelBadge = getLabelBadgeColor(te.label);
                const score = te.metricsJson?.draftScore;
                return (
                  <Card key={te.id} variant="feature" padded={false}>
                  <div style={{
                    padding: "var(--space-4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)"
                  }}>
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--accent-text)" }}>@{te.accountHandle}</span>
                        <span style={{
                          fontSize: "var(--text-2xs)",
                          fontWeight: 600,
                          padding: "2px 7px",
                          borderRadius: "var(--radius-sm)",
                          background: labelBadge.bg,
                          color: labelBadge.text
                        }}>
                          {te.label}
                        </span>
                        <span style={{ fontSize: "var(--text-2xs)", background: "var(--bg-elevated)", color: "var(--text-muted)", padding: "2px 7px", borderRadius: "var(--radius-sm)" }}>
                          Input: {te.inputType}
                        </span>

                        {/* Scores preview */}
                        {score && (
                          <div className="tnum" style={{ display: "flex", gap: 5, alignItems: "center", marginLeft: 2 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--text-2xs)", background: "color-mix(in srgb, var(--accent) 8%, transparent)", color: "var(--accent-text)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>
                              <Gauge size={11} strokeWidth={2} /> {score.publishScore}
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--text-2xs)", background: "color-mix(in srgb, var(--blue) 10%, transparent)", color: "var(--blue)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>
                              <UserCheck size={11} strokeWidth={2} /> {score.personaMatchScore}
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--text-2xs)", background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>
                              <ShieldAlert size={11} strokeWidth={2} /> {score.riskScore}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                        {new Date(te.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </div>

                    {/* Previews */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                      {te.sourceContent && (
                        <div>
                          <span className="eyebrow" style={{ color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Kaynak Bağlam</span>
                          <p style={{ margin: 0, color: "var(--text-secondary)", background: "var(--bg-hover)", padding: "8px 10px", borderRadius: "var(--radius-sm)", lineHeight: 1.5 }}>
                            {te.sourceContent}
                          </p>
                        </div>
                      )}
                      <div>
                        <span className="eyebrow" style={{ color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Çıktı İçeriği</span>
                        <p style={{ margin: 0, color: "var(--text-primary)", background: "var(--bg-hover)", padding: "8px 10px", borderRadius: "var(--radius-sm)", lineHeight: 1.5 }}>
                          {te.outputContent}
                        </p>
                      </div>
                      {te.reason && (
                        <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                          <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Sebep</span>
                          <span style={{ color: "var(--accent-2-text)" }}>{te.reason}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions placeholders */}
                    <div style={{ display: "flex", gap: "var(--space-2)", marginTop: 2, borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
                      <button
                        disabled
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: "transparent",
                          color: "var(--text-muted)",
                          border: "1px dashed var(--border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "5px 10px",
                          fontSize: "var(--text-xs)",
                          fontFamily: "inherit",
                          cursor: "not-allowed"
                        }}
                      >
                        <CheckCircle2 size={13} strokeWidth={2} />
                        İyi İşaretle (yakında)
                      </button>
                      <button
                        disabled
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: "transparent",
                          color: "var(--text-muted)",
                          border: "1px dashed var(--border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "5px 10px",
                          fontSize: "var(--text-xs)",
                          fontFamily: "inherit",
                          cursor: "not-allowed"
                        }}
                      >
                        <XCircle size={13} strokeWidth={2} />
                        Kötü İşaretle (yakında)
                      </button>
                    </div>
                  </div>
                  </Card>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Recent Patterns Snapshot */}
      <Card variant="feature">
        <SectionHeader
          eyebrow="KAYITLI"
          title="Pattern Anlık Görüntüsü"
          description="Pattern Library Sprint 7'de eklenecektir."
          action={<Gem size={16} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />}
        />

        {recentPatterns.length === 0 ? (
          <EmptyState
            compact
            icon={<Gem size={20} strokeWidth={1.8} />}
            title="Henüz viral pattern yok"
            description="Henüz çıkarılmış veya kaydedilmiş viral pattern kalıbı bulunmuyor."
          />
        ) : (
          <div style={{ overflowX: "auto", marginTop: "var(--space-2)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)", textAlign: "left" }}>
              <thead>
                <tr>
                  <th className="eyebrow" style={{ padding: "9px 12px", color: "var(--text-muted)", borderBottom: "1px solid var(--border-strong)" }}>Pattern Adı</th>
                  <th className="eyebrow" style={{ padding: "9px 12px", color: "var(--text-muted)", borderBottom: "1px solid var(--border-strong)" }}>Hesap</th>
                  <th className="eyebrow" style={{ padding: "9px 12px", color: "var(--text-muted)", borderBottom: "1px solid var(--border-strong)" }}>Kategori / Yapı</th>
                  <th className="eyebrow" style={{ padding: "9px 12px", color: "var(--text-muted)", borderBottom: "1px solid var(--border-strong)", textAlign: "right" }}>Başarı Skoru</th>
                  <th className="eyebrow" style={{ padding: "9px 12px", color: "var(--text-muted)", borderBottom: "1px solid var(--border-strong)", textAlign: "right" }}>Kullanım</th>
                  <th className="eyebrow" style={{ padding: "9px 12px", color: "var(--text-muted)", borderBottom: "1px solid var(--border-strong)" }}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {recentPatterns.slice(0, 5).map((pat) => (
                  <tr
                    key={pat.id}
                    style={{ borderBottom: "1px solid var(--border)", transition: "background 0.12s var(--ease-out)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "11px 12px", fontWeight: 600, color: "var(--text-primary)" }}>{pat.patternName}</td>
                    <td style={{ padding: "11px 12px", color: "var(--accent-text)", fontWeight: 600 }}>@{pat.accountHandle}</td>
                    <td style={{ padding: "11px 12px", color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>{pat.category || pat.hookType || "—"}</td>
                    <td style={{ padding: "11px 12px", textAlign: "right" }}>
                      <span className="font-display tnum" style={{ fontWeight: 800, color: "var(--accent-text)", letterSpacing: "-0.01em" }}>%{pat.successScore}</span>
                    </td>
                    <td className="tnum" style={{ padding: "11px 12px", textAlign: "right", color: "var(--text-secondary)" }}>{pat.usageCount} kez</td>
                    <td style={{ padding: "11px 12px" }}>
                      <Badge variant={pat.isActive ? "accent" : "muted"} size="sm">
                        {pat.isActive ? "Aktif" : "Pasif"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
