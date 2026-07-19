"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GraduationCap, Plus, RefreshCw, CalendarClock, AlertTriangle, Info, Video, FileText, BookOpen } from "lucide-react";
import {
  Card,
  MetricStrip,
  EmptyState,
  ErrorState,
  Badge,
  Button,
  Input,
  Textarea,
  Skeleton,
  BlockedExternalState,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import LearnProcessingView from "@/components/learn/LearnProcessingView";
import LearnPackView from "@/components/learn/LearnPackView";
import LearnReviewView from "@/components/learn/LearnReviewView";
import { categoryLabel } from "@/lib/learning/types";

/**
 * Kütüphane / Öğrenme (05 §D3, 4C) — youtube / manuel transkript / NotebookLM özeti
 * kaynaklarından kaynaklı öğrenme paketleri + SRS. Kaynak ekleme AÇIK üç seçenek;
 * NotebookLM özeti "doğrulanmış transkript değildir" uyarısıyla. Durum = kanonik
 * userState (4C-E). env kapısı korunur (404 → dürüst blocked-external).
 */

type SourceRow = {
  id: string;
  kind: string;
  title: string;
  channelTitle: string;
  url: string;
  status: string;
  userState: string;
  userStateLabel: string;
  packId: string | null;
  jobId: string | null;
  masteryScore: number;
  category: string;
};
type Dashboard = { sources: SourceRow[]; readyPacks: number; dueToday: number; avgMastery: number };
type View =
  | { mode: "dash" }
  | { mode: "processing"; jobId: string; sourceId: string | null }
  | { mode: "pack"; packId: string }
  | { mode: "review" };

type StatusTab = "inbox" | "learning" | "ready";
type AddMode = "youtube" | "manual_transcript" | "notebooklm_summary";

const STATE_VARIANT: Record<string, "accent" | "muted" | "default" | "danger"> = {
  inbox: "muted",
  processing: "accent",
  transcript_required: "danger",
  budget_blocked: "accent",
  needs_review: "accent",
  ready: "default",
  failed: "danger",
};

const KIND_META: Record<string, { label: string; icon: typeof Video }> = {
  youtube: { label: "YouTube", icon: Video },
  manual_transcript: { label: "Manuel", icon: FileText },
  notebooklm_summary: { label: "NotebookLM", icon: BookOpen },
};

const ADD_MODES: { id: AddMode; label: string; icon: typeof Video }[] = [
  { id: "youtube", label: "YouTube URL", icon: Video },
  { id: "manual_transcript", label: "Manuel transkript", icon: FileText },
  { id: "notebooklm_summary", label: "NotebookLM özeti", icon: BookOpen },
];

export default function LibOgrenmeTab() {
  const toast = useToast();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>({ mode: "dash" });
  const [statusTab, setStatusTab] = useState<StatusTab>("inbox");
  const [addMode, setAddMode] = useState<AddMode>("youtube");
  const [adding, setAdding] = useState(false);

  // Kaynak ekleme alanları (moda göre)
  const [url, setUrl] = useState("");
  const [ytManual, setYtManual] = useState("");
  const [ytShowManual, setYtShowManual] = useState(false);
  const [manualText, setManualText] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [nbText, setNbText] = useState("");
  const [nbTitle, setNbTitle] = useState("");
  const [nbUrl, setNbUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/learn/sources");
      if (res.status === 404) {
        setDisabled(true);
        return;
      }
      const json = await res.json().catch(() => null);
      if (json?.success) setData(json);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view.mode === "dash") load();
  }, [view, load]);

  function buildBody(): Record<string, unknown> | null {
    if (addMode === "youtube") {
      if (!url.trim()) return null;
      return { kind: "youtube", url, manualTranscript: ytManual.trim() || undefined };
    }
    if (addMode === "manual_transcript") {
      if (manualText.trim().length < 200) return null;
      return { kind: "manual_transcript", text: manualText, title: manualTitle.trim() || undefined };
    }
    if (nbText.trim().length < 200) return null;
    return { kind: "notebooklm_summary", summary: nbText, title: nbTitle.trim() || undefined, sourceUrl: nbUrl.trim() || undefined };
  }

  const canAdd =
    addMode === "youtube" ? url.trim().length > 0 : (addMode === "manual_transcript" ? manualText.trim().length >= 200 : nbText.trim().length >= 200);

  async function addSource() {
    const body = buildBody();
    if (!body) return;
    setAdding(true);
    try {
      const res = await fetch("/api/learn/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(
          json.code === "invalid_url" ? "Geçerli bir YouTube URL'si girin." : json.code === "invalid_input" ? json.error || "İçerik çok kısa." : json.error || "Eklenemedi."
        );
        return;
      }
      setUrl("");
      setYtManual("");
      setYtShowManual(false);
      setManualText("");
      setManualTitle("");
      setNbText("");
      setNbTitle("");
      setNbUrl("");
      if (json.alreadyReady && json.jobId) {
        const ready = await fetch(`/api/learn/jobs/${json.jobId}`);
        const rj = await ready.json();
        if (rj.success && rj.job.packId) {
          setView({ mode: "pack", packId: rj.job.packId });
          return;
        }
      }
      setView({ mode: "processing", jobId: json.jobId, sourceId: json.sourceId });
    } catch {
      toast.error("Eklenemedi (ağ hatası).");
    } finally {
      setAdding(false);
    }
  }

  const grouped = useMemo(() => {
    const src = data?.sources ?? [];
    return {
      inbox: src.filter((s) => s.userState === "inbox"),
      learning: src.filter((s) => ["processing", "transcript_required", "budget_blocked", "failed", "needs_review"].includes(s.userState)),
      ready: src.filter((s) => s.userState === "ready"),
    };
  }, [data]);

  // ── Alt-görünümler ──
  if (view.mode === "processing") {
    return (
      <LearnProcessingView
        jobId={view.jobId}
        sourceId={view.sourceId}
        onDone={(packId) => setView(packId ? { mode: "pack", packId } : { mode: "dash" })}
        onCancel={() => setView({ mode: "dash" })}
      />
    );
  }
  if (view.mode === "pack") return <LearnPackView packId={view.packId} onBack={() => setView({ mode: "dash" })} />;
  if (view.mode === "review") return <LearnReviewView onBack={() => setView({ mode: "dash" })} />;

  if (disabled) {
    return (
      <BlockedExternalState
        title="Öğrenme modülü kapalı"
        description="Öğrenme motoru şu an devre dışı. Etkinleştirmek için ortam değişkenlerini ayarla; kaynak eklendikçe kaynaklı notlar, kartlar ve aralıklı tekrar üretilir."
        detail="Gerekli: LEARN_ENABLED=true (sunucu) + NEXT_PUBLIC_LEARN_ENABLED=true (istemci)."
      />
    );
  }

  const tabs: { id: StatusTab; label: string; count: number }[] = [
    { id: "inbox", label: "Gelen kutusu", count: grouped.inbox.length },
    { id: "learning", label: "Öğreniliyor", count: grouped.learning.length },
    { id: "ready", label: "Hazır bilgi", count: grouped.ready.length },
  ];
  const rows = grouped[statusTab];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}>
      <MetricStrip
        data-testid="learn-metrics"
        items={[
          { label: "hazır paket", value: data?.readyPacks ?? 0 },
          { label: "bugün tekrar", value: data?.dueToday ?? 0, tone: (data?.dueToday ?? 0) > 0 ? "accent" : "default" },
          { label: "ort. mastery", value: data?.avgMastery ?? 0 },
        ]}
      />

      {(data?.dueToday ?? 0) > 0 && (
        <Card variant="quiet" padded>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <CalendarClock size={16} strokeWidth={2} style={{ color: "var(--accent-text)" }} />
            <span style={{ flex: 1, minWidth: 160, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Bugün tekrar edilecek {data?.dueToday} kart var.</span>
            <Button variant="primary" size="sm" onClick={() => setView({ mode: "review" })}>Tekrara başla</Button>
          </div>
        </Card>
      )}

      {/* Kaynak ekle — üç AÇIK seçenek */}
      <Card variant="feature" padded>
        <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>Kaynak ekle</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {ADD_MODES.map((m) => {
            const active = addMode === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setAddMode(m.id)}
                aria-pressed={active}
                data-testid={`add-mode-${m.id}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 12px",
                  borderRadius: "var(--radius-md)",
                  border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
                  background: active ? "var(--accent-dark)" : "transparent",
                  color: active ? "var(--accent-text)" : "var(--text-secondary)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                <Icon size={14} strokeWidth={2} />
                {m.label}
              </button>
            );
          })}
        </div>

        {addMode === "youtube" && (
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 8 }}>
              YouTube video URL&apos;si — transkript otomatik çekilir; alınamazsa manuel yapıştırırsın.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <Input placeholder="https://youtube.com/watch?v=..." value={url} onChange={(e) => setUrl(e.target.value)} aria-label="YouTube URL" data-testid="learn-url" />
              </div>
              <Button variant="primary" size="sm" onClick={addSource} disabled={adding || !canAdd} loading={adding} iconLeft={adding ? undefined : <Plus size={15} strokeWidth={2} />} data-testid="learn-add">Ekle</Button>
              <Button variant="ghost" size="sm" onClick={load} iconLeft={<RefreshCw size={14} strokeWidth={2} />}>Yenile</Button>
            </div>
            <button onClick={() => setYtShowManual((v) => !v)} style={{ marginTop: 8, background: "none", border: "none", color: "var(--accent-text)", fontSize: "var(--text-xs)", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
              {ytShowManual ? "Manuel transkripti gizle" : "Transkript yoksa manuel yapıştır"}
            </button>
            {ytShowManual && (
              <Textarea placeholder="Video transkriptini buraya yapıştır" value={ytManual} onChange={(e) => setYtManual(e.target.value)} style={{ marginTop: 8, minHeight: 120 }} aria-label="Manuel transkript" />
            )}
          </div>
        )}

        {addMode === "manual_transcript" && (
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 8 }}>
              Elindeki transkript metnini yapıştır (en az 200 karakter). Zaman damgası yoktur — grounding chunk bazlıdır.
            </div>
            <Input placeholder="Başlık (opsiyonel)" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} aria-label="Başlık" style={{ marginBottom: 8 }} />
            <Textarea placeholder="Transkript metni (en az 200 karakter)" value={manualText} onChange={(e) => setManualText(e.target.value)} style={{ minHeight: 160 }} aria-label="Manuel transkript metni" data-testid="manual-text" />
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <Button variant="primary" size="sm" onClick={addSource} disabled={adding || !canAdd} loading={adding} iconLeft={adding ? undefined : <Plus size={15} strokeWidth={2} />} data-testid="learn-add">Ekle</Button>
              <Button variant="ghost" size="sm" onClick={load} iconLeft={<RefreshCw size={14} strokeWidth={2} />}>Yenile</Button>
            </div>
          </div>
        )}

        {addMode === "notebooklm_summary" && (
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 8, display: "flex", gap: 6, alignItems: "flex-start" }}>
              <Info size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1, color: "var(--accent-text)" }} />
              <span>NotebookLM özetini yapıştır. <b>Bu özet, orijinal videonun doğrulanmış transkripti sayılmaz</b> — iddialar &quot;özet temelli&quot; işaretlenir, videoda doğrulanmış gibi gösterilmez.</span>
            </div>
            <Input placeholder="Başlık (opsiyonel)" value={nbTitle} onChange={(e) => setNbTitle(e.target.value)} aria-label="Başlık" style={{ marginBottom: 8 }} />
            <Input placeholder="Kaynak video URL'si (opsiyonel, doğrulanmaz)" value={nbUrl} onChange={(e) => setNbUrl(e.target.value)} aria-label="Kaynak URL" style={{ marginBottom: 8 }} />
            <Textarea placeholder="NotebookLM özeti (en az 200 karakter)" value={nbText} onChange={(e) => setNbText(e.target.value)} style={{ minHeight: 160 }} aria-label="NotebookLM özeti" data-testid="notebooklm-text" />
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <Button variant="primary" size="sm" onClick={addSource} disabled={adding || !canAdd} loading={adding} iconLeft={adding ? undefined : <Plus size={15} strokeWidth={2} />} data-testid="learn-add">Ekle</Button>
              <Button variant="ghost" size="sm" onClick={load} iconLeft={<RefreshCw size={14} strokeWidth={2} />}>Yenile</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Durum sekmeleri */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {tabs.map((t) => {
          const active = statusTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setStatusTab(t.id)}
              aria-pressed={active}
              data-testid={`learn-tab-${t.id}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: "var(--radius-md)", border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`, background: active ? "var(--accent-dark)" : "transparent", color: active ? "var(--accent-text)" : "var(--text-secondary)", fontSize: "var(--text-sm)", fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}
            >
              {t.label}
              <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <Card padded><Skeleton lines={4} /></Card>
      ) : failed ? (
        <ErrorState title="Öğrenme verisi alınamadı" description="Kaynaklar getirilemedi. Yeniden dene." onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={22} strokeWidth={1.8} />}
          title={statusTab === "ready" ? "Henüz hazır bilgi yok" : statusTab === "learning" ? "Şu an işlenen kaynak yok" : "Gelen kutusu boş"}
          description="Bir kaynak ekleyerek ilk öğrenme paketini oluştur — kaynaklı özet, atomik notlar, kavramlar, zihin haritası ve tekrar kartları üretilir."
          compact
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((s) => {
            const kindMeta = KIND_META[s.kind] ?? KIND_META.youtube;
            const KindIcon = kindMeta.icon;
            const isReady = s.userState === "ready";
            // Pack varsa (ready VEYA needs_review/qa) paketi aç; yoksa job'ı sürdür.
            const clickable = !!s.packId || !!s.jobId;
            const onOpen = () => {
              if (s.packId) setView({ mode: "pack", packId: s.packId });
              else if (s.jobId) setView({ mode: "processing", jobId: s.jobId, sourceId: s.id });
            };
            const openLabel = s.packId ? "Aç" : "Devam";
            return (
              <div key={s.id} data-testid="learn-source-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
                <KindIcon size={15} strokeWidth={2} style={{ color: "var(--text-muted)", flexShrink: 0 }} aria-label={kindMeta.label} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div onClick={clickable ? onOpen : undefined} style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)", cursor: clickable ? "pointer" : "default", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.title || s.url || kindMeta.label}
                  </div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{s.channelTitle || kindMeta.label}</div>
                </div>
                {isReady && (
                  <>
                    <Badge variant="muted" size="xs">{categoryLabel(s.category)}</Badge>
                    <Badge variant="accent" size="xs">mastery {s.masteryScore}</Badge>
                  </>
                )}
                {(s.userState === "failed" || s.userState === "transcript_required") && <AlertTriangle size={14} strokeWidth={2} style={{ color: "var(--danger)" }} />}
                <Badge variant={STATE_VARIANT[s.userState] ?? "muted"} size="sm">{s.userStateLabel}</Badge>
                {clickable && (
                  <Button variant="ghost" size="sm" onClick={onOpen}>{openLabel}</Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
