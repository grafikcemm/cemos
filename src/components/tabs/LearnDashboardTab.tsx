"use client";

import { useCallback, useEffect, useState } from "react";
import { GraduationCap, Plus, RefreshCw, Brain, CalendarClock, Layers, AlertTriangle } from "lucide-react";
import {
  PageHeader,
  Card,
  MetricCard,
  EmptyState,
  Badge,
  Button,
  Input,
  Textarea,
  Skeleton,
  useToast,
} from "@/components/ui";
import LearnProcessingView from "@/components/learn/LearnProcessingView";
import LearnPackView from "@/components/learn/LearnPackView";
import LearnReviewView from "@/components/learn/LearnReviewView";
import { categoryLabel } from "@/lib/learning/types";

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

const STATUS: Record<string, { label: string; variant: "accent" | "muted" | "default" }> = {
  new: { label: "Bekliyor", variant: "muted" },
  processing: { label: "İşleniyor", variant: "accent" },
  ready: { label: "Hazır", variant: "default" },
  failed: { label: "Hata", variant: "muted" },
};

export default function LearnDashboardTab() {
  const toast = useToast();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [view, setView] = useState<View>({ mode: "dash" });
  const [url, setUrl] = useState("");
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/learn/sources");
      if (res.status === 404) {
        setDisabled(true);
        setLoading(false);
        return;
      }
      // 500/boş gövde JSON parse'ı patlatmasın — hata durumu null data'ya iner.
      const json = await res.json().catch(() => null);
      setData(json?.success ? json : null);
    } catch {
      setData(null);
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
        toast.error(json.code === "invalid_url" ? "Geçerli bir YouTube URL'si girin." : json.error || "Eklenemedi");
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
    } finally {
      setAdding(false);
    }
  }

  if (view.mode === "processing")
    return (
      <div style={{ width: "100%" }}>
        <PageHeader eyebrow="YOUTUBE" title="Youtube Öğrenme Kütüphanesi" />
        <LearnProcessingView
          jobId={view.jobId}
          sourceId={view.sourceId}
          onDone={(packId) => setView(packId ? { mode: "pack", packId } : { mode: "dash" })}
          onCancel={() => setView({ mode: "dash" })}
        />
      </div>
    );
  if (view.mode === "pack")
    return (
      <div style={{ width: "100%" }}>
        <LearnPackView packId={view.packId} onBack={() => setView({ mode: "dash" })} />
      </div>
    );
  if (view.mode === "review")
    return (
      <div style={{ width: "100%" }}>
        <PageHeader eyebrow="YOUTUBE" title="Tekrar Oturumu" />
        <LearnReviewView onBack={() => setView({ mode: "dash" })} />
      </div>
    );

  if (disabled)
    return (
      <div style={{ width: "100%" }}>
        <PageHeader eyebrow="YOUTUBE" title="Youtube Öğrenme Kütüphanesi" subtitle="YouTube videolarını kalıcı öğrenmeye dönüştüren motor." />
        <Card variant="feature" padded>
          <EmptyState
            icon={<GraduationCap size={22} strokeWidth={1.8} />}
            title="Modül kapalı"
            description="Youtube Öğrenme Kütüphanesi şu an devre dışı. Etkinleştirmek için LEARN_ENABLED=true ortam değişkenini ayarlayın."
          />
        </Card>
      </div>
    );

  return (
    <div style={{ width: "100%" }}>
      <PageHeader
        eyebrow="YOUTUBE"
        title="Youtube Öğrenme Kütüphanesi"
        subtitle="Eğitici YouTube videolarını kaynaklı notlara, karta ve aralıklı tekrara dönüştür — hazır paketler Obsidian vault'una otomatik düşer."
        actions={
          <Button variant="secondary" size="sm" onClick={load} iconLeft={<RefreshCw size={15} strokeWidth={2} />}>
            Yenile
          </Button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
        <MetricCard label="Hazır paket" value={data?.readyPacks ?? 0} icon={<Layers size={16} strokeWidth={1.8} />} accent />
        <MetricCard label="Bugün tekrar" value={data?.dueToday ?? 0} icon={<CalendarClock size={16} strokeWidth={1.8} />} />
        <MetricCard label="Ort. mastery" value={data?.avgMastery ?? 0} icon={<Brain size={16} strokeWidth={1.8} />} />
      </div>

      {(data?.dueToday ?? 0) > 0 && (
        <Card variant="quiet" padded style={{ marginBottom: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CalendarClock size={16} strokeWidth={2} style={{ color: "var(--accent-text)" }} />
            <span style={{ flex: 1, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
              Bugün tekrar edilecek {data?.dueToday} kart var.
            </span>
            <Button variant="primary" size="sm" onClick={() => setView({ mode: "review" })}>
              Tekrara başla
            </Button>
          </div>
        </Card>
      )}

      <Card variant="feature" padded style={{ marginBottom: "var(--space-5)" }}>
        <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: "var(--space-2)" }}>
          KAYNAK EKLE
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <Input placeholder="YouTube video URL'si" value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
          <Button
            variant="primary"
            size="sm"
            onClick={addSource}
            disabled={adding || !url.trim()}
            loading={adding}
            iconLeft={adding ? undefined : <Plus size={15} strokeWidth={2} />}
          >
            Ekle
          </Button>
        </div>
        <button
          onClick={() => setShowManual((v) => !v)}
          style={{
            marginTop: 8,
            background: "none",
            border: "none",
            color: "var(--accent-text)",
            fontSize: "var(--text-xs)",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: 0,
          }}
        >
          {showManual ? "Manuel transkripti gizle" : "Transkript yoksa manuel yapıştır"}
        </button>
        {showManual && (
          <Textarea
            placeholder="Video transkriptini buraya yapıştırın (altyazı yoksa)"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            style={{ marginTop: 8, minHeight: 120 }}
          />
        )}
      </Card>

      {loading ? (
        <Card variant="feature" padded>
          <Skeleton lines={4} height={16} />
        </Card>
      ) : !data || data.sources.length === 0 ? (
        <Card variant="feature" padded>
          <EmptyState
            icon={<GraduationCap size={22} strokeWidth={1.8} />}
            title="Henüz kaynak yok"
            description="Bir YouTube video URL'si ekleyerek ilk öğrenme paketini oluştur."
          />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {data.sources.map((s) => {
            const st = STATUS[s.status] ?? STATUS.new;
            const clickable = s.status === "ready" ? !!s.packId : !!s.jobId;
            const onOpen = () => {
              if (s.status === "ready" && s.packId) setView({ mode: "pack", packId: s.packId });
              else if (s.jobId) setView({ mode: "processing", jobId: s.jobId, sourceId: s.id });
            };
            return (
              <Card key={s.id} variant="default" padded>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      onClick={clickable ? onOpen : undefined}
                      style={{
                        fontSize: "var(--text-sm)",
                        fontWeight: 500,
                        color: "var(--text-primary)",
                        cursor: clickable ? "pointer" : "default",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.title || s.url}
                    </div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{s.channelTitle || "—"}</div>
                  </div>
                  {s.status === "ready" && (
                    <>
                      <Badge variant="muted" size="xs">
                        {categoryLabel(s.category)}
                      </Badge>
                      <Badge variant="accent" size="xs">
                        mastery {s.masteryScore}
                      </Badge>
                    </>
                  )}
                  {s.status === "failed" && <AlertTriangle size={14} strokeWidth={2} style={{ color: "var(--danger)" }} />}
                  <Badge variant={st.variant} size="sm">
                    {st.label}
                  </Badge>
                  {clickable && (
                    <Button variant="ghost" size="sm" onClick={onOpen}>
                      {s.status === "ready" ? "Aç" : "Devam"}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
