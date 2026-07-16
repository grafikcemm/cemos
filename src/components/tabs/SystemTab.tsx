"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  MetricStrip,
  PageHeader,
  SectionHeader,
  Skeleton,
} from "@/components/ui";
import { fetchJson } from "@/lib/utils/safeFetch";
import { useSystemHealth } from "@/components/shell/SystemHealthProvider";
import { useXAgentStore } from "@/store/xagent";
import type {
  InfraItem,
  PipelineItem,
  SectionStatus,
} from "@/lib/health/healthContracts";

/**
 * Profil / Sistem (Faz 1F, ADR-026) — üç AYRI sözleşme, üç açık bölüm:
 *  1. Altyapı            — DB, worker/cron, cron auth, provider anahtarları
 *  2. Akış güncelliği    — haber/üretim akışlarının tazeliği + backlog
 *  3. Bugünün hazırlığı  — günün akış fazı (tamamlandı ≠ hata)
 * Tek health fetch kaynağı SystemHealthProvider'dır (topbar ile AYNI veri);
 * bölümler bağımsız fail-soft: verisi olmayan bölüm dürüst "alınamadı" der,
 * diğerleri yaşar. deep=true probe YOK. Secret değil yalnız ENV adı görünür.
 */

type KpisResponse = {
  success?: boolean;
  acceptanceRate?: number | null;
  goldenPassPct?: number | null;
};

const STATUS_META: Record<SectionStatus, { label: string; color: string }> = {
  ok: { label: "sağlıklı", color: "var(--status-ok)" },
  warn: { label: "uyarı", color: "var(--status-warn)" },
  error: { label: "sorunlu", color: "var(--status-error)" },
  unknown: { label: "bilinmiyor", color: "var(--text-muted)" },
};

const PIPELINE_STATE_META: Record<PipelineItem["state"], { label: string; color: string }> = {
  fresh: { label: "güncel", color: "var(--status-ok)" },
  delayed: { label: "gecikmiş", color: "var(--status-warn)" },
  failing: { label: "hatalı", color: "var(--status-error)" },
  never_ran: { label: "hiç çalışmadı", color: "var(--status-warn)" },
  unknown: { label: "bilinmiyor", color: "var(--text-muted)" },
};

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "var(--radius-pill)",
        background: color,
        boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 16%, transparent)`,
        flexShrink: 0,
      }}
    />
  );
}

/** Bölüm başlığı + durum rozeti + isteğe bağlı deep-link. */
function Section({
  title,
  status,
  link,
  children,
  first = false,
}: {
  title: string;
  status: SectionStatus;
  link?: { label: string; tab: string };
  children: React.ReactNode;
  first?: boolean;
}) {
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  const meta = STATUS_META[status];
  return (
    <section style={{ padding: "var(--space-4) var(--space-5)", borderTop: first ? "none" : "1px solid var(--border-faint)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <SectionHeader title={title} />
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", color: meta.color, fontWeight: 500 }}>
          <Dot color={meta.color} /> {meta.label}
        </span>
        {link && (
          <button
            type="button"
            onClick={() => setActiveTab(link.tab)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "none",
              border: "none",
              color: "var(--accent-text)",
              fontSize: "var(--text-xs)",
              fontFamily: "inherit",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {link.label} <ArrowUpRight size={12} strokeWidth={2} />
          </button>
        )}
      </div>
      <div style={{ marginTop: "var(--space-3)" }}>{children}</div>
    </section>
  );
}

function InfraRow({ item }: { item: InfraItem }) {
  const meta = STATUS_META[item.status];
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0", borderTop: "1px solid var(--border-faint)" }}>
      <span style={{ paddingTop: 4 }}>
        <Dot color={item.optionalUnconfigured ? "var(--text-muted)" : meta.color} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)" }}>{item.label}</span>
          {item.optionalUnconfigured && (
            <Badge variant="muted" size="xs">opsiyonel</Badge>
          )}
          {item.envNames?.map((n) => (
            <code
              key={n}
              style={{
                fontSize: "var(--text-2xs)",
                fontFamily: "var(--font-mono)",
                color: "var(--text-secondary)",
                background: "var(--bg-sunken)",
                border: "1px solid var(--border-faint)",
                borderRadius: "var(--radius-sm)",
                padding: "1px 6px",
              }}
            >
              {n}
            </code>
          ))}
        </div>
        {(item.detail || item.actionHint) && (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.5 }}>
            {item.detail}
            {item.actionHint ? ` ${item.actionHint}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SystemTab() {
  const { contracts, todayCost, refresh, result } = useSystemHealth();
  const [kpis, setKpis] = useState<KpisResponse | null>(null);

  const loadKpis = useCallback(async () => {
    const res = await fetchJson<KpisResponse>("/api/eval/kpis").catch(() => null);
    setKpis(res?.success ? res : null);
  }, []);

  useEffect(() => {
    loadKpis();
  }, [loadKpis]);

  const header = (
    <PageHeader
      size="compact"
      eyebrow="SİSTEM"
      title="Sistem Sağlığı"
      subtitle="Üç sözleşme: altyapı, akış güncelliği ve bugünün hazırlığı — topbar ile aynı kaynaktan."
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            refresh();
            loadKpis();
          }}
          iconLeft={<RefreshCw size={15} strokeWidth={2} />}
        >
          Yenile
        </Button>
      }
    />
  );

  // Provider henüz yüklüyor (ilk fetch) → dürüst yükleme durumu.
  if (!contracts && result.state === "checking") {
    return (
      <div style={{ width: "100%" }}>
        {header}
        <Card variant="default" padded>
          <Skeleton lines={6} height={14} />
        </Card>
      </div>
    );
  }

  // Bütün gerekli veri düştü → gerçek ErrorState.
  if (!contracts) {
    return (
      <div style={{ width: "100%" }}>
        {header}
        <Card variant="feature" padded>
          <ErrorState
            title="Sistem durumu alınamadı"
            description="Sağlık sözleşmeleri getirilemedi. Sunucu çalışıyor mu?"
            onRetry={refresh}
          />
        </Card>
      </div>
    );
  }

  const { infrastructure, pipelineFreshness, todayReadiness } = contracts;
  const news = pipelineFreshness.news;
  const counts = todayReadiness.counts;

  return (
    <div style={{ width: "100%" }}>
      {header}

      <Card variant="default" padded={false}>
        {/* 1. Altyapı */}
        <Section
          title="Altyapı"
          status={infrastructure.status}
          link={{ label: "Entegrasyonlar", tab: "profile-integrations" }}
          first
        >
          {infrastructure.items.length === 0 ? (
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              Altyapı verisi alınamadı — diğer bölümler etkilenmez.
            </span>
          ) : (
            <div>
              {infrastructure.items.map((item) => (
                <InfraRow key={item.key} item={item} />
              ))}
            </div>
          )}
        </Section>

        {/* 2. Akış güncelliği */}
        <Section
          title="Akış güncelliği"
          status={pipelineFreshness.status}
          link={{ label: "Haber Havuzu", tab: "news-pool" }}
        >
          {pipelineFreshness.items.length === 0 ? (
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              Akış verisi alınamadı — diğer bölümler etkilenmez.
            </span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div>
                {pipelineFreshness.items.map((p) => {
                  const meta = PIPELINE_STATE_META[p.state];
                  return (
                    <div key={p.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0", borderTop: "1px solid var(--border-faint)" }}>
                      <span style={{ paddingTop: 4 }}>
                        <Dot color={meta.color} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)" }}>{p.label}</span>
                          <span style={{ fontSize: "var(--text-xs)", color: meta.color, fontWeight: 500 }}>{meta.label}</span>
                          {p.lastRunAt && (
                            <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                              son: {new Date(p.lastRunAt).toLocaleString("tr-TR")}
                            </span>
                          )}
                        </div>
                        {p.detail && (
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.5 }}>{p.detail}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {news && (
                <MetricStrip
                  items={[
                    { label: "ham haber", value: news.rawBacklog ?? "—", tone: (news.rawBacklog ?? 0) > 30 ? "warn" : "default" },
                    { label: "hatalı", value: news.failedBacklog ?? "—", tone: (news.failedBacklog ?? 0) > 0 ? "warn" : "default" },
                    { label: "analiz 24s", value: news.analyzedLast24h ?? "—" },
                    { label: "bugünün digest'i", value: news.digestToday == null ? "—" : news.digestToday ? "var" : "yok" },
                  ]}
                />
              )}
            </div>
          )}
        </Section>

        {/* 3. Bugünün hazırlığı */}
        <Section title="Bugünün hazırlığı" status={todayReadiness.status}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: 1.55 }}>
              {todayReadiness.message}
            </div>
            {counts && (
              <MetricStrip
                data-testid="today-readiness-metrics"
                items={[
                  { label: "hazır", value: counts.ready, tone: counts.ready > 0 ? "ok" : "default" },
                  { label: "düzenleme ister", value: counts.needsEdit, tone: counts.needsEdit > 0 ? "warn" : "default" },
                  { label: "engelli", value: counts.blocked, tone: counts.blocked > 0 ? "danger" : "default" },
                  { label: "hazırlanmış intent", value: counts.preparedIntents },
                  {
                    label: counts.targetToday != null ? `yayın (hedef ${counts.targetToday})` : "yayın",
                    value: counts.publishedToday,
                    tone: counts.publishedToday > 0 ? "ok" : "default",
                  },
                ]}
              />
            )}
          </div>
        </Section>

        {/* Sessiz maliyet + kalite satırı — hero KPI kartı değil; detay ayrı sekmelerde. */}
        <Section title="Maliyet & kalite" status="ok" link={{ label: "Maliyetler", tab: "costs" }}>
          <MetricStrip
            items={[
              { label: "bugün maliyet", value: todayCost != null ? `$${todayCost.toFixed(2)}` : "—" },
              { label: "golden pass", value: kpis?.goldenPassPct != null ? `%${kpis.goldenPassPct}` : "—" },
              {
                label: "kabul oranı 30g",
                value: kpis?.acceptanceRate != null ? `%${Math.round(kpis.acceptanceRate * 100)}` : "—",
              },
            ]}
          />
        </Section>
      </Card>
    </div>
  );
}
