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
  MetricCard,
  MetricGrid,
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
  lastCronRun?: { job?: string; ok?: boolean; startedAt?: string; error?: string | null } | null;
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
  month?: { totalUsd?: number; byPreset?: Array<{ preset: string; costUsd: number; calls: number }> };
  byPreset?: Array<{ preset: string; costUsd: number; calls: number }>;
};

type KpisResponse = {
  success?: boolean;
  data?: {
    acceptanceRate: number | null;
    decidedCount: number;
    medianEditDistance: number | null;
    editSampleCount: number;
    goldenPassPct: number | null;
    goldenScored: number;
  };
};

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; health: HealthResponse | null; costs: CostsResponse | null; kpis: KpisResponse["data"] | null };

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

export default function SystemTab() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      // Her uç best-effort: biri düşse pane ölmez, ilgili blok "veri yok" der.
      const [health, costs, kpis] = await Promise.all([
        fetchJson<HealthResponse>("/api/health?deep=true").catch(() => null),
        fetchJson<CostsResponse>("/api/costs").catch(() => null),
        fetchJson<KpisResponse>("/api/eval/kpis").catch(() => null),
      ]);
      if (!health && !costs && !kpis) {
        setState({ phase: "error", message: "Sistem uçlarına ulaşılamadı. Sunucu çalışıyor mu?" });
        return;
      }
      setState({ phase: "ready", health, costs, kpis: kpis?.data ?? null });
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : "Sistem durumu alınamadı" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const header = (
    <PageHeader
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} variant="default" padded>
              <Skeleton lines={2} height={14} />
            </Card>
          ))}
        </div>
        <Card variant="feature" padded>
          <Skeleton lines={5} height={16} />
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
  const byPreset = (costs?.month?.byPreset ?? costs?.byPreset ?? []).slice(0, 6);

  return (
    <div style={{ width: "100%" }}>
      {header}

      {/* Özet metrikler */}
      <div style={{ marginBottom: "var(--space-5)" }}>
        <MetricGrid
          items={[
            {
              label: "Bugün maliyet",
              value: fmtUsd(costs?.today?.totalUsd),
              icon: <CircleDollarSign size={16} strokeWidth={1.8} />,
              accent: true,
            },
            {
              label: "Arka plan işçisi",
              value: workerInfo.label,
              icon: <Activity size={16} strokeWidth={1.8} />,
            },
            {
              label: "Golden pass",
              value: kpis?.goldenPassPct != null ? `%${kpis.goldenPassPct}` : "—",
              icon: <Target size={16} strokeWidth={1.8} />,
            },
            {
              label: "Kabul oranı (30g)",
              value: kpis?.acceptanceRate != null ? `%${Math.round(kpis.acceptanceRate * 100)}` : "—",
              icon: <HeartPulse size={16} strokeWidth={1.8} />,
            },
          ]}
        />
      </div>

      {/* Worker & Cron */}
      <SectionHeader title="Worker & Cron" />
      <Card variant="default" padded style={{ marginBottom: "var(--space-5)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <StatusDot tone={workerInfo.tone} />
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 500 }}>
              {worker?.mode === "cron" ? "Vercel cron modu" : worker?.mode === "worker" ? "Lokal worker modu" : "Mod bilinmiyor"}
            </span>
            <Badge variant={workerInfo.tone === "ok" ? "accent" : "muted"} size="xs">
              {workerInfo.label}
            </Badge>
            {worker?.lastCronRun?.startedAt && (
              <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                son: {worker.lastCronRun.job ?? "cron"} · {new Date(worker.lastCronRun.startedAt).toLocaleString("tr-TR")}
                {worker.lastCronRun.ok === false ? " · HATA" : ""}
              </span>
            )}
          </div>
          {worker?.recommendation && (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
              {worker.recommendation}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
      </Card>

      {/* Haber pipeline */}
      <SectionHeader title="Haber Pipeline" />
      <Card variant="default" padded style={{ marginBottom: "var(--space-5)" }}>
        {news ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Newspaper size={15} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />
              <StatusDot tone={news.status === "ok" ? "ok" : news.status === "warning" ? "warn" : news.status ? "error" : "muted"} />
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 500 }}>
                {news.status === "ok" ? "Sağlıklı" : news.status ?? "Bilinmiyor"}
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
      </Card>

      {/* Maliyet dökümü */}
      <SectionHeader title="Preset Bazlı Harcama (bu ay)" />
      <Card variant="default" padded>
        {byPreset.length === 0 ? (
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            Bu ay preset etiketli harcama yok. Detay: Maliyetler sekmesi.
          </span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {byPreset.map((p) => (
              <div key={p.preset} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <span style={{ flex: 1, fontSize: "var(--text-sm)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  {p.preset}
                </span>
                <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  {p.calls} çağrı
                </span>
                <span className="tnum" style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", minWidth: 64, textAlign: "right" }}>
                  ${p.costUsd.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
