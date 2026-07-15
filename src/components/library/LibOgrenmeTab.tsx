"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GraduationCap, Plus, RefreshCw, CalendarClock, AlertTriangle, Layers, Brain } from "lucide-react";
import {
  Card,
  MetricGrid,
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
 * Kütüphane / Öğrenme (05 §D3) — YouTube/NotebookLM kaynaklarından kaynaklı
 * öğrenme paketleri + SRS. Sakin akış: Gelen kutusu → Öğreniliyor → Hazır bilgi →
 * Bugünkü tekrar. Mevcut Learn alt-görünümleri (Processing/Pack/Review) yeniden
 * kullanılır. env kapısı korunur (404 → dürüst blocked-external). Bare host.
 */

type SourceRow = {
  id: string;
  title: string;
  channelTitle: string;
  url: string;
  status: string;
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

const STATUS_META: Record<string, { label: string; variant: "accent" | "muted" | "default" | "danger" }> = {
  new: { label: "Bekliyor", variant: "muted" },
  processing: { label: "İşleniyor", variant: "accent" },
  ready: { label: "Hazır", variant: "default" },
  failed: { label: "Hata", variant: "danger" },
};

export default function LibOgrenmeTab() {
  const toast = useToast();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>({ mode: "dash" });
  const [statusTab, setStatusTab] = useState<StatusTab>("inbox");
  const [url, setUrl] = useState("");
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [adding, setAdding] = useState(false);

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

  async function addSource() {
    if (!url.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/learn/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, manualTranscript: manual.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.code === "invalid_url" ? "Geçerli bir YouTube URL'si girin." : json.error || "Eklenemedi.");
        return;
      }
      setUrl("");
      setManual("");
      setShowManual(false);
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
      inbox: src.filter((s) => s.status === "new"),
      learning: src.filter((s) => s.status === "processing" || s.status === "failed"),
      ready: src.filter((s) => s.status === "ready"),
    };
  }, [data]);

  // ── Alt-görünümler (Processing / Pack / Review) — mevcut bileşenler ──
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
  if (view.mode === "pack") {
    return <LearnPackView packId={view.packId} onBack={() => setView({ mode: "dash" })} />;
  }
  if (view.mode === "review") {
    return <LearnReviewView onBack={() => setView({ mode: "dash" })} />;
  }

  if (disabled) {
    return (
      <BlockedExternalState
        title="Öğrenme modülü kapalı"
        description="YouTube öğrenme motoru şu an devre dışı. Etkinleştirmek için ortam değişkenlerini ayarla; kaynak eklendikçe kaynaklı notlar, kartlar ve aralıklı tekrar üretilir."
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
      {/* Sessiz metrik şeridi */}
      <MetricGrid
        columns={3}
        items={[
          { label: "Hazır paket", value: data?.readyPacks ?? 0, icon: <Layers size={16} strokeWidth={1.8} /> },
          { label: "Bugün tekrar", value: data?.dueToday ?? 0, icon: <CalendarClock size={16} strokeWidth={1.8} /> },
          { label: "Ort. mastery", value: data?.avgMastery ?? 0, icon: <Brain size={16} strokeWidth={1.8} /> },
        ]}
      />

      {(data?.dueToday ?? 0) > 0 && (
        <Card variant="quiet" padded>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <CalendarClock size={16} strokeWidth={2} style={{ color: "var(--accent-text)" }} />
            <span style={{ flex: 1, minWidth: 160, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
              Bugün tekrar edilecek {data?.dueToday} kart var.
            </span>
            <Button variant="primary" size="sm" onClick={() => setView({ mode: "review" })}>
              Tekrara başla
            </Button>
          </div>
        </Card>
      )}

      {/* Kaynak ekle */}
      <Card variant="feature" padded>
        <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>Kaynak ekle</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <Input placeholder="YouTube video URL'si" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="YouTube URL" data-testid="learn-url" />
          </div>
          <Button variant="primary" size="sm" onClick={addSource} disabled={adding || !url.trim()} loading={adding} iconLeft={adding ? undefined : <Plus size={15} strokeWidth={2} />}>
            Ekle
          </Button>
          <Button variant="ghost" size="sm" onClick={load} iconLeft={<RefreshCw size={14} strokeWidth={2} />}>
            Yenile
          </Button>
        </div>
        <button
          onClick={() => setShowManual((v) => !v)}
          style={{ marginTop: 8, background: "none", border: "none", color: "var(--accent-text)", fontSize: "var(--text-xs)", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
        >
          {showManual ? "Manuel transkripti gizle" : "Transkript yoksa manuel yapıştır"}
        </button>
        {showManual && (
          <Textarea
            placeholder="Video transkriptini buraya yapıştır (altyazı/transcript sağlayıcı düşerse)"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            style={{ marginTop: 8, minHeight: 120 }}
            aria-label="Manuel transkript"
          />
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
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 13px",
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
              {t.label}
              <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Kaynak listesi */}
      {loading ? (
        <Card padded><Skeleton lines={4} /></Card>
      ) : failed ? (
        <ErrorState title="Öğrenme verisi alınamadı" description="Kaynaklar getirilemedi. Yeniden dene." onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={22} strokeWidth={1.8} />}
          title={statusTab === "ready" ? "Henüz hazır bilgi yok" : statusTab === "learning" ? "Şu an işlenen kaynak yok" : "Gelen kutusu boş"}
          description="Bir YouTube URL'si ekleyerek ilk öğrenme paketini oluştur — kaynaklı özet, atomik notlar, kavramlar ve tekrar kartları üretilir."
          compact
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((s) => {
            const st = STATUS_META[s.status] ?? STATUS_META.new;
            const clickable = s.status === "ready" ? !!s.packId : !!s.jobId;
            const onOpen = () => {
              if (s.status === "ready" && s.packId) setView({ mode: "pack", packId: s.packId });
              else if (s.jobId) setView({ mode: "processing", jobId: s.jobId, sourceId: s.id });
            };
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    onClick={clickable ? onOpen : undefined}
                    style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)", cursor: clickable ? "pointer" : "default", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {s.title || s.url}
                  </div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{s.channelTitle || "—"}</div>
                </div>
                {s.status === "ready" && (
                  <>
                    <Badge variant="muted" size="xs">{categoryLabel(s.category)}</Badge>
                    <Badge variant="accent" size="xs">mastery {s.masteryScore}</Badge>
                  </>
                )}
                {s.status === "failed" && <AlertTriangle size={14} strokeWidth={2} style={{ color: "var(--danger)" }} />}
                <Badge variant={st.variant} size="sm">{st.label}</Badge>
                {clickable && (
                  <Button variant="ghost" size="sm" onClick={onOpen}>
                    {s.status === "ready" ? "Aç" : "Devam"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
