"use client";
import { PageHeader, Card, MetricCard, SectionHeader, EmptyState, Badge, Button, Select, Skeleton } from "@/components/ui";

import { useState, useEffect } from "react";
import {
  GraduationCap,
  RefreshCw,
  Loader2,
  MessageSquare,
  BookOpen,
  Gem,
  FileText,
  Target,
  TriangleAlert,
  Flame,
  Snowflake,
  Compass,
  Bot,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Camera as Instagram,
  Play as Youtube,
  ListChecks,
  Activity,
} from "lucide-react";

type AccountSummary = {
  accountHandle: string;
  totalFeedbackEvents: number;
  totalTrainingExamples: number;
  approvedCount: number;
  rejectedCount: number;
  editedCount: number;
  savedPatternCount: number;
  tooAiCount: number;
  notMyToneCount: number;
  hookWeakCount: number;
  averagePublishScore: number | null;
  averageRiskScore: number | null;
  bestPatternName?: string;
  weakestSignal?: string;
  recommendation: string;
};

type PatternInsight = {
  patternId?: string;
  patternName: string;
  accountHandle: string;
  usageCount: number;
  successScore: number;
  averagePublishScore?: number | null;
  signal: "rising" | "stable" | "weak" | "unknown";
  reason: string;
};

type FeedbackInsight = {
  feedbackType: string;
  count: number;
  accountHandle?: string;
  interpretation: string;
};

type QueueInsight = {
  totalQueueItems: number;
  draftCount: number;
  approvedCount: number;
  rejectedCount: number;
  scheduledCount: number;
  averagePublishScore: number | null;
  averageRiskScore: number | null;
  highRiskCount: number;
  lowScoreCount: number;
};

type PlatformSection = {
  platform: "x" | "instagram" | "youtube";
  totalFeedbackEvents: number;
  totalTrainingExamples: number;
  totalPatterns: number;
  engagementHigh: number;
  engagementLow: number;
};

type ReportData = {
  success: boolean;
  dateRange: {
    label: string;
    from?: string;
    to?: string;
  };
  summary: {
    totalFeedbackEvents: number;
    totalTrainingExamples: number;
    totalPatterns: number;
    totalQueueItems: number;
    averagePublishScore: number | null;
    averageRiskScore: number | null;
    strongestAccount?: string;
    weakestAccount?: string;
    topRecommendation: string;
  };
  accounts: AccountSummary[];
  topPatterns: PatternInsight[];
  weakPatterns: PatternInsight[];
  feedbackInsights: FeedbackInsight[];
  queueInsight: QueueInsight;
  nextWeekActions: string[];
  warnings: string[];
  platformSections?: PlatformSection[];
  aiSummary?: string;
};

export default function WeeklyLearningReportTab() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [accountHandle, setAccountHandle] = useState("all");
  const [dateRange, setDateRange] = useState("last_7_days");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        accountHandle,
        dateRange
      });
      if (dateRange === "custom") {
        if (customFrom) q.append("from", new Date(customFrom).toISOString());
        if (customTo) q.append("to", new Date(customTo).toISOString());
      }

      const res = await fetch(`/api/growth/weekly-learning-report?${q.toString()}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setReport(data);
      } else {
        setError(data.error || "Rapor derlenirken bir hata oluştu.");
      }
    } catch {
      setError("Sunucuya bağlanırken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
     
  }, [accountHandle, dateRange]);

  const getScoreColor = (score: number | null) => {
    if (score === null) return "var(--text-muted)";
    if (score >= 75) return "var(--accent)";
    if (score >= 50) return "var(--yellow)";
    return "var(--red)";
  };

  const getSignalBadgeColor = (sig: string) => {
    switch (sig) {
      case "rising":
        return { bg: "rgba(200, 224, 191,0.12)", text: "var(--accent)", border: "1px solid rgba(200, 224, 191,0.2)" };
      case "weak":
        return { bg: "rgba(239,68,68,0.12)", text: "var(--red)", border: "1px solid rgba(239,68,68,0.2)" };
      case "stable":
      default:
        return { bg: "rgba(59,130,246,0.12)", text: "var(--blue)", border: "1px solid rgba(59,130,246,0.2)" };
    }
  };

  return (
    <div style={{ width: "100%", paddingBottom: 60 }}>
      <PageHeader
        title="Haftalık Öğrenme Raporu"
        subtitle="Growth Intelligence Engine’in öğrendiği pattern, feedback ve kuyruk sinyallerini on-demand analiz et."
      />

      {/* Filter Bar */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        marginBottom: 20,
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center"
      }}>
        {/* Account Filter */}
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
              outline: "none",
              cursor: "pointer"
            }}
          >
            <option value="all">Tüm Hesaplar</option>
            <option value="grafikcem">@grafikcem</option>
            <option value="maskulenkod">@maskulenkod</option>
          </select>
        </div>

        {/* Date Range Filter */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>Zaman Seçeneği</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              color: "var(--text-primary)",
              padding: "4px 8px",
              fontSize: 11,
              outline: "none",
              cursor: "pointer"
            }}
          >
            <option value="last_7_days">Son 7 Gün</option>
            <option value="last_30_days">Son 30 Gün</option>
            <option value="this_week">Bu Hafta</option>
            <option value="previous_week">Geçen Hafta</option>
            <option value="all">Tüm Zamanlar</option>
            <option value="custom">Özel Tarih Aralığı</option>
          </select>
        </div>

        {/* Custom Date from/to */}
        {dateRange === "custom" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <label style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>Başlangıç</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{
                  background: "var(--bg-base)",
                  border: "1px solid var(--border)",
                  borderRadius: 5,
                  color: "var(--text-primary)",
                  padding: "3px 6px",
                  fontSize: 11,
                  outline: "none"
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <label style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>Bitiş</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{
                  background: "var(--bg-base)",
                  border: "1px solid var(--border)",
                  borderRadius: 5,
                  color: "var(--text-primary)",
                  padding: "3px 6px",
                  fontSize: 11,
                  outline: "none"
                }}
              />
            </div>
          </>
        )}

        {/* Refresh button */}
        <button
          onClick={fetchReport}
          disabled={loading}
          style={{
            alignSelf: "flex-end",
            padding: "5px 12px",
            background: "rgba(200, 224, 191,0.1)",
            border: "1px solid var(--accent-border)",
            borderRadius: 5,
            color: "var(--accent)",
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
            height: 25,
            transition: "opacity 0.15s"
          }}
        >
          {loading ? "⌛ Yükleniyor..." : "↺ Yenile"}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          padding: "12px 16px",
          background: "rgba(239,68,68,0.1)",
          border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 8,
          color: "var(--red)",
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 20
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "80px 0", textAlign: "center", color: "var(--text-muted)" }}>
          ⏳ Analitik rapor verileri derleniyor...
        </div>
      ) : !report || report.summary.totalFeedbackEvents === 0 && report.summary.totalQueueItems === 0 ? (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "60px 40px",
          textAlign: "center",
          color: "var(--text-muted)"
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>Henüz yeterli öğrenme verisi yok.</div>
          <p style={{ fontSize: 12, width: "100%" }}>
            Seçilen tarih aralığında ({report?.dateRange.label || "Son 7 Gün"}) herhangi bir kuyruk veya geri bildirim verisi bulunamadı.
            Daily Queue üzerinden onaylama, reddetme veya düzenleme aksiyonları geldikçe öğrenme raporu on-demand oluşacaktır.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          
          {/* Summary Cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 10
          }}>
            {[
              { label: "Toplam Geri Bildirim", val: report.summary.totalFeedbackEvents, icon: "💬" },
              { label: "Ort. Yayın Skoru", val: report.summary.averagePublishScore ? `${report.summary.averagePublishScore}/100` : "—", color: getScoreColor(report.summary.averagePublishScore), icon: "🎯" },
              { label: "En Güçlü Hesap", val: report.summary.strongestAccount ? `@${report.summary.strongestAccount}` : "—", color: "var(--accent)", icon: "🔥" },
              { label: "En Zayıf Hesap", val: report.summary.weakestAccount ? `@${report.summary.weakestAccount}` : "—", color: "var(--yellow)", icon: "❄️" }
            ].map((card, idx) => (
              <div key={idx} style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "10px 12px"
              }}>
                <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  {card.icon} {card.label}
                </div>
                <div style={{ fontSize: 16, fontWeight: 500, color: card.color || "var(--text-primary)" }}>
                  {card.val}
                </div>
              </div>
            ))}
          </div>

          {/* AI Summary Block */}
          {report.aiSummary && (
            <div style={{
              background: "rgba(200, 224, 191,0.03)",
              border: "1px dashed var(--accent-border)",
              borderRadius: 8,
              padding: 16,
              fontSize: 12,
              lineHeight: 1.6,
              color: "var(--text-primary)",
              display: "flex",
              flexDirection: "column",
              gap: 4
            }}>
              <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", color: "var(--accent)", letterSpacing: "0.05em" }}>
                🤖 AI Copilot Yorumu
              </span>
              <p style={{ margin: 0, fontStyle: "italic" }}>"{report.aiSummary}"</p>
            </div>
          )}

          {/* Sadeleştirme: Platform Kırılımı, Hesap Kırılımlı Özetler ve
              Feedback/Kuyruk panelleri kaldırıldı — rapor 4 ana bloğa indirildi
              (Özet · AI Yorumu · Pattern'ler · Aksiyonlar). Hesap-bazlı derin
              detay X / hesap-scoped sekmelerde mevcut. */}

          {/* Top Patterns & Weak Signals Columns */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))", gap: 20 }}>
            {/* Top Patterns */}
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
              <h4 style={{ fontSize: 13, fontWeight: 500, margin: "0 0 10px 0", color: "var(--text-primary)" }}>
                🚀 Yükselişteki Şablonlar (Top Patterns)
              </h4>
              {report.topPatterns.length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "10px 0" }}>Veri yok.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {report.topPatterns.map((pat) => {
                    const badge = getSignalBadgeColor(pat.signal);
                    return (
                      <div key={pat.patternName} style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{pat.patternName}</span>
                          <span style={{ fontSize: 9, background: badge.bg, color: badge.text, border: badge.border, padding: "1px 5px", borderRadius: 3 }}>
                            {pat.signal}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)" }}>
                          <span>Hesap: @{pat.accountHandle} | Başarı Skoru: %{pat.successScore}</span>
                          {pat.averagePublishScore && <span>Yayın Ortalaması: {pat.averagePublishScore}</span>}
                        </div>
                        <p style={{ margin: 0, fontSize: 11, color: "var(--text-secondary)" }}>{pat.reason}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Weak Patterns / Signals */}
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
              <h4 style={{ fontSize: 13, fontWeight: 500, margin: "0 0 10px 0", color: "var(--text-primary)" }}>
                ⚠️ Zayıflayan / Dikkat Gereken Şablonlar
              </h4>
              {report.weakPatterns.length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "10px 0", textAlign: "center" }}>
                  Herhangi bir zayıf pattern sinyali algılanmadı. Dil kalitesi dengeli seyrediyor.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {report.weakPatterns.map((pat) => {
                    const badge = getSignalBadgeColor(pat.signal);
                    return (
                      <div key={pat.patternName} style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{pat.patternName}</span>
                          <span style={{ fontSize: 9, background: badge.bg, color: badge.text, border: badge.border, padding: "1px 5px", borderRadius: 3 }}>
                            {pat.signal}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)" }}>
                          <span>Hesap: @{pat.accountHandle} | Başarı: %{pat.successScore}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 11, color: "var(--text-secondary)" }}>{pat.reason}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Next Week Actions */}
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 16
          }}>
            <h4 style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px 0", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
              <span>🚀</span> Gelecek Hafta İçin Tavsiye Edilen Altın Aksiyonlar
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {report.nextWeekActions.map((action, idx) => (
                <div key={idx} style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: "var(--text-secondary)",
                  padding: "8px 10px",
                  background: "var(--bg-base)",
                  borderRadius: 6,
                  borderLeft: "3px solid var(--accent)"
                }}>
                  <span style={{ fontWeight: 500, color: "var(--accent)" }}>#{idx + 1}</span>
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
