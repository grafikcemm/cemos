"use client";

import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  RefreshCw,
  Wallet,
  BarChart3,
  Zap,
  CalendarDays,
  Target,
  Gauge,
  TrendingDown,
  CornerDownRight,
} from "lucide-react";
import {
  PageHeader,
  Card,
  MetricCard,
  SectionHeader,
  ErrorState,
  Skeleton,
  Badge,
  Button,
  Table,
} from "@/components/ui";

type CostLimits = {
  dailyTweetBudget: number;
  maxSourcesPerAccount: number;
  maxTweetsPerSource: number;
  monthlyBudgetUsd: number;
  costPerItem: number;
  costPerGeneration: number;
};

type OpenRouterBreakdown = {
  purpose?: string;
  model?: string;
  preset?: string;
  costUsd: number;
  calls: number;
};

type LineItems = {
  socialData: { provider: string; tweets: number; unitPriceUsd: number; costUsd: number };
  openRouter: {
    provider: string;
    costUsd: number;
    byPurpose: OpenRouterBreakdown[];
    byModel: OpenRouterBreakdown[];
    byPreset?: OpenRouterBreakdown[];
  };
};

type CostStats = {
  today: { totalUsd: number; socialDataTweets: number; socialDataUsd: number; openRouterUsd: number };
  month: { totalUsd: number; budgetUsd: number; socialDataUsd: number; openRouterUsd: number };
  lineItems?: LineItems;
  // Faz 2E (ADR-034 §I): evaluation bütçesi — production curation'dan AYRI.
  evaluation?: {
    enabled: boolean;
    monthlyBudgetUsd: number;
    monthSpendUsd: number;
    curationMonthSpendUsd: number;
  };
  dailySeries: Array<{ date: string; totalUsd: number; socialDataUsd?: number; openRouterUsd?: number }>;
  limits?: CostLimits;
};

const fmt = (n: number) => `$${(n ?? 0).toFixed(4)}`;

type QualityKpis = {
  acceptanceRate: number | null;
  decidedCount: number;
  medianEditDistance: number | null;
  editSampleCount: number;
  goldenPassPct: number | null;
  goldenScored: number;
};

/** Sağlayıcı kalemleri tablosunun düz satır modeli (Table primitive). */
type LineRow = {
  key: string;
  label: React.ReactNode;
  detail: React.ReactNode;
  cost: React.ReactNode;
};

export default function CostsTab() {
  const [costs, setCosts] = useState<CostStats | null>(null);
  const [kpis, setKpis] = useState<QualityKpis | null>(null);
  const [lastEvalRun, setLastEvalRun] = useState<{ status: string; totalCostUsd: number; kind: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchCosts = async () => {
    setLoadFailed(false);
    try {
      const res = await fetch("/api/costs");
      const data = await res.json();
      setCosts(data);
      // Kalite KPI'ları fail-soft: hata maliyet panelini bozmaz.
      try {
        const kRes = await fetch("/api/eval/kpis");
        if (kRes.ok) {
          const k = await kRes.json();
          if (k.success) setKpis(k as QualityKpis);
        }
      } catch {
        /* fail-soft */
      }
      // Faz 2E: son eval koşu maliyeti (fail-soft; yoksa "veri yok" kalır).
      try {
        const rRes = await fetch("/api/eval/runs?limit=1");
        if (rRes.ok) {
          const r = await rRes.json();
          const run = r?.success && Array.isArray(r.runs) ? r.runs[0] : null;
          setLastEvalRun(run ? { status: run.status, totalCostUsd: run.totalCostUsd, kind: run.kind } : null);
        }
      } catch {
        /* fail-soft */
      }
    } catch (err) {
      console.error("Maliyetler yüklenirken hata:", err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCosts();
  }, []);

  if (loading) {
    return (
      <div style={{ width: "100%" }}>
        <PageHeader
          eyebrow="MALİYET"
          title="Maliyet Takibi"
          subtitle="Sağlayıcı kalemleri, aylık bütçe ve günlük harcama trendi — tek panel."
          size="compact"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))",
            gap: "var(--space-2)",
            marginBottom: "var(--space-4)",
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <Card key={i} variant="quiet" padded>
              <Skeleton lines={2} height={16} />
            </Card>
          ))}
        </div>
        <Card variant="feature" padded>
          <Skeleton lines={5} height={18} />
        </Card>
      </div>
    );
  }

  if (loadFailed && !costs) {
    return (
      <div style={{ width: "100%" }}>
        <PageHeader
          eyebrow="MALİYET"
          title="Maliyet Takibi"
          subtitle="Sağlayıcı kalemleri, aylık bütçe ve günlük harcama trendi — tek panel."
          size="compact"
        />
        <ErrorState
          title="Maliyet verisi yüklenemedi"
          description="Maliyet paneli şu an alınamıyor. Sorun sürerse Ayarlar → Sistem durumu."
          onRetry={() => {
            setLoading(true);
            fetchCosts();
          }}
        />
      </div>
    );
  }

  const today = costs?.today ?? { totalUsd: 0, socialDataTweets: 0, socialDataUsd: 0, openRouterUsd: 0 };
  const month = costs?.month ?? { totalUsd: 0, budgetUsd: 10, socialDataUsd: 0, openRouterUsd: 0 };
  const dailySeries = costs?.dailySeries ?? [];
  const limits = costs?.limits;
  const lineItems = costs?.lineItems;
  const evaluation = costs?.evaluation;

  const dailyTweetBudget = limits?.dailyTweetBudget ?? 150;

  const budgetPct = month.budgetUsd > 0
    ? Math.min(100, Math.round((month.totalUsd / month.budgetUsd) * 100))
    : 0;

  // Semantik bütçe tonu: <60 marka, <80 amber, >=80 risk.
  const budgetTone = budgetPct >= 80 ? "var(--danger)" : budgetPct >= 60 ? "var(--accent-2-text)" : "var(--accent)";
  const budgetTextTone = budgetPct >= 80 ? "var(--danger)" : budgetPct >= 60 ? "var(--accent-2-text)" : "var(--text-primary)";

  // Sağlayıcı kalemleri → Table primitive satırları (davranış aynı, sunum kompakt).
  const lineRows: LineRow[] = lineItems
    ? [
        {
          key: "socialdata",
          label: (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 500, color: "var(--text-primary)" }}>
              <BarChart3 size={14} strokeWidth={2} style={{ color: "var(--blue)" }} /> SocialData
            </span>
          ),
          detail: (
            <span style={{ color: "var(--text-muted)" }}>
              <span className="tnum">{(lineItems.socialData.tweets ?? 0).toLocaleString()}</span> tweet × $
              {lineItems.socialData.unitPriceUsd ?? 0.0002}
            </span>
          ),
          cost: <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{fmt(lineItems.socialData.costUsd ?? month.socialDataUsd)}</span>,
        },
        {
          key: "openrouter",
          label: (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 500, color: "var(--text-primary)" }}>
              <Zap size={14} strokeWidth={2} style={{ color: "var(--accent-2-text)" }} /> OpenRouter
            </span>
          ),
          detail: <span style={{ color: "var(--text-muted)" }}>amaç / model kırılımı</span>,
          cost: <span style={{ fontWeight: 500, color: "var(--accent-2-text)" }}>{fmt(lineItems.openRouter.costUsd ?? month.openRouterUsd)}</span>,
        },
        ...(lineItems.openRouter.byPurpose ?? []).map((p) => ({
          key: `purpose-${p.purpose}`,
          label: (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--text-secondary)", paddingLeft: "var(--space-5)" }}>
              <CornerDownRight size={13} strokeWidth={1.8} style={{ color: "var(--text-muted)" }} /> {p.purpose}
            </span>
          ),
          detail: (
            <span style={{ color: "var(--text-muted)" }}>
              <span className="tnum">{p.calls}</span> çağrı
            </span>
          ),
          cost: <span style={{ color: "var(--text-secondary)" }}>{fmt(p.costUsd)}</span>,
        })),
        // Sprint 2: preset katmanı harcama dökümü.
        ...(lineItems.openRouter.byPreset ?? []).map((p) => ({
          key: `preset-${p.preset}`,
          label: (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, paddingLeft: "var(--space-5)" }}>
              <Badge variant="accent" size="xs">preset</Badge>
              <span style={{ color: "var(--text-secondary)" }}>{p.preset}</span>
            </span>
          ),
          detail: (
            <span style={{ color: "var(--text-muted)" }}>
              <span className="tnum">{p.calls}</span> çağrı
            </span>
          ),
          cost: <span style={{ color: "var(--text-secondary)" }}>{fmt(p.costUsd)}</span>,
        })),
        ...(lineItems.openRouter.byModel ?? []).map((m) => ({
          key: `model-${m.model}`,
          label: (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, paddingLeft: "var(--space-5)" }}>
              <Badge variant="muted" size="xs">model</Badge>
              <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>{m.model}</span>
            </span>
          ),
          detail: (
            <span style={{ color: "var(--text-muted)" }}>
              <span className="tnum">{m.calls}</span> çağrı
            </span>
          ),
          cost: <span style={{ color: "var(--text-muted)" }}>{fmt(m.costUsd)}</span>,
        })),
      ]
    : [];

  return (
    <div style={{ width: "100%", paddingBottom: "var(--space-12)" }}>
      <PageHeader
        eyebrow="MALİYET"
        title="Maliyet Takibi"
        subtitle="Sağlayıcı kalemleri, aylık bütçe ve günlük harcama trendi — tek panel."
        size="compact"
        actions={
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<RefreshCw size={14} strokeWidth={2} />}
            onClick={() => {
              setLoading(true);
              fetchCosts();
            }}
          >
            Yenile
          </Button>
        }
      />

      {/* Tek kompakt stat sırası — en kritik 5 metrik */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))",
          gap: "var(--space-2)",
          marginBottom: "var(--space-2)",
        }}
      >
        <MetricCard
          label="Bütçe kullanımı"
          value={<span style={{ color: budgetTextTone }}>%{budgetPct}</span>}
          icon={<Gauge size={16} strokeWidth={1.8} />}
          accent
        />
        <MetricCard
          label="Bugün toplam"
          value={fmt(today.totalUsd)}
          icon={<Wallet size={16} strokeWidth={1.8} />}
        />
        <MetricCard
          label="Aylık toplam"
          value={
            <span className="tnum">
              {fmt(month.totalUsd)}
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", fontWeight: 500 }}> / ${month.budgetUsd}</span>
            </span>
          }
          icon={<CalendarDays size={16} strokeWidth={1.8} />}
        />
        <MetricCard
          label="OpenRouter bugün"
          value={<span className="tnum" style={{ color: "var(--accent-2-text)" }}>{fmt(today.openRouterUsd)}</span>}
          icon={<Zap size={16} strokeWidth={1.8} />}
          tone="lime"
        />
        <MetricCard
          label="Günlük limit"
          value={
            <span className="tnum">
              {today.socialDataTweets}
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", fontWeight: 500 }}> / {dailyTweetBudget}</span>
            </span>
          }
          delta="tweet"
          icon={<Target size={16} strokeWidth={1.8} />}
        />
      </div>

      {/* İkincil değerler + Kalite KPI'ları — küçük sessiz satır (dev tile yok).
          Sprint 8 — EVALUATION-SPEC §7; veri yoksa 'veri yok'. */}
      <Card variant="quiet" padded={false} style={{ marginBottom: "var(--space-4)" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px 22px",
            padding: "9px 14px",
          }}
        >
          <QuietStat
            label="SocialData bugün"
            value={
              <>
                <span className="tnum">{today.socialDataTweets}</span> tweet ·{" "}
                <span className="tnum" style={{ color: "var(--blue)" }}>{fmt(today.socialDataUsd)}</span>
              </>
            }
          />
          <QuietStat
            label="Kabul oranı (30g)"
            value={
              kpis?.acceptanceRate !== null && kpis !== null
                ? `%${Math.round(kpis.acceptanceRate * 100)}`
                : "veri yok"
            }
            suffix={kpis ? `${kpis.decidedCount} karar` : undefined}
          />
          <QuietStat
            label="Medyan edit-distance (kuzey yıldızı)"
            value={
              kpis?.medianEditDistance !== null && kpis !== null
                ? kpis.medianEditDistance.toFixed(2)
                : "veri yok"
            }
            suffix={kpis ? `${kpis.editSampleCount} edit` : undefined}
          />
          <QuietStat
            label="Golden set geçiş"
            value={kpis?.goldenPassPct !== null && kpis !== null ? `%${kpis.goldenPassPct}` : "veri yok"}
            suffix={kpis ? `${kpis.goldenScored} vaka` : undefined}
          />
          {/* Faz 2E (ADR-034 §I): evaluation bütçesi — production curation'dan AYRI sınıf. */}
          <QuietStat
            label="Eval bütçesi (ay)"
            value={
              evaluation
                ? `${fmt(evaluation.monthSpendUsd)} / $${evaluation.monthlyBudgetUsd.toFixed(2)}`
                : "veri yok"
            }
            suffix={evaluation ? (evaluation.enabled ? "açık" : "kapalı") : undefined}
          />
          <QuietStat
            label="Son eval koşusu"
            value={lastEvalRun ? `${lastEvalRun.status} · ${fmt(lastEvalRun.totalCostUsd)}` : "veri yok"}
            suffix={lastEvalRun?.kind}
          />
          <QuietStat
            label="Kürasyon harcaması (ay)"
            value={evaluation ? fmt(evaluation.curationMonthSpendUsd) : "veri yok"}
          />
        </div>
      </Card>

      {/* Bütçe bandı */}
      <Card variant="feature" padded>
        <SectionHeader
          eyebrow="AYLIK BÜTÇE"
          title="Bütçe kullanımı"
          action={
            <span
              className="tnum"
              style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: budgetTextTone, display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              {budgetPct >= 80 && <Gauge size={15} strokeWidth={2} />}
              {fmt(month.totalUsd)} / ${month.budgetUsd}
            </span>
          }
        />
        <div
          style={{
            background: "var(--bg-base)",
            borderRadius: "var(--radius-sm)",
            height: 8,
            overflow: "hidden",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: "var(--radius-sm)",
              width: `${budgetPct}%`,
              background: budgetTone,
              transition: "width 0.4s var(--ease-out)",
            }}
          />
        </div>
      </Card>

      {/* Provider line items */}
      <Card variant="feature" padded style={{ marginTop: "var(--space-4)" }}>
        <SectionHeader
          eyebrow="BU AY"
          title="Sağlayıcı Kalemleri"
          description="Amaç ve model bazında maliyet kırılımı."
        />
        {lineItems ? (
          <Table<LineRow>
            compact
            columns={[
              { key: "label", header: "Sağlayıcı / Kalem", render: (r) => r.label },
              { key: "detail", header: "Detay", align: "right", render: (r) => r.detail },
              { key: "cost", header: "Maliyet", numeric: true, width: 110, render: (r) => r.cost },
            ]}
            rows={lineRows}
            getRowKey={(r) => r.key}
          />
        ) : (
          <div style={{ padding: "8px 2px", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Henüz kalem verisi yok — sağlayıcı çağrıları başladığında maliyet kırılımı burada listelenir.
          </div>
        )}
      </Card>

      {/* Cost chart */}
      <Card variant="feature" padded style={{ marginTop: "var(--space-4)" }}>
        <SectionHeader
          eyebrow="TREND"
          title="Son 30 Günlük Maliyet"
          action={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              <TrendingDown size={14} strokeWidth={2} style={{ color: "var(--green)" }} /> günlük toplam
            </span>
          }
        />
        {dailySeries.length === 0 ? (
          <div style={{ padding: "8px 2px", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Henüz maliyet verisi yok — otomasyon başladığında günlük harcama trendi burada görünür.
          </div>
        ) : (
          <div style={{ width: "100%", minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={dailySeries} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--chart-axis)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--chart-axis)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", fontSize: 11, boxShadow: "var(--shadow-md)" }}
                labelStyle={{ color: "var(--text-muted)" }}
                itemStyle={{ color: "var(--accent-text)" }}
                formatter={(v) => [`$${Number(v ?? 0).toFixed(4)}`, "Maliyet"]}
              />
              <Area type="monotone" dataKey="totalUsd" stroke="var(--chart-1)" strokeWidth={2} fill="url(#costGradient)" dot={{ fill: "var(--chart-1)", r: 3 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Sessiz satır içi mini istatistik — 'veri yok' değerleri dev tile'a dönüşmez. */
function QuietStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
}) {
  const isEmpty = value === "veri yok";
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 7, whiteSpace: "nowrap" }}>
      <span className="eyebrow" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
        {label}
      </span>
      <span
        className="tnum"
        style={{
          fontSize: "var(--text-xs)",
          fontWeight: 500,
          color: isEmpty ? "var(--text-muted)" : "var(--text-secondary)",
        }}
      >
        {value}
      </span>
      {suffix && (
        <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
          {suffix}
        </span>
      )}
    </span>
  );
}
