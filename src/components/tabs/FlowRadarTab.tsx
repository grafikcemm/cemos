"use client";

import { useState, useEffect, useRef } from "react";
import {
  Radar,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  ShieldAlert,
  MessageSquare,
  Quote,
  Reply,
  EyeOff,
  Gauge,
  Heart,
  Repeat2,
  Eye,
  ExternalLink,
  X,
  Sparkles,
  Check,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Send,
  CheckCircle2,
  Bookmark,
  Loader2,
} from "lucide-react";
import { PageHeader, Card, MetricCard, EmptyState, Button } from "@/components/ui";

interface Candidate {
  id: string;
  sourceHandle: string;
  sourceName: string;
  accountHandle: string;
  content: string;
  url: string;
  publishedAt: string | null;
  metrics: {
    likes: number;
    reposts: number;
    views: number;
  };
  score: {
    opportunityScore: number;
    riskScore: number;
    suggestedAction: string;
    reason: string;
  };
  pattern: {
    suggestedPatterns: string[];
    emotionalTrigger: string;
    viralityReason: string;
  };
  status: string;
}

interface Summary {
  totalCandidates: number;
  highOpportunity: number;
  highRisk: number;
  tweetCandidates: number;
  quoteCandidates: number;
  replyCandidates: number;
  ignored: number;
  averageOpportunityScore: number;
}

export default function FlowRadarTab() {
  // Filters & State
  const [account, setAccount] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [risk, setRisk] = useState<string>("all");
  const [status, setStatus] = useState<string>("new"); // Default to new candidates
  const [minOpportunity, setMinOpportunity] = useState<number>(0);
  const [search, setSearch] = useState<string>("");
  const [sort, setSort] = useState<string>("opportunityScore");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  // null = not loaded yet → widgets render "–" placeholders instead of a
  // misleading "0 candidates" while the first fetch is still in flight.
  const [summary, setSummary] = useState<Summary | null>(null);
  const sv = (v: number | undefined): string => (summary ? String(v ?? 0) : "–");

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals & Actions
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sprint 10 Draft Generator & Critic States
  const [draftModalOpen, setDraftModalOpen] = useState<boolean>(false);
  const [generatingDrafts, setGeneratingDrafts] = useState<boolean>(false);
  const [generatedDraftsList, setGeneratedDraftsList] = useState<any[]>([]);
  const [generatingError, setGeneratingError] = useState<string | null>(null);
  const [currentDraftTargetPost, setCurrentDraftTargetPost] = useState<Candidate | null>(null);
  const [selectedActionType, setSelectedActionType] = useState<string | null>(null);
  const [editableDrafts, setEditableDrafts] = useState<Record<string, string>>({});
  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, string>>({});
  const [savingQueueId, setSavingQueueId] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3000);
  };

  const handleGenerateDrafts = async (cand: Candidate, actionType: string) => {
    setCurrentDraftTargetPost(cand);
    setSelectedActionType(actionType);
    setGeneratingDrafts(true);
    setDraftModalOpen(true);
    setGeneratingError(null);
    setGeneratedDraftsList([]);
    setEditableDrafts({});
    setFeedbackStatus({});

    try {
      const res = await fetch("/api/growth/generate-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountHandle: cand.accountHandle,
          actionType: actionType,
          sourcePostId: cand.id
        })
      });

      if (!res.ok) {
        throw new Error(`Taslak üretimi başarısız oldu. Durum: ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setGeneratedDraftsList(data.drafts || []);
        const editable: Record<string, string> = {};
        data.drafts.forEach((item: any) => {
          editable[item.draft.id] = item.draft.content;
        });
        setEditableDrafts(editable);
      } else {
        throw new Error(data.error || "Taslaklar oluşturulurken bir AI hatası alındı.");
      }
    } catch (err: any) {
      setGeneratingError(err.message || "Bilinmeyen bir hata oluştu.");
    } finally {
      setGeneratingDrafts(false);
    }
  };

  const handleCopyDraft = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    triggerToast("Taslak panoya kopyalandı.");
  };

  const handleSaveFeedback = async (draftItem: any, feedbackType: string) => {
    const draftId = draftItem.draft.id;
    const currentText = editableDrafts[draftId] || draftItem.draft.content;
    const isEdited = currentText.trim() !== draftItem.draft.content.trim();
    const finalFeedbackType = feedbackType === "approved" && isEdited ? "edited" : feedbackType;

    try {
      const res = await fetch("/api/growth/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountHandle: draftItem.draft.accountHandle,
          // accountId is resolved server-side from accountHandle (see
          // processFeedback). The schema requires a non-empty string, so we send
          // a placeholder the server overwrites — never persisted.
          accountId: "resolved-server-side",
          feedbackType: finalFeedbackType,
          originalContent: draftItem.draft.content,
          editedContent: isEdited ? currentText : undefined,
          sourceContent: currentDraftTargetPost?.content,
          sourcePostId: currentDraftTargetPost?.id,
          saveTrainingExample: true,
          saveAsPattern: false
        })
      });

      const data = await res.json();
      if (data.success) {
        setFeedbackStatus((prev) => ({ ...prev, [draftId]: finalFeedbackType }));
        triggerToast(`Geri bildirim başarıyla iletildi (${finalFeedbackType}).`);
      } else {
        triggerToast(data.error || "Geri bildirim kaydedilemedi.");
      }
    } catch {
      triggerToast("Ağ hatası oluştu.");
    }
  };

  const handleSaveToQueue = async (draftItem: any) => {
    const draftId = draftItem.draft.id;
    const currentText = editableDrafts[draftId] || draftItem.draft.content;
    setSavingQueueId(draftId);

    try {
      const res = await fetch(`/api/growth/flow-radar/source-posts/${currentDraftTargetPost?.id}/send-to-queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: currentText,
          accountHandle: draftItem.draft.accountHandle,
          modeId: draftItem.draft.modeId
        })
      });

      const data = await res.json();
      if (data.success) {
        triggerToast(data.message || "Taslak kuyruğa (Queue) başarıyla eklendi.");
        setDraftModalOpen(false);
      } else {
        triggerToast(data.error || "Kuyruğa kaydetme başarısız.");
      }
    } catch {
      triggerToast("Ağ hatası oluştu.");
    } finally {
      setSavingQueueId(null);
    }
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Fetch candidates from API
  const loadCandidates = async () => {
    setLoading(true);
    setError(null);
    try {
      const qParams = new URLSearchParams();
      if (account !== "all") qParams.set("accountHandle", account);
      if (action !== "all") qParams.set("action", action);
      if (risk !== "all") qParams.set("risk", risk);
      if (status !== "all") qParams.set("status", status);
      if (minOpportunity > 0) qParams.set("minOpportunity", minOpportunity.toString());
      if (search.trim()) qParams.set("search", search);
      qParams.set("sort", sort);

      const res = await fetch(`/api/growth/flow-radar?${qParams.toString()}`);
      if (!res.ok) throw new Error("Aday fırsat akışı yüklenemedi.");
      const data = await res.json();
      if (data.success) {
        setCandidates(data.candidates || []);
        setSummary(data.summary || {
          totalCandidates: 0,
          highOpportunity: 0,
          highRisk: 0,
          tweetCandidates: 0,
          quoteCandidates: 0,
          replyCandidates: 0,
          ignored: 0,
          averageOpportunityScore: 0
        });
      } else {
        throw new Error(data.error || "Adaylar çekilirken bir hata oluştu.");
      }
    } catch (err: any) {
      setError(err.message || "Ağ bağlantı hatası oluştu.");
      setSummary(null); // error → placeholders, never fake zeros
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidates();
  }, [account, action, risk, status, minOpportunity, sort]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadCandidates();
  };

  // 1. Action: Ignore Candidate
  const handleIgnore = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/growth/flow-radar/source-posts/${id}/ignore`, {
        method: "POST"
      });
      const data = await res.json();
      if (data.success) {
        triggerToast("Aday pasif (ignored) konumuna alındı.");
        loadCandidates();
      } else {
        triggerToast(data.error || "Aday pasifleştirilemedi.");
      }
    } catch {
      triggerToast("Ağ bağlantısı hatası oluştu.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // 2. Action: Mark Reviewed
  const handleMarkReviewed = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/growth/flow-radar/source-posts/${id}/mark-reviewed`, {
        method: "POST"
      });
      const data = await res.json();
      if (data.success) {
        triggerToast("Aday 'reviewed' (incelendi) olarak işaretlendi.");
        loadCandidates();
      } else {
        triggerToast(data.error || "Aday güncellenemedi.");
      }
    } catch {
      triggerToast("Ağ bağlantısı hatası oluştu.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // 3. Action: Save as Pattern
  const handleSaveAsPattern = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/growth/flow-radar/source-posts/${id}/save-pattern`, {
        method: "POST"
      });
      const data = await res.json();
      if (data.success) {
        triggerToast("Grup hafızası güncellendi: Pattern ve eğitim örneği başarıyla kaydedildi.");
        loadCandidates();
      } else {
        triggerToast(data.error || "Pattern çıkarılamadı.");
      }
    } catch {
      triggerToast("Ağ bağlantısı hatası oluştu.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // 4. Action: Send to Queue (placeholder)
  const handleSendToQueue = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/growth/flow-radar/source-posts/${id}/send-to-queue`, {
        method: "POST"
      });
      const data = await res.json();
      triggerToast(data.message || "Queue entegrasyonu tamamlandı.");
    } catch {
      triggerToast("Kuyruğa gönderilirken hata oluştu.");
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "var(--gradient-surface), var(--bg-elevated)",
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
          <CheckCircle2 size={16} strokeWidth={2} style={{ color: "var(--accent-text)", flexShrink: 0 }} /> {toastMessage}
        </div>
      )}

      {/* Header */}
      <PageHeader
        surface
        eyebrow="KEŞFET"
        title="Viral Radar"
        subtitle="Kaynaklardan gelen viral adayları ve fikirleri incele, karar aksiyonunu belirle ve üretim sürecine yönlendir."
        actions={
          <Button
            variant="primary"
            onClick={loadCandidates}
            iconLeft={<RefreshCw size={15} strokeWidth={2} />}
          >
            Yenile
          </Button>
        }
      />

      {/* Pipeline mark — viral akış adımları künyesi */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: -4,
          marginBottom: 4,
          color: "var(--text-muted)",
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          flexWrap: "wrap",
        }}
      >
        <Radar size={14} strokeWidth={2} style={{ color: "var(--accent-text)" }} />
        <span style={{ color: "var(--accent-text)" }}>Tara</span>
        <span style={{ opacity: 0.4 }}>→</span>
        <span>Puanla</span>
        <span style={{ opacity: 0.4 }}>→</span>
        <span>Karar Ver</span>
        <span style={{ opacity: 0.4 }}>→</span>
        <span>Üret</span>
      </div>

      {/* Telemetry Summary Widgets */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12
        }}
      >
        <MetricCard
          label="Toplam Aday"
          value={sv(summary?.totalCandidates)}
          delta="Fırsat Havuzu"
          deltaTone="neutral"
          icon={<Radar size={16} strokeWidth={2} />}
        />
        <MetricCard
          label="Yüksek Fırsat (75+)"
          value={<span style={{ color: "var(--green)" }}>{sv(summary?.highOpportunity)}</span>}
          delta="Puan Eşiğini Aşanlar"
          deltaTone="up"
          icon={<span style={{ color: "var(--green)" }}><TrendingUp size={16} strokeWidth={2} /></span>}
        />
        <MetricCard
          label="Yüksek Risk (70+)"
          value={<span style={{ color: "var(--danger)" }}>{sv(summary?.highRisk)}</span>}
          delta="Göz Ardı Edilmeli"
          deltaTone="down"
          icon={<span style={{ color: "var(--danger)" }}><ShieldAlert size={16} strokeWidth={2} /></span>}
        />
        <MetricCard
          label="Tweet Adayları"
          value={sv(summary?.tweetCandidates)}
          delta="Yayın Önerilen"
          deltaTone="neutral"
          accent
          icon={<MessageSquare size={16} strokeWidth={2} />}
        />
        <MetricCard
          label="Alıntı Adayları"
          value={<span style={{ color: "var(--blue)" }}>{sv(summary?.quoteCandidates)}</span>}
          delta="Alıntı Önerilen"
          deltaTone="neutral"
          icon={<span style={{ color: "var(--blue)" }}><Quote size={16} strokeWidth={2} /></span>}
        />
        <MetricCard
          label="Yanıt Adayları"
          value={<span style={{ color: "var(--danger)" }}>{sv(summary?.replyCandidates)}</span>}
          delta="Yanıt Önerilen"
          deltaTone="neutral"
          icon={<span style={{ color: "var(--danger)" }}><Reply size={16} strokeWidth={2} /></span>}
        />
        <MetricCard
          label="Yoksayılan"
          value={<span style={{ color: "var(--text-muted)" }}>{sv(summary?.ignored)}</span>}
          delta="Reddedilen Fikirler"
          deltaTone="neutral"
          icon={<EyeOff size={16} strokeWidth={2} />}
        />
        <MetricCard
          label="Ortalama Fırsat"
          value={summary ? summary.averageOpportunityScore + "%" : "–"}
          delta="Genel Ortalama"
          deltaTone="neutral"
          icon={<Gauge size={16} strokeWidth={2} />}
        />
      </div>

      {/* Filter Control Bar */}
      <Card variant="quiet" style={{ padding: 16 }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {/* Account Filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="eyebrow">HEDEF HESAP</label>
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-strong)",
                color: "var(--text-primary)",
                padding: "7px 11px",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-sm)",
                fontFamily: "inherit",
                outline: "none"
              }}
            >
              <option value="all">Tümü</option>
              <option value="grafikcem">grafikcem</option>
              <option value="maskulenkod">maskulenkod</option>
            </select>
          </div>

          {/* Action Filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="eyebrow">AKSİYON ÖNERİSİ</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-strong)",
                color: "var(--text-primary)",
                padding: "7px 11px",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-sm)",
                fontFamily: "inherit",
                outline: "none"
              }}
            >
              <option value="all">Tümü</option>
              <option value="tweet">Tweet</option>
              <option value="quote">Quote</option>
              <option value="reply">Reply</option>
              <option value="ignore">Ignore</option>
            </select>
          </div>

          {/* Risk Filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="eyebrow">RİSK DÜZEYİ</label>
            <select
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-strong)",
                color: "var(--text-primary)",
                padding: "7px 11px",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-sm)",
                fontFamily: "inherit",
                outline: "none"
              }}
            >
              <option value="all">Tümü</option>
              <option value="low">Düşük</option>
              <option value="medium">Orta</option>
              <option value="high">Yüksek</option>
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="eyebrow">KARAR DURUMU</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-strong)",
                color: "var(--text-primary)",
                padding: "7px 11px",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-sm)",
                fontFamily: "inherit",
                outline: "none"
              }}
            >
              <option value="all">Tümü</option>
              <option value="new">Yeni Kararlar (New)</option>
              <option value="reviewed">İncelenenler (Reviewed)</option>
              <option value="ignored">Reddedilenler (Ignored)</option>
              <option value="used">Kuyruğa Gidenler (Used)</option>
            </select>
          </div>

          {/* Sort Option */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="eyebrow">SIRALAMA</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-strong)",
                color: "var(--text-primary)",
                padding: "7px 11px",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-sm)",
                fontFamily: "inherit",
                outline: "none"
              }}
            >
              <option value="opportunityScore">Fırsat Skoru (Yüksek-Düşük)</option>
              <option value="riskScore">Risk Skoru (Yüksek-Düşük)</option>
              <option value="publishedAt">Yayınlanma Tarihi</option>
              <option value="scannedAt">Taranma Tarihi</option>
              <option value="viralScore">X Etkileşim Skoru</option>
            </select>
          </div>

          {/* Min Opportunity Slider */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 140 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="eyebrow">MİN. FIRSAT SKORU</span>
              <span className="tnum" style={{ color: "var(--accent-text)", fontSize: "var(--text-xs)", fontWeight: 700 }}>{minOpportunity}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="95"
              step="5"
              value={minOpportunity}
              onChange={(e) => setMinOpportunity(Number(e.target.value))}
              style={{
                accentColor: "var(--accent)",
                marginTop: 6,
                cursor: "pointer"
              }}
            />
          </div>

          {/* Search bar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 150 }}>
            <label className="eyebrow">ARAMA</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Metin, kanca veya kaynak..."
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text-primary)",
                  padding: "7px 11px",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--text-sm)",
                  fontFamily: "inherit",
                  outline: "none",
                  flex: 1
                }}
              />
              <Button type="submit" variant="primary" iconLeft={<Search size={15} strokeWidth={2} />}>
                Ara
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Candidates List Panel */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)", fontSize: 13 }}>
          Karar adayları zenginleştiriliyor ve yükleniyor...
        </div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "40px 10px", color: "var(--danger)", fontSize: 13, background: "rgba(248,113,113,0.05)", borderRadius: 6 }}>
          {error}
        </div>
      ) : candidates.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 10px", color: "var(--text-muted)", fontSize: 13, background: "var(--bg-base)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)" }}>
          Henüz Flow Radar adayı yok.
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
            Source Intelligence panelinde kaynak gönderiler tarandığında veya fırsat puanı oluştuğunda burada listelenecek.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 12
          }}
          className="candidates-grid"
        >
          {/* Custom style for 2 columns layout on large screens */}
          <style>{`
            @media (min-width: 900px) {
              .candidates-grid {
                grid-template-columns: 1fr 1fr !important;
              }
            }
          `}</style>

          {candidates.map((cand) => {
            const isHighOpp = cand.score.opportunityScore >= 75;
            const isHighRisk = cand.score.riskScore >= 70;
            const isActionLoading = actionLoadingId === cand.id;

            return (
              <div
                key={cand.id}
                style={{
                  background: "var(--bg-base)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  padding: 16,
                  borderRadius: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  opacity: isActionLoading ? 0.6 : 1,
                  pointerEvents: isActionLoading ? "none" : "auto",
                  transition: "opacity 0.2s"
                }}
              >
                {/* Header info */}
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>@{cand.sourceHandle}</span>
                    {cand.sourceName && (
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>({cand.sourceName})</span>
                    )}
                    <span style={{ fontSize: 8, color: "rgba(255,255,255,0.15)" }}>•</span>
                    <span
                      style={{
                        fontSize: 9,
                        background: "rgba(255,255,255,0.04)",
                        color: "var(--text-muted)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontWeight: 500
                      }}
                    >
                      @{cand.accountHandle}
                    </span>
                  </div>

                  {/* Status badges */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 9,
                        background:
                          cand.score.suggestedAction === "tweet"
                            ? "rgba(225,29,72,0.15)"
                            : cand.score.suggestedAction === "quote"
                            ? "rgba(96,165,250,0.15)"
                            : cand.score.suggestedAction === "reply"
                            ? "rgba(244,63,94,0.15)"
                            : "rgba(255,255,255,0.06)",
                        color:
                          cand.score.suggestedAction === "tweet"
                            ? "var(--accent)"
                            : cand.score.suggestedAction === "quote"
                            ? "var(--blue)"
                            : cand.score.suggestedAction === "reply"
                            ? "var(--danger)"
                            : "var(--text-muted)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontWeight: 600,
                        textTransform: "uppercase"
                      }}
                    >
                      {cand.score.suggestedAction}
                    </span>
                    
                    {cand.status !== "new" && (
                      <span
                        style={{
                          fontSize: 9,
                          background: cand.status === "ignored" ? "rgba(248,113,113,0.12)" : "rgba(74,222,128,0.12)",
                          color: cand.status === "ignored" ? "var(--danger)" : "var(--green)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontWeight: 600,
                          textTransform: "uppercase"
                        }}
                      >
                        {cand.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Score Indicators Panel */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    background: "var(--bg-surface)",
                    padding: 8,
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.03)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>FIRSAT SKORU:</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: isHighOpp ? "var(--green)" : "var(--text-primary)"
                      }}
                    >
                      {cand.score.opportunityScore}%
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>RİSK SKORU:</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: isHighRisk ? "var(--danger)" : "var(--text-primary)"
                      }}
                    >
                      {cand.score.riskScore}%
                    </span>
                  </div>
                </div>

                {/* Content text */}
                <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                  {cand.content}
                </div>

                {/* Extra metrics */}
                <div style={{ display: "flex", gap: 10, fontSize: 10, color: "var(--text-muted)" }}>
                  <span>♥ {cand.metrics.likes}</span>
                  <span>🔁 {cand.metrics.reposts}</span>
                  {cand.metrics.views > 0 && <span>👁 {cand.metrics.views}</span>}
                  {cand.url && (
                    <a
                      href={cand.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--accent)", textDecoration: "none", marginLeft: "auto", fontSize: 10 }}
                    >
                      Kaynağa Git ↗
                    </a>
                  )}
                </div>

                {/* Heuristic Pattern recommendations */}
                {cand.pattern.suggestedPatterns.length > 0 && (
                  <div style={{ background: "rgba(255,255,255,0.03)", padding: 8, borderRadius: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 9, color: "var(--accent)", fontWeight: 600 }}>ÖNERİLEN VİRAL ŞABLONLAR:</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {cand.pattern.suggestedPatterns.map((pat, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: 9,
                            background: "rgba(225,29,72,0.12)",
                            color: "var(--accent)",
                            padding: "1px 5px",
                            borderRadius: 3
                          }}
                        >
                          {pat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Decision Actions Button Bar */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    borderTop: "1px solid rgba(255,255,255,0.04)",
                    paddingTop: 10,
                    marginTop: 4
                  }}
                >
                  <button
                    onClick={() => setSelectedCandidate(cand)}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "var(--text-primary)",
                      fontSize: 10,
                      fontWeight: 500,
                      padding: "4px 8px",
                      borderRadius: 4,
                      cursor: "pointer"
                    }}
                  >
                    Detaylar
                  </button>

                  <button
                    onClick={() => handleSaveAsPattern(cand.id)}
                    style={{
                      background: "rgba(225,29,72,0.08)",
                      border: "1px solid rgba(225,29,72,0.15)",
                      color: "var(--accent)",
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "4px 8px",
                      borderRadius: 4,
                      cursor: "pointer"
                    }}
                  >
                    Desen Yap (Pattern)
                  </button>

                  {cand.status === "new" && (
                    <button
                      onClick={() => handleMarkReviewed(cand.id)}
                      style={{
                        background: "rgba(74,222,128,0.08)",
                        border: "1px solid rgba(74,222,128,0.15)",
                        color: "var(--green)",
                        fontSize: 10,
                        fontWeight: 500,
                        padding: "4px 8px",
                        borderRadius: 4,
                        cursor: "pointer"
                      }}
                    >
                      İncelendi
                    </button>
                  )}

                  {cand.status !== "ignored" && (
                    <button
                      onClick={() => handleIgnore(cand.id)}
                      style={{
                        background: "rgba(248,113,113,0.08)",
                        border: "1px solid rgba(248,113,113,0.15)",
                        color: "var(--danger)",
                        fontSize: 10,
                        fontWeight: 500,
                        padding: "4px 8px",
                        borderRadius: 4,
                        cursor: "pointer"
                      }}
                    >
                      Yoksay (Ignore)
                    </button>
                  )}

                  {/* Sprint 10 Real Generation Actions */}
                  <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
                    <button
                      onClick={() => handleGenerateDrafts(cand, "tweet")}
                      style={{
                        background: "rgba(225,29,72,0.12)",
                        border: "1px solid rgba(225,29,72,0.2)",
                        color: "var(--accent)",
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "4px 8px",
                        borderRadius: 4,
                        cursor: "pointer"
                      }}
                    >
                      Tweet Üret
                    </button>
                    <button
                      onClick={() => handleGenerateDrafts(cand, "quote")}
                      style={{
                        background: "rgba(96,165,250,0.12)",
                        border: "1px solid rgba(96,165,250,0.2)",
                        color: "var(--blue)",
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "4px 8px",
                        borderRadius: 4,
                        cursor: "pointer"
                      }}
                    >
                      Alıntı Üret
                    </button>
                    <button
                      onClick={() => handleGenerateDrafts(cand, "reply")}
                      style={{
                        background: "rgba(244,63,94,0.12)",
                        border: "1px solid rgba(244,63,94,0.2)",
                        color: "var(--danger)",
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "4px 8px",
                        borderRadius: 4,
                        cursor: "pointer"
                      }}
                    >
                      Yanıt Üret
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 1. Modal: Full Candidate & Score Breakdown details */}
      {selectedCandidate && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: 16
          }}
        >
          <div
            style={{
              background: "var(--bg-base)",
              border: "1px solid rgba(255,255,255,0.08)",
              padding: 22,
              borderRadius: 10,
              maxWidth: 600,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 16
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--accent)" }}>
                  @{selectedCandidate.sourceHandle} Karar Detayları
                </h3>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Target Account: @{selectedCandidate.accountHandle}</span>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20 }}
              >
                ×
              </button>
            </div>

            {/* Post text */}
            <div style={{ background: "var(--bg-surface)", padding: 14, borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>KAYNAK GÖNDERİ METNİ</div>
              <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {selectedCandidate.content}
              </div>
            </div>

            {/* Opportunity Breakdown */}
            <div style={{ background: "var(--bg-surface)", padding: 14, borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>ÖNERİ GEREKÇESİ</div>
              <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>
                {selectedCandidate.score.reason}
              </div>
            </div>

            {/* Heuristic pattern details */}
            <div style={{ background: "var(--bg-surface)", padding: 14, borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>PATTERN EXTRACTION DETAYLARI</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11 }}>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Tetikleyici Duygu:</span>{" "}
                  <span style={{ color: "var(--text-primary)" }}>{selectedCandidate.pattern.emotionalTrigger}</span>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Viral Mekanik Nedeni:</span>{" "}
                  <span style={{ color: "var(--text-primary)" }}>{selectedCandidate.pattern.viralityReason}</span>
                </div>
                {selectedCandidate.pattern.suggestedPatterns.length > 0 && (
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Şablon Başlıkları:</span>{" "}
                    <span style={{ color: "var(--accent)" }}>{selectedCandidate.pattern.suggestedPatterns.join(", ")}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 14 }}>
              <button
                onClick={() => setSelectedCandidate(null)}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "var(--text-primary)",
                  padding: "8px 16px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer"
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal: Draft Generator & Critic Preview */}
      {draftModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: 16
          }}
        >
          <div
            style={{
              background: "var(--bg-base)",
              border: "1px solid rgba(255,255,255,0.08)",
              padding: 22,
              borderRadius: 10,
              maxWidth: 900,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 16
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--accent)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>Taslak Oluşturucu & Eleştirmen</span>
                  <span style={{ fontSize: 10, background: "rgba(225,29,72,0.15)", color: "var(--accent)", padding: "1px 5px", borderRadius: 3 }}>
                    {selectedActionType}
                  </span>
                </h3>
                <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "block" }}>
                  Hedef Hesap: @{currentDraftTargetPost?.accountHandle}
                </span>
              </div>
              <button
                onClick={() => setDraftModalOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20 }}
              >
                ×
              </button>
            </div>

            {generatingDrafts ? (
              <div style={{ textAlign: "center", padding: "60px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ width: 30, height: 30, border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite" }}></div>
                <style>{`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}</style>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Hesap tınısı ve kısıtlamalarına göre 3 taslak alternatifi üretiliyor ve eleştirmen tarafından puanlanıyor...
                </div>
              </div>
            ) : generatingError ? (
              <div style={{ textAlign: "center", padding: "40px 10px", color: "var(--danger)", fontSize: 13, background: "rgba(248,113,113,0.05)", borderRadius: 6 }}>
                {generatingError}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Source post summary in modal */}
                <div style={{ background: "var(--bg-surface)", padding: 12, borderRadius: 6, border: "1px solid rgba(255,255,255,0.03)" }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>KAYNAK GÖNDERİ</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {currentDraftTargetPost?.content}
                  </div>
                </div>

                {/* 3 Variants Columns layout */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                  {generatedDraftsList.map((item, idx) => {
                    const draftId = item.draft.id;
                    const contentValue = editableDrafts[draftId] ?? item.draft.content;
                    const c = item.critic;
                    const fStatus = feedbackStatus[draftId];
                    const isSaving = savingQueueId === draftId;

                    return (
                      <div
                        key={draftId}
                        style={{
                          background: "var(--bg-surface)",
                          border: "1px solid rgba(255,255,255,0.04)",
                          borderRadius: 8,
                          padding: 14,
                          display: "flex",
                          flexDirection: "column",
                          gap: 12
                        }}
                      >
                        {/* Title & Badge */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              background:
                                item.draft.angle === "safe"
                                  ? "rgba(74,222,128,0.12)"
                                  : item.draft.angle === "strong"
                                  ? "rgba(96,165,250,0.12)"
                                  : "rgba(244,63,94,0.12)",
                              color:
                                item.draft.angle === "safe"
                                  ? "var(--green)"
                                  : item.draft.angle === "strong"
                                  ? "var(--blue)"
                                  : "var(--danger)",
                              padding: "2px 6px",
                              borderRadius: 4
                            }}
                          >
                            {item.draft.angle} Açı
                          </span>

                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
                            Skor: {c.publishScore}%
                          </span>
                        </div>

                        {/* Reasoning */}
                        <div style={{ fontSize: 10, color: "var(--text-muted)", background: "rgba(255,255,255,0.02)", padding: 6, borderRadius: 4 }}>
                          {item.draft.reasoning}
                        </div>

                        {/* Editable Content Textarea */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 500 }}>TASLAK METNİ (DÜZENLENEBİLİR)</label>
                          <textarea
                            value={contentValue}
                            onChange={(e) => setEditableDrafts((prev) => ({ ...prev, [draftId]: e.target.value }))}
                            style={{
                              background: "var(--bg-base)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              color: "var(--text-primary)",
                              padding: 10,
                              borderRadius: 6,
                              fontSize: 12,
                              minHeight: 90,
                              resize: "vertical",
                              outline: "none",
                              fontFamily: "inherit",
                              lineHeight: 1.4
                            }}
                          />
                          <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 9, color: contentValue.length > 280 ? "var(--danger)" : "rgba(255,255,255,0.3)" }}>
                            Karakter: {contentValue.length} / 280
                          </div>
                        </div>

                        {/* Critic Breakdown */}
                        <div
                          style={{
                            background: "var(--bg-base)",
                            padding: 10,
                            borderRadius: 6,
                            border: "1px solid rgba(255,255,255,0.03)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8
                          }}
                        >
                          <div style={{ fontSize: 9, color: "var(--accent)", fontWeight: 600 }}>ELEŞTİRMEN DETAYLARI:</div>
                          
                          {/* Scoring Bars */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 10 }}>
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                <span style={{ color: "var(--text-muted)" }}>Persona Uyumu:</span>
                                <span>{c.personaMatchScore}%</span>
                              </div>
                              <div style={{ background: "rgba(255,255,255,0.05)", height: 3, borderRadius: 2 }}>
                                <div style={{ background: "var(--accent)", height: "100%", width: `${c.personaMatchScore}%`, borderRadius: 2 }} />
                              </div>
                            </div>

                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                <span style={{ color: "var(--text-muted)" }}>Kanca Gücü:</span>
                                <span>{c.hookStrengthScore}%</span>
                              </div>
                              <div style={{ background: "rgba(255,255,255,0.05)", height: 3, borderRadius: 2 }}>
                                <div style={{ background: "var(--blue)", height: "100%", width: `${c.hookStrengthScore}%`, borderRadius: 2 }} />
                              </div>
                            </div>

                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                <span style={{ color: "var(--text-muted)" }}>Risk Puanı:</span>
                                <span style={{ color: c.riskScore >= 50 ? "var(--danger)" : "var(--green)" }}>{c.riskScore}%</span>
                              </div>
                              <div style={{ background: "rgba(255,255,255,0.05)", height: 3, borderRadius: 2 }}>
                                <div style={{ background: c.riskScore >= 50 ? "var(--danger)" : "var(--green)", height: "100%", width: `${c.riskScore}%`, borderRadius: 2 }} />
                              </div>
                            </div>
                          </div>

                          {c.rewriteSuggestion && (
                            <div style={{ fontSize: 9, color: "var(--danger)", background: "rgba(248,113,113,0.04)", padding: 6, borderRadius: 4, marginTop: 4 }}>
                              <strong>Öneri:</strong> {c.rewriteSuggestion}
                            </div>
                          )}
                        </div>

                        {/* Variant Actions */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 10 }}>
                          <button
                            onClick={() => handleCopyDraft(draftId, contentValue)}
                            style={{
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              color: "var(--text-primary)",
                              fontSize: 9,
                              padding: "4px 8px",
                              borderRadius: 4,
                              cursor: "pointer"
                            }}
                          >
                            Kopyala
                          </button>

                          {/* Feedback Approved */}
                          <button
                            onClick={() => handleSaveFeedback(item, "approved")}
                            disabled={fStatus === "approved"}
                            style={{
                              background: fStatus === "approved" ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.03)",
                              border: fStatus === "approved" ? "1px solid var(--green)" : "1px solid rgba(255,255,255,0.08)",
                              color: fStatus === "approved" ? "var(--green)" : "var(--text-primary)",
                              fontSize: 9,
                              padding: "4px 8px",
                              borderRadius: 4,
                              cursor: "pointer"
                            }}
                          >
                            {fStatus === "approved" ? "Onaylandı ✓" : "Onayla (Feedback)"}
                          </button>

                          {/* Feedback Rejected */}
                          <button
                            onClick={() => handleSaveFeedback(item, "rejected")}
                            disabled={fStatus === "rejected"}
                            style={{
                              background: fStatus === "rejected" ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.03)",
                              border: fStatus === "rejected" ? "1px solid var(--danger)" : "1px solid rgba(255,255,255,0.08)",
                              color: fStatus === "rejected" ? "var(--danger)" : "var(--text-primary)",
                              fontSize: 9,
                              padding: "4px 8px",
                              borderRadius: 4,
                              cursor: "pointer"
                            }}
                          >
                            {fStatus === "rejected" ? "Reddet" : "Reddet"}
                          </button>

                          {/* Send to Queue */}
                          <button
                            onClick={() => handleSaveToQueue(item)}
                            disabled={isSaving}
                            style={{
                              background: "rgba(225,29,72,0.12)",
                              border: "1px solid rgba(225,29,72,0.2)",
                              color: "var(--accent)",
                              fontSize: 9,
                              fontWeight: 600,
                              padding: "4px 8px",
                              borderRadius: 4,
                              cursor: "pointer",
                              marginLeft: "auto"
                            }}
                          >
                            {isSaving ? "Ekleniyor..." : "Kuyruğa At"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Modal Footer Close */}
            <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 14 }}>
              <button
                onClick={() => setDraftModalOpen(false)}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "var(--text-primary)",
                  padding: "8px 16px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer"
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
