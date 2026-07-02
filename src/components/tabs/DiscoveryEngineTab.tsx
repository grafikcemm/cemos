"use client";

import { useEffect, useState } from "react";
import {
  Search,
  BrainCircuit,
  PenLine,
  Rocket,
  Check,
  X as XIcon,
  AlertTriangle,
  Telescope,
  Layers,
  Sparkles,
  KeyRound,
} from "lucide-react";
import { useXAgentStore } from "@/store/xagent";
import { fetchJson } from "@/lib/utils/safeFetch";
import { PageHeader, Card, Button, MetricCard, EmptyState } from "../ui";

type CouncilVerdict = {
  sourcePostId: string;
  sourceType: string;
  score: number;
  verdict: string;
  rationale: string;
};

type MiningSummary = {
  considered: number;
  deliberated: number;
  mined: number;
  skipped: number;
  errors: number;
  verdicts: CouncilVerdict[];
};

type DiscoverySummary = {
  fetched: number;
  afterDedupe: number;
  kept: number;
  inserted: number;
  byType: Record<string, number>;
  preFilterUsedLlm: boolean;
  errors: string[];
};

type DailyRunSummary = {
  handle: string;
  discovery: DiscoverySummary | null;
  mining: MiningSummary | null;
  created: number;
  target: number;
  blocked: number;
  reason: string;
  dailyMax?: number;
  todayDrafts?: number;
};

type HealthShape = {
  openrouter?: { ok: boolean };
  socialdata?: { ok: boolean };
  database?: { ok: boolean };
};

// Machine reasons → operator-readable Turkish.
function reasonText(r: DailyRunSummary): string {
  if (r.reason === "daily_target_met") {
    const quota =
      r.dailyMax != null && r.todayDrafts != null ? ` (${r.todayDrafts}/${r.dailyMax})` : "";
    return `Bugünkü taslak hedefi zaten dolu${quota}. Kota yarın 06:00 cron'unda yenilenir.`;
  }
  return r.reason;
}

function verdictColor(v: string): string {
  if (v === "strong") return "var(--green)";
  if (v === "maybe") return "var(--accent-2-text)";
  return "var(--danger)";
}

type RunPhase = null | "discover" | "mine" | "generate";
type StepId = "discover" | "mine" | "generate";
type StepStatus = "pending" | "running" | "done" | "error";

const STEPS: { id: StepId; label: string; Icon: typeof Search }[] = [
  { id: "discover", label: "Keşif", Icon: Search },
  { id: "mine", label: "Müzakere", Icon: BrainCircuit },
  { id: "generate", label: "Üretim", Icon: PenLine },
];

const PHASE_LABELS: Record<StepId, string> = {
  discover: "Keşif",
  mine: "Müzakere",
  generate: "Üretim",
};

const STEP_COLORS: Record<StepStatus, { bg: string; border: string; fg: string }> = {
  pending: { bg: "var(--bg-surface)", border: "var(--border)", fg: "var(--text-muted)" },
  running: { bg: "var(--gradient-accent), var(--bg-surface)", border: "var(--accent-border)", fg: "var(--accent-text)" },
  done: { bg: "color-mix(in srgb, var(--green) 8%, transparent)", border: "color-mix(in srgb, var(--green) 30%, transparent)", fg: "var(--green)" },
  error: { bg: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "color-mix(in srgb, var(--danger) 30%, transparent)", fg: "var(--danger)" },
};

export default function DiscoveryEngineTab() {
  const channel = useXAgentStore((s) => s.activeChannel);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<RunPhase>(null);
  const [done, setDone] = useState<Set<StepId>>(new Set());
  const [failedPhase, setFailedPhase] = useState<StepId | null>(null);
  const [result, setResult] = useState<DailyRunSummary | null>(null);
  const [miningOnly, setMiningOnly] = useState<MiningSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ön-uçuş: API anahtarları hazır mı? Eksikse koşmadan net mesaj.
  const [health, setHealth] = useState<HealthShape | null>(null);
  useEffect(() => {
    let mounted = true;
    fetchJson<HealthShape>("/api/health")
      .then((h) => {
        if (mounted) setHealth(h);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const missingKeys: string[] = [];
  if (health) {
    if (!health.openrouter?.ok) missingKeys.push("OPENROUTER_API_KEY (konsey + üretim)");
    if (!health.socialdata?.ok) missingKeys.push("SOCIALDATA_API_KEY (X/Reddit keşfi)");
  }
  const blocked = missingKeys.length > 0;

  function stepStatus(id: StepId): StepStatus {
    if (failedPhase === id) return "error";
    if (done.has(id)) return "done";
    if (phase === id) return "running";
    return "pending";
  }

  // Split run: 3 sequential invocations (discover → mine → generate) so no
  // single call can hit the Vercel function timeout. A failing phase keeps the
  // partial result of the phases that already completed.
  async function runFull() {
    setLoading(true);
    setError(null);
    setMiningOnly(null);
    setResult(null);
    setDone(new Set());
    setFailedPhase(null);
    let currentPhase: StepId = "discover";
    try {
      setPhase("discover");
      const discovery = await fetchJson<{ success: boolean; error?: string } & DiscoverySummary>(
        "/api/growth/discover",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: channel }),
        }
      );
      if (!discovery.success) throw new Error(discovery.error || "Keşif başarısız");
      const afterDiscovery: DailyRunSummary = {
        handle: channel,
        discovery,
        mining: null,
        created: 0,
        target: 0,
        blocked: 0,
        reason: "",
      };
      setResult(afterDiscovery);
      setDone((d) => new Set(d).add("discover"));

      currentPhase = "mine";
      setPhase("mine");
      const mined = await fetchJson<{ success: boolean; error?: string } & MiningSummary>(
        "/api/growth/mine",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: channel, limit: 3 }),
        }
      );
      if (!mined.success) throw new Error(mined.error || "Müzakere başarısız");
      setResult({ ...afterDiscovery, mining: mined });
      setDone((d) => new Set(d).add("mine"));

      currentPhase = "generate";
      setPhase("generate");
      const generated = await fetchJson<{ success: boolean; error?: string } & DailyRunSummary>(
        "/api/growth/generate-daily",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: channel }),
        }
      );
      if (!generated.success) throw new Error(generated.error || "Üretim başarısız");
      setResult({ ...generated, discovery, mining: mined });
      setDone((d) => new Set(d).add("generate"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Hata";
      setFailedPhase(currentPhase);
      setError(`${PHASE_LABELS[currentPhase]} aşaması başarısız: ${msg}. Tamamlanan aşamaların sonucu korundu.`);
    } finally {
      setLoading(false);
      setPhase(null);
    }
  }

  async function runMiningOnly() {
    setLoading(true);
    setPhase("mine");
    setError(null);
    setResult(null);
    setDone(new Set());
    setFailedPhase(null);
    try {
      const json = await fetchJson<{ success: boolean; error?: string } & MiningSummary>(
        "/api/growth/mine",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: channel }),
        }
      );
      if (!json.success) throw new Error(json.error || "Müzakere başarısız");
      setMiningOnly(json as MiningSummary);
      setDone((d) => new Set(d).add("mine"));
    } catch (e) {
      setFailedPhase("mine");
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
      setPhase(null);
    }
  }

  const mining = result?.mining ?? miningOnly;
  const showStepper = loading || done.size > 0 || failedPhase !== null;

  return (
    <div style={{ width: "100%", paddingBottom: 60 }}>
      <PageHeader
        surface
        eyebrow="Keşfet"
        title="Keşif Motoru"
        subtitle={`Çok kaynaklı keşif (X · Reddit · YouTube · RSS) → çok-ajanlı müzakere konseyi → viral pattern madenciliği → @${channel} için persona-sadık taslak üretimi.`}
        meta={
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Telescope size={15} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />
              3 aşamalı boru hattı
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={15} strokeWidth={1.8} style={{ color: "var(--accent-2-text)" }} />
              @{channel}
            </span>
          </>
        }
      />

      {/* Ön-uçuş: eksik anahtar uyarısı */}
      {blocked && (
        <Card
          variant="quiet"
          style={{
            marginBottom: "var(--space-4)",
            background: "color-mix(in srgb, var(--accent-2) 6%, var(--bg-base))",
            border: "1px solid var(--accent-2-border)",
          }}
        >
          <div
            className="eyebrow"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--accent-2-text)",
              marginBottom: 8,
            }}
          >
            <AlertTriangle size={16} strokeWidth={2} />
            Keşif Motoru için eksik yapılandırma
          </div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: 10 }}>
            Çalıştırmadan önce şu ortam değişkenleri tanımlanmalı:
          </div>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {missingKeys.map((k) => (
              <li
                key={k}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: "var(--text-sm)",
                  color: "var(--text-primary)",
                }}
              >
                <KeyRound size={15} strokeWidth={1.8} style={{ color: "var(--accent-2-text)", flexShrink: 0 }} />
                <code>{k}</code>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: "var(--space-5)" }}>
        <Button
          variant="primary"
          onClick={runFull}
          disabled={loading || blocked}
          loading={loading}
          iconLeft={loading ? undefined : <Rocket size={16} strokeWidth={2} />}
          title={blocked ? "Eksik API anahtarları — yukarıdaki uyarıya bakın" : undefined}
        >
          {loading && phase
            ? `${PHASE_LABELS[phase]} ediliyor…`
            : "Keşfet + Müzakere + Üret"}
        </Button>
        <Button
          variant="secondary"
          onClick={runMiningOnly}
          disabled={loading || blocked}
          iconLeft={<BrainCircuit size={16} strokeWidth={1.8} />}
        >
          Sadece Müzakere
        </Button>
      </div>

      {/* Faz ilerleme göstergesi */}
      {showStepper && (
        <div style={{ display: "flex", gap: 10, marginBottom: "var(--space-4)" }}>
          {STEPS.map((s, i) => {
            const st = stepStatus(s.id);
            const c = STEP_COLORS[st];
            const StepIcon = s.Icon;
            return (
              <div
                key={s.id}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  background: c.bg,
                  border: `1px solid ${c.border}`,
                  borderRadius: "var(--radius-lg)",
                  fontSize: "var(--text-sm)",
                  color: c.fg,
                  fontWeight: 500,
                  boxShadow: "var(--highlight-top)",
                  transition: "background var(--ease-out), border-color var(--ease-out), color var(--ease-out)",
                }}
              >
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 24,
                    height: 24,
                    borderRadius: "var(--radius-md)",
                    background: "color-mix(in srgb, currentColor 12%, transparent)",
                    flexShrink: 0,
                  }}
                >
                  {st === "done" ? (
                    <Check size={15} strokeWidth={2.2} />
                  ) : st === "error" ? (
                    <XIcon size={15} strokeWidth={2.2} />
                  ) : st === "running" ? (
                    <StepIcon size={15} strokeWidth={2} />
                  ) : (
                    <span className="tnum" style={{ fontSize: "var(--text-xs)", fontWeight: 500 }}>{i + 1}</span>
                  )}
                </span>
                <span>{s.label}</span>
                {st === "running" && <span className="spinner" style={{ marginLeft: "auto" }} />}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <Card
          variant="quiet"
          style={{
            marginBottom: "var(--space-4)",
            background: "color-mix(in srgb, var(--danger) 7%, var(--bg-base))",
            border: "1px solid color-mix(in srgb, var(--danger) 32%, transparent)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            color: "var(--danger)",
            fontSize: "var(--text-sm)",
            lineHeight: 1.55,
          }}
        >
          <AlertTriangle size={16} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </Card>
      )}

      {result?.discovery && (
        <Card variant="feature" style={{ marginBottom: "var(--space-4)" }}>
          <div
            className="eyebrow"
            style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent-text)", marginBottom: 14 }}
          >
            <Search size={15} strokeWidth={1.8} />
            Keşif
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 12, marginBottom: 14 }}>
            <MetricCard label="Kaydedildi" value={result.discovery.inserted} accent />
            <MetricCard label="Ön-filtre sonrası" value={result.discovery.kept} />
          </div>
          <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 8 }}>
            Platform dağılımı
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(result.discovery.byType).map(([k, v]) => (
              <span
                key={k}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  fontSize: "var(--text-xs)",
                  color: "var(--text-secondary)",
                }}
              >
                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{k}</span>
                <span className="tnum" style={{ color: "var(--accent-text)", fontWeight: 500 }}>{v}</span>
              </span>
            ))}
          </div>
          {result.discovery.errors.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: "var(--text-xs)",
                color: "var(--accent-2-text)",
                marginTop: 14,
                lineHeight: 1.5,
              }}
            >
              <AlertTriangle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Kısmi kaynak hataları: {result.discovery.errors.slice(0, 4).join(" · ")}</span>
            </div>
          )}
        </Card>
      )}

      {mining && (
        <Card variant="feature" style={{ marginBottom: "var(--space-4)" }}>
          <div
            className="eyebrow"
            style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent-text)", marginBottom: 4 }}
          >
            <BrainCircuit size={15} strokeWidth={1.8} />
            Müzakere Konseyi
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 14 }}>
            hook · persona · risk · novelty mercekleri
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: 12, marginBottom: 16 }}>
            <MetricCard label="Pattern çıkarıldı" value={mining.mined} accent />
            <MetricCard label="Müzakere edildi" value={mining.deliberated} />
            <MetricCard label="Elendi" value={mining.skipped} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {mining.verdicts.map((v) => (
              <div
                key={v.sourcePostId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                  padding: "10px 12px",
                  background: "var(--bg-base)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "var(--text-xs)",
                    fontWeight: 500,
                    color: verdictColor(v.verdict),
                    minWidth: 64,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: verdictColor(v.verdict),
                      boxShadow: `0 0 0 3px color-mix(in srgb, ${verdictColor(v.verdict)} 20%, transparent)`,
                      flexShrink: 0,
                    }}
                  />
                  <span>{v.verdict}</span>
                  <span className="tnum">{v.score}</span>
                </span>
                <span
                  className="eyebrow"
                  style={{ color: "var(--text-muted)", minWidth: 56, fontSize: "var(--text-2xs)" }}
                >
                  {v.sourceType}
                </span>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.5, flex: 1, minWidth: 0 }}>
                  {v.rationale}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {result && (
        <Card variant="hero">
          <div
            className="eyebrow"
            style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent-text)", marginBottom: 14 }}
          >
            <PenLine size={15} strokeWidth={1.8} />
            Üretim
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span
              className="font-display tnum"
              style={{
                fontSize: "var(--text-4xl)",
                fontWeight: 500,
                lineHeight: 1,
                letterSpacing: "-0.03em",
                color: "var(--accent-text)",
              }}
            >
              {result.created}
            </span>
            <span style={{ fontSize: "var(--text-lg)", color: "var(--text-secondary)" }}>
              / {result.target} taslak üretildi
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: "var(--text-sm)", color: "var(--text-secondary)", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <XIcon size={14} strokeWidth={2} style={{ color: "var(--text-muted)" }} />
              <span className="tnum">{result.blocked}</span> bloklandı
            </span>
            {result.reason ? (
              <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>· {reasonText(result)}</span>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              marginTop: 14,
              paddingTop: 14,
              borderTop: "1px solid var(--border)",
            }}
          >
            <Layers size={14} strokeWidth={1.8} style={{ color: "var(--accent-text)", flexShrink: 0 }} />
            Üretilen taslaklar &quot;Günlük Kuyruk&quot; sekmesinde onaylanmayı bekliyor.
          </div>
        </Card>
      )}

      {/* Boş durum: henüz çalıştırılmadı */}
      {!loading && !result && !mining && !error && (
        <Card variant="quiet" padded={false} style={{ marginTop: "var(--space-2)" }}>
          <EmptyState
            icon={<Telescope size={26} strokeWidth={1.8} />}
            title="Keşif boru hattı bekliyor"
            description="Çok kaynaklı tarama, müzakere konseyi ve persona-sadık taslak üretimini başlatmak için boru hattını çalıştır."
            action={
              <Button
                variant="primary"
                onClick={runFull}
                disabled={loading || blocked}
                iconLeft={<Rocket size={16} strokeWidth={2} />}
                title={blocked ? "Eksik API anahtarları — yukarıdaki uyarıya bakın" : undefined}
              >
                Boru hattını çalıştır
              </Button>
            }
          />
        </Card>
      )}

      <OutlierHighlights />
    </div>
  );
}

type OutlierItem = {
  id: string;
  multiplier: number;
  metricValue: number;
  baselineMedian: number;
  contentItem?: {
    id: string;
    platform?: string | null;
    title?: string | null;
    body?: string | null;
    url?: string | null;
  } | null;
};

/**
 * Öne Çıkanlar — eski İçerik Zekası sekmesinin sadeleşmiş hali. Arkaplandaki
 * outlier motoru (cron'daki syncToCanonical) kendi ortalamasının belirgin
 * üstünde performans gösteren içerikleri işaretler; burada insan diliyle
 * listelenir. Veri yoksa bölüm hiç görünmez (teknik boş-durum jargonu yok).
 */
function OutlierHighlights() {
  const [items, setItems] = useState<OutlierItem[]>([]);

  useEffect(() => {
    let mounted = true;
    fetchJson<{ success: boolean; items?: OutlierItem[] }>("/api/content/outliers?limit=10")
      .then((data) => {
        if (mounted && data.success && data.items) setItems(data.items);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <Card variant="feature" style={{ marginTop: "var(--space-5)" }}>
      <div
        className="eyebrow"
        style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent-text)", marginBottom: 4 }}
      >
        <Sparkles size={15} strokeWidth={1.8} />
        Öne Çıkanlar
      </div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 14 }}>
        Takip edilen kaynaklarda kendi ortalamasının belirgin üstüne çıkan içerikler — üretim için en sıcak referanslar.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((o) => {
          const title = o.contentItem?.title || o.contentItem?.body?.slice(0, 120) || "İçerik";
          const times = o.multiplier >= 10 ? Math.round(o.multiplier) : Math.round(o.multiplier * 10) / 10;
          return (
            <div
              key={o.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "var(--bg-base)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
              }}
            >
              <span
                className="tnum"
                title={`Bu içerik, üreticisinin tipik performansının ${times} katına ulaştı`}
                style={{
                  flexShrink: 0,
                  minWidth: 52,
                  textAlign: "center",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  color: "var(--accent-text)",
                  background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                  border: "1px solid var(--accent-border)",
                  borderRadius: "var(--radius-pill)",
                  padding: "3px 10px",
                }}
              >
                {times}×
              </span>
              {o.contentItem?.platform && (
                <span className="eyebrow" style={{ color: "var(--text-muted)", fontSize: "var(--text-2xs)", flexShrink: 0 }}>
                  {o.contentItem.platform}
                </span>
              )}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "var(--text-sm)",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {o.contentItem?.url ? (
                  <a
                    href={o.contentItem.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "inherit", textDecoration: "none" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "inherit")}
                  >
                    {title}
                  </a>
                ) : (
                  title
                )}
              </span>
              <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", flexShrink: 0 }}>
                ortalaması {Math.round(o.baselineMedian).toLocaleString("tr-TR")} → {Math.round(o.metricValue).toLocaleString("tr-TR")}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
