"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CircleDollarSign,
  HeartPulse,
  Newspaper,
  RefreshCw,
  ShieldCheck,
  Target,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  PageHeader,
  SectionHeader,
  Skeleton,
} from "@/components/ui";
import { fetchJson } from "@/lib/utils/safeFetch";

/**
 * Sistem gözlem ekranı (Sprint 9 UI dalgası — onaylı plan Phase 5).
 * Dağınık sağlık sinyallerini TEK panede toplar: worker/cron canlılığı,
 * cron auth duruşu, haber pipeline sağlığı, günlük maliyet ve kalite KPI'ları.
 * Salt okuma — mevcut /api/health, /api/costs, /api/eval/kpis uçlarını tüketir;
 * yeni backend yüzeyi YOK.
 */

type WorkerHealth = {
  mode?: "worker" | "cron" | "unknown";
  inferredStatus?: "unknown" | "recent_tick" | "stale";
  recommendation?: string;
  lastTickAt?: string | null;
};

type HealthResponse = {
  success?: boolean;
  worker?: WorkerHealth;
  cronAuth?: { ok?: boolean; status?: string; message?: string };
  newsPipeline?: {
    status?: string;
    message?: string | null;
    rawBacklog?: number;
    failedBacklog?: number;
    translatedLast24h?: number;
    analyzedLast24h?: number;
  };
};

type CostsResponse = {
  today?: { totalUsd?: number };
  // Gerçek yol: lineItems.openRouter.byPreset (bkz. /api/costs route).
  lineItems?: { openRouter?: { byPreset?: Array<{ preset: string; costUsd: number; calls: number }> } };
};

// ok() zarfı payload'ı SPREAD eder — alanlar top-level, `data` sarmalayıcısı YOK.
type KpisResponse = {
  success?: boolean;
  acceptanceRate?: number | null;
  decidedCount?: number;
  medianEditDistance?: number | null;
  editSampleCount?: number;
  goldenPassPct?: number | null;
  goldenScored?: number;
};

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; health: HealthResponse | null; costs: CostsResponse | null; kpis: KpisResponse | null };

const WORKER_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "muted" }> = {
  recent_tick: { label: "Çalışıyor", tone: "ok" },
  stale: { label: "Bayat", tone: "warn" },
  unknown: { label: "Bilinmiyor", tone: "muted" },
};

function StatusDot({ tone }: { tone: "ok" | "warn" | "error" | "muted" }) {
  const color =
    tone === "ok"
      ? "var(--status-ok)"
      : tone === "warn"
        ? "var(--status-warn)"
        : tone === "error"
          ? "var(--status-error)"
          : "var(--text-muted)";
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "var(--radius-pill)",
        background: color,
        boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)`,
      }}
    />
  );
}

function fmtUsd(v: number | null | undefined): string {
  return v == null ? "—" : `$${v.toFixed(2)}`;
}

/** Kompakt stat hücresi — MetricCard'ın yoğun tek-sıra karşılığı (overview arketipi). */
function StatCell({ label, value, icon, accent = false }: { label: string; value: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ background: "var(--bg-surface)", padding: "var(--space-3) var(--space-4)", display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: "var(--text-2xs)",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ display: "inline-flex", color: accent ? "var(--accent-text)" : "var(--text-muted)", flexShrink: 0 }}>{icon}</span>
        {label}
      </span>
      <span
        className="font-display tnum"
        style={{
          fontSize: "var(--text-xl)",
          fontWeight: 500,
          color: accent ? "var(--accent-text)" : "var(--text-primary)",
          letterSpacing: "-0.015em",
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Düz bölüm — kart-içinde-kart yerine SectionHeader + yoğun satırlar; ayraç: --border-faint. */
function PanelSection({ title, children, first = false }: { title: string; children: React.ReactNode; first?: boolean }) {
  return (
    <section style={{ padding: "var(--space-4) var(--space-5)", borderTop: first ? "none" : "1px solid var(--border-faint)" }}>
      <SectionHeader title={title} />
      {children}
    </section>
  );
}

export default function SystemTab() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      // Her uç best-effort: biri düşse pane ölmez, ilgili blok "veri yok" der.
      // NOT: deep=true KULLANMA — canlı OpenRouter/SocialData probe'u yapar,
      // safeFetch timeout'una takılıp paneli "Bilinmiyor"a düşürür.
      const [health, costs, kpis] = await Promise.all([
        fetchJson<HealthResponse>("/api/health").catch(() => null),
        fetchJson<CostsResponse>("/api/costs").catch(() => null),
        fetchJson<KpisResponse>("/api/eval/kpis").catch(() => null),
      ]);
      if (!health && !costs && !kpis) {
        setState({ phase: "error", message: "Sistem uçlarına ulaşılamadı. Sunucu çalışıyor mu?" });
        return;
      }
      setState({ phase: "ready", health, costs, kpis: kpis?.success ? kpis : null });
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : "Sistem durumu alınamadı" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const header = (
    <PageHeader
      size="compact"
      eyebrow="SİSTEM"
      title="Sistem Sağlığı"
      subtitle="Worker, cron, haber pipeline'ı, maliyet ve kalite sinyalleri — tek pane."
      actions={
        <Button variant="secondary" size="sm" onClick={load} iconLeft={<RefreshCw size={15} strokeWidth={2} />}>
          Yenile
        </Button>
      }
    />
  );

  if (state.phase === "loading") {
    return (
      <div style={{ width: "100%" }}>
        {header}
        <Card variant="default" padded={false} style={{ marginBottom: "var(--space-5)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 1, background: "var(--border-faint)" }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ background: "var(--bg-surface)", padding: "var(--space-3) var(--space-4)" }}>
                <Skeleton lines={2} height={12} />
              </div>
            ))}
          </div>
        </Card>
        <Card variant="default" padded>
          <Skeleton lines={6} height={14} />
        </Card>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div style={{ width: "100%" }}>
        {header}
        <Card variant="feature" padded>
          <ErrorState title="Sistem durumu alınamadı" description={state.message} onRetry={load} />
        </Card>
      </div>
    );
  }

  const { health, costs, kpis } = state;
  const worker = health?.worker;
  const workerInfo = WORKER_LABEL[worker?.inferredStatus ?? "unknown"] ?? WORKER_LABEL.unknown;
  const cronAuth = health?.cronAuth;
  const news = health?.newsPipeline;
  const byPreset = (costs?.lineItems?.openRouter?.byPreset ?? []).slice(0, 6);

  return (
    <div style={{ width: "100%" }}>
      {header}

      {/* Özet metrikler — kompakt tek sıra */}
      <Card variant="default" padded={false} style={{ marginBottom: "var(--space-5)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 1, background: "var(--border-faint)" }}>
          <StatCell
            label="Bugün maliyet"
            value={fmtUsd(costs?.today?.totalUsd)}
            icon={<CircleDollarSign size={14} strokeWidth={1.8} />}
            accent
          />
          <StatCell
            label="Arka plan işçisi"
            value={workerInfo.label}
            icon={<Activity size={14} strokeWidth={1.8} />}
          />
          <StatCell
            label="Golden pass"
            value={kpis?.goldenPassPct != null ? `%${kpis.goldenPassPct}` : "—"}
            icon={<Target size={14} strokeWidth={1.8} />}
          />
          <StatCell
            label="Kabul oranı (30g)"
            value={kpis?.acceptanceRate != null ? `%${Math.round(kpis.acceptanceRate * 100)}` : "—"}
            icon={<HeartPulse size={14} strokeWidth={1.8} />}
          />
        </div>
      </Card>

      {/* Tek panel — düz bölümler, --border-faint ayraçlar */}
      <Card variant="default" padded={false}>
        {/* Worker & Cron */}
        <PanelSection title="Worker & Cron" first>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <StatusDot tone={workerInfo.tone} />
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 500 }}>
                {worker?.mode === "cron" ? "Vercel cron modu" : worker?.mode === "worker" ? "Lokal worker modu" : "Mod bilinmiyor"}
              </span>
              <Badge variant={workerInfo.tone === "ok" ? "accent" : "muted"} size="xs">
                {workerInfo.label}
              </Badge>
              {worker?.lastTickAt && (
                <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  son tick: {new Date(worker.lastTickAt).toLocaleString("tr-TR")}
                </span>
              )}
            </div>
            {worker?.recommendation && (
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                {worker.recommendation}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: "var(--space-2)", borderTop: "1px solid var(--border-faint)" }}>
              <ShieldCheck
                size={14}
                strokeWidth={2}
                style={{ color: cronAuth?.ok === false ? "var(--status-error)" : "var(--status-ok)" }}
              />
              <span style={{ fontSize: "var(--text-xs)", color: cronAuth?.ok === false ? "var(--status-error)" : "var(--text-muted)" }}>
                {cronAuth?.message ?? "Cron auth durumu bilinmiyor."}
              </span>
            </div>
          </div>
        </PanelSection>

        {/* Haber pipeline */}
        <PanelSection title="Haber Pipeline">
          {news ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Newspaper size={15} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />
                <StatusDot tone={news.status === "green" ? "ok" : news.status === "yellow" ? "warn" : news.status ? "error" : "muted"} />
                <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 500 }}>
                  {news.status === "green" ? "Sağlıklı" : news.status === "yellow" ? "Uyarı" : news.status === "red" ? "Sorunlu" : "Bilinmiyor"}
                </span>
              </div>
              <div className="tnum" style={{ display: "flex", gap: "var(--space-5)", fontSize: "var(--text-xs)", color: "var(--text-muted)", flexWrap: "wrap" }}>
                <span>ham birikim: {news.rawBacklog ?? "—"}</span>
                <span>hatalı: {news.failedBacklog ?? "—"}</span>
                <span>çeviri 24s: {news.translatedLast24h ?? "—"}</span>
                <span>analiz 24s: {news.analyzedLast24h ?? "—"}</span>
              </div>
              {news.message && (
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55 }}>{news.message}</div>
              )}
            </div>
          ) : (
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Pipeline verisi alınamadı.</span>
          )}
        </PanelSection>

        {/* Maliyet dökümü — tabular */}
        <PanelSection title="Preset Bazlı Harcama (bu ay)">
          {byPreset.length === 0 ? (
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              Bu ay preset etiketli harcama yok. Detay: Maliyetler sekmesi.
            </span>
          ) : (
            <div>
              {byPreset.map((p, i) => (
                <div
                  key={p.preset}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto minmax(72px, auto)",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    padding: "6px 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--border-faint)",
                  }}
                >
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.preset}
                  </span>
                  <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textAlign: "right" }}>
                    {p.calls} çağrı
                  </span>
                  <span className="tnum" style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", textAlign: "right" }}>
                    ${p.costUsd.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </PanelSection>
      </Card>
    </div>
  );
}
