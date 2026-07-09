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
  Database,
  TrendingDown,
  CornerDownRight,
} from "lucide-react";
import { PageHeader, Card, MetricCard, SectionHeader, EmptyState, Skeleton, Badge } from "@/components/ui";

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

export default function CostsTab() {
  const [costs, setCosts] = useState<CostStats | null>(null);
  const [kpis, setKpis] = useState<QualityKpis | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCosts = async () => {
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
    } catch (err) {
      console.error("Maliyetler yüklenirken hata:", err);
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
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
            gap: "var(--space-3)",
            marginBottom: "var(--space-6)",
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
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

  const today = costs?.today ?? { totalUsd: 0, socialDataTweets: 0, socialDataUsd: 0, openRouterUsd: 0 };
  const month = costs?.month ?? { totalUsd: 0, budgetUsd: 10, socialDataUsd: 0, openRouterUsd: 0 };
  const dailySeries = costs?.dailySeries ?? [];
  const limits = costs?.limits;
  const lineItems = costs?.lineItems;

  const dailyTweetBudget = limits?.dailyTweetBudget ?? 150;

  const budgetPct = month.budgetUsd > 0
    ? Math.min(100, Math.round((month.totalUsd / month.budgetUsd) * 100))
    : 0;

  // Semantik bütçe tonu: <60 marka, <80 amber, >=80 risk.
  const budgetTone = budgetPct >= 80 ? "var(--danger)" : budgetPct >= 60 ? "var(--accent-2-text)" : "var(--accent)";
  const budgetTextTone = budgetPct >= 80 ? "var(--danger)" : budgetPct >= 60 ? "var(--accent-2-text)" : "var(--text-primary)";

  return (
    <div style={{ width: "100%", paddingBottom: "var(--space-12)" }}>
      <PageHeader
        eyebrow="MALİYET"
        title="Maliyet Takibi"
        subtitle="Sağlayıcı kalemleri, aylık bütçe ve günlük harcama trendi — tek panel."
        actions={
          <button
            onClick={() => {
              setLoading(true);
              fetchCosts();
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 14px",
              fontSize: "var(--text-xs)",
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
              transition: "color var(--ease-out) 0.15s, border-color var(--ease-out) 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--accent-text)";
              e.currentTarget.style.borderColor = "var(--accent-border)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-secondary)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            <RefreshCw size={15} strokeWidth={2} /> Yenile
          </button>
        }
      />

      {/* Editöryal stat şeridi — bütçe baskın (accent + ring) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
          gap: "var(--space-3)",
          marginBottom: "var(--space-3)",
        }}
      >
        <MetricCard
          label="Bütçe kullanımı"
          value={`%${budgetPct}`}
          size="lg"
          accent
          progress={budgetPct}
          ringTone={budgetPct >= 60 ? "accent-2" : "accent"}
        />
        <MetricCard
          label="Bugün toplam"
          value={fmt(today.totalUsd)}
          icon={<Wallet size={16} strokeWidth={1.8} />}
          size="lg"
        />
        <MetricCard
          label="Aylık toplam"
          value={`${fmt(month.totalUsd)} / $${month.budgetUsd}`}
          icon={<CalendarDays size={16} strokeWidth={1.8} />}
          size="lg"
        />
      </div>

      {/* İkincil stat şeridi — sağlayıcı kırılımı + limit */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
          gap: "var(--space-3)",
          marginBottom: "var(--space-6)",
        }}
      >
        <MetricCard
          label="SocialData bugün"
          value={
            <span>
              <span className="tnum">{today.socialDataTweets}</span>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", fontWeight: 500 }}> tweet · </span>
              <span className="tnum" style={{ color: "var(--blue)" }}>{fmt(today.socialDataUsd)}</span>
            </span>
          }
          icon={<BarChart3 size={16} strokeWidth={1.8} />}
        />
        <MetricCard
          label="OpenRouter bugün"
          value={<span className="tnum" style={{ color: "var(--accent-2-text)" }}>{fmt(today.openRouterUsd)}</span>}
          icon={<Zap size={16} strokeWidth={1.8} />}
        />
        <MetricCard
          label="Günlük limit"
          value={
            <span className="tnum">
              {today.socialDataTweets}
              <span style={{ color: "var(--text-muted)" }}> / {dailyTweetBudget}</span>
            </span>
          }
          delta="tweet"
          icon={<Target size={16} strokeWidth={1.8} />}
        />
      </div>

      {/* Kalite KPI şeridi (Sprint 8 — EVALUATION-SPEC §7; veri yoksa 'veri yok') */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
          gap: "var(--space-3)",
          marginBottom: "var(--space-6)",
        }}
      >
        <MetricCard
          label="Kabul oranı (30g)"
          value={
            kpis?.acceptanceRate !== null && kpis !== null
              ? `%${Math.round(kpis.acceptanceRate * 100)}`
              : "veri yok"
          }
          delta={kpis ? `${kpis.decidedCount} karar` : undefined}
        />
        <MetricCard
          label="Medyan edit-distance (kuzey yıldızı)"
          value={
            kpis?.medianEditDistance !== null && kpis !== null
              ? kpis.medianEditDistance.toFixed(2)
              : "veri yok"
          }
          delta={kpis ? `${kpis.editSampleCount} edit` : undefined}
        />
        <MetricCard
          label="Golden set geçiş"
          value={kpis?.goldenPassPct !== null && kpis !== null ? `%${kpis.goldenPassPct}` : "veri yok"}
          delta={kpis ? `${kpis.goldenScored} vaka` : undefined}
        />
      </div>

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
        <div style={{ minWidth: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 360, borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
          <thead>
            <tr>
              <Th>Sağlayıcı / Kalem</Th>
              <Th style={{ textAlign: "right" }}>Detay</Th>
              <Th style={{ textAlign: "right", width: 120 }}>Maliyet</Th>
            </tr>
          </thead>
          <tbody>
            {/* SocialData row */}
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <Td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 500, color: "var(--text-primary)" }}>
                  <BarChart3 size={15} strokeWidth={2} style={{ color: "var(--blue)" }} /> SocialData
                </span>
              </Td>
              <Td style={{ textAlign: "right", color: "var(--text-muted)" }}>
                <span className="tnum">{(lineItems?.socialData.tweets ?? 0).toLocaleString()}</span> tweet × ${lineItems?.socialData.unitPriceUsd ?? 0.0002}
              </Td>
              <Td style={{ textAlign: "right" }}>
                <span className="tnum" style={{ fontWeight: 500, color: "var(--text-primary)" }}>{fmt(lineItems?.socialData.costUsd ?? month.socialDataUsd)}</span>
              </Td>
            </tr>

            {/* OpenRouter header row */}
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <Td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 500, color: "var(--text-primary)" }}>
                  <Zap size={15} strokeWidth={2} style={{ color: "var(--accent-2-text)" }} /> OpenRouter
                </span>
              </Td>
              <Td style={{ textAlign: "right", color: "var(--text-muted)" }}>amaç / model kırılımı</Td>
              <Td style={{ textAlign: "right" }}>
                <span className="tnum" style={{ fontWeight: 500, color: "var(--accent-2-text)" }}>{fmt(lineItems?.openRouter.costUsd ?? month.openRouterUsd)}</span>
              </Td>
            </tr>

            {/* OpenRouter by purpose */}
            {(lineItems?.openRouter.byPurpose ?? []).map((p) => (
              <tr key={`purpose-${p.purpose}`} style={{ borderBottom: "1px solid var(--border)" }}>
                <Td style={{ paddingLeft: "var(--space-8)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--text-secondary)" }}>
                    <CornerDownRight size={13} strokeWidth={1.8} style={{ color: "var(--text-muted)" }} /> {p.purpose}
                  </span>
                </Td>
                <Td style={{ textAlign: "right", color: "var(--text-muted)" }}><span className="tnum">{p.calls}</span> çağrı</Td>
                <Td style={{ textAlign: "right" }}><span className="tnum" style={{ color: "var(--text-secondary)" }}>{fmt(p.costUsd)}</span></Td>
              </tr>
            ))}

            {/* OpenRouter by preset (Sprint 2: preset katmanı harcama dökümü) */}
            {(lineItems?.openRouter.byPreset ?? []).map((p) => (
              <tr key={`preset-${p.preset}`} style={{ borderBottom: "1px solid var(--border)" }}>
                <Td style={{ paddingLeft: "var(--space-8)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <Badge variant="accent" size="xs">preset</Badge>
                    <span style={{ color: "var(--text-secondary)" }}>{p.preset}</span>
                  </span>
                </Td>
                <Td style={{ textAlign: "right", color: "var(--text-muted)" }}><span className="tnum">{p.calls}</span> çağrı</Td>
                <Td style={{ textAlign: "right" }}><span className="tnum" style={{ color: "var(--text-secondary)" }}>{fmt(p.costUsd)}</span></Td>
              </tr>
            ))}

            {/* OpenRouter by model */}
            {(lineItems?.openRouter.byModel ?? []).map((m) => (
              <tr key={`model-${m.model}`} style={{ borderBottom: "1px solid var(--border)" }}>
                <Td style={{ paddingLeft: "var(--space-8)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <Badge variant="muted" size="xs">model</Badge>
                    <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>{m.model}</span>
                  </span>
                </Td>
                <Td style={{ textAlign: "right", color: "var(--text-muted)" }}><span className="tnum">{m.calls}</span> çağrı</Td>
                <Td style={{ textAlign: "right", color: "var(--text-muted)" }}><span className="tnum">{fmt(m.costUsd)}</span></Td>
              </tr>
            ))}

            {!lineItems && (
              <tr>
                <td colSpan={3} style={{ padding: 0 }}>
                  <EmptyState
                    icon={<Database size={22} strokeWidth={1.8} />}
                    title="Henüz kalem verisi yok"
                    description="Sağlayıcı çağrıları başladığında maliyet kırılımı burada listelenir."
                    compact
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
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
          <EmptyState
            icon={<BarChart3 size={22} strokeWidth={1.8} />}
            title="Henüz maliyet verisi yok"
            description="Otomasyon başladığında günlük harcama trendi burada görünür."
            compact
          />
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

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      className="eyebrow"
      style={{
        padding: "11px 14px",
        textAlign: "left",
        fontSize: "var(--text-2xs)",
        color: "var(--text-muted)",
        borderBottom: "1px solid var(--border-strong)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "11px 14px", verticalAlign: "middle", color: "var(--text-primary)", ...style }}>{children}</td>;
}
