"use client";

import { useMemo, useState } from "react";
import { Sparkles, Newspaper, TrendingUp, Users, Search, ArrowUpRight } from "lucide-react";
import DiscoveryEngineTab from "@/components/tabs/DiscoveryEngineTab";
import { SectionHeader } from "@/components/ui";
import { EntityCard, EmptyState, ErrorState, Badge, Button, Skeleton, BlockedExternalState, Select } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useXAgentStore } from "@/store/xagent";
import { OPPORTUNITY_SEGMENTS, type Opportunity, type OpportunitySourceKind } from "@/lib/services/opportunityCuration";
import { createHandoffFromOpportunity, type HandoffDto } from "@/components/handoff/useHandoffs";
import { useOpportunities } from "./useOpportunities";
import { safeExternalHref } from "@/lib/utils/url";
import { useActiveAccount } from "@/lib/accounts/useActiveAccount";
import CompetitorWatchlistCard from "./CompetitorWatchlistCard";

/**
 * Plan / Fırsatlar (05 §C2) — ham motor sonuçlarını birkaç editoryal fırsata
 * indirger; her fırsat "neden şimdi" + platform önerisi + ileri eylem taşır.
 * Bare host: başlık + SubNav shell'de. Gövde-only.
 *
 * Eylem köprüleri (Faz 2A, ADR-028): İçerik üret / Plana ekle / Seriye ekle
 * artık SERVER-persisted typed OpportunityHandoff yaratır (aktif hesap açık
 * bağlanır), SONRA hedef yüzeye gider — hedef yüzey bekleyen aktarımı
 * "Fırsattan geldi" bandında gösterir; reload sonrası kaybolmaz. Kayıt
 * başarısızsa navigasyon YAPILMAZ (sessiz kayıp yok). Ham araştır → advanced.
 */

const ICONS: Record<OpportunitySourceKind, React.ReactNode> = {
  news: <Newspaper size={16} strokeWidth={2} />,
  youtube: <TrendingUp size={16} strokeWidth={2} />,
  radar: <Users size={16} strokeWidth={2} />,
  discovery: <Search size={16} strokeWidth={2} />,
};

const ICON_TONE: Record<OpportunitySourceKind, string> = {
  news: "var(--accent-text)",
  youtube: "var(--status-ok-text)",
  radar: "var(--status-warn-text)",
  discovery: "var(--accent-text)",
};

function IconTile({ source }: { source: OpportunitySourceKind }) {
  const color = ICON_TONE[source];
  return (
    <div
      aria-hidden
      style={{
        display: "grid",
        placeItems: "center",
        width: 38,
        height: 38,
        flexShrink: 0,
        borderRadius: "var(--radius-md)",
        background: `color-mix(in srgb, ${color} 14%, var(--bg-elevated))`,
        border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
        color,
      }}
    >
      {ICONS[source]}
    </div>
  );
}

export default function FirsatlarTab() {
  const toast = useToast();
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  const setRadarView = useXAgentStore((s) => s.setRadarView);
  const { opportunities, notes, loading, allFailed, reload } = useOpportunities();
  // WP-04 / P0 batch A1: yerel accountId seçici SİLİNDİ — TEK otorite global
  // activeChannel (useActiveAccount). Dropdown two-way bind (aşağıda).
  const { accountId, setChannel, accounts } = useActiveAccount();
  const [segment, setSegment] = useState("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const visible = useMemo(() => {
    const all = opportunities ?? [];
    return segment === "all" ? all : all.filter((o) => o.source === segment);
  }, [opportunities, segment]);

  const goRaw = (o: Opportunity) => {
    if (!o.rawTab) return;
    if (o.rawTab === "news-pool") setRadarView("news");
    setActiveTab(o.rawTab);
    toast.info(`Ham araştırma açıldı — "${o.title.slice(0, 40)}".`);
  };

  // Gerçek typed handoff (ADR-028): önce server'a kalıcı kayıt, sonra hedef
  // yüzey. Kayıt düşerse NAVİGE EDİLMEZ — kullanıcı hatayı görür.
  const bridge = async (dest: string, label: string, action: HandoffDto["action"], o: Opportunity) => {
    if (!accountId) {
      toast.error("Aktif hesap yüklenemedi — aktarım kaydedilemez.");
      return;
    }
    setBusyKey(`${action}-${o.id}`);
    try {
      const r = await createHandoffFromOpportunity(o, accountId, action);
      if (!r.ok) {
        toast.error(r.error ?? "Aktarım kaydedilemedi.");
        return;
      }
      setActiveTab(dest);
      toast.success(
        r.reused
          ? `${label} açıldı — bu fırsat zaten aktarımda bekliyor.`
          : `${label} açıldı — fırsat aktarıldı: "${o.title.slice(0, 36)}".`
      );
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{ padding: "var(--card-pad)", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)" }}
          >
            <Skeleton width={220} height={14} style={{ marginBottom: 12 }} />
            <Skeleton lines={2} />
          </div>
        ))}
      </div>
    );
  }

  if (allFailed) {
    return (
      <ErrorState
        title="Fırsat motorları yüklenemedi"
        description="Hiçbir sinyal kaynağına ulaşılamadı. Bağlantını kontrol edip yeniden dene."
        onRetry={reload}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}>
      {/* Segment filtre + kürasyon formülü */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1, minWidth: 0 }}>
          {OPPORTUNITY_SEGMENTS.map((s) => {
            const active = segment === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setSegment(s.value)}
                aria-pressed={active}
                data-testid={`opp-segment-${s.value}`}
                style={{
                  padding: "7px 14px",
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
                {s.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {accounts.length > 0 && (
            <Select
              aria-label="Aktif hesap"
              options={accounts.map((a) => ({ value: a.id, label: `@${a.handle}` }))}
              value={accountId ?? ""}
              onChange={(e) => {
                // Two-way bind: dropdown id → handle → global switcher (setChannel).
                const next = accounts.find((a) => a.id === e.target.value);
                if (next) setChannel(next.handle);
              }}
              data-testid="opp-account-select"
            />
          )}
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>buzz × uyum × tazelik sıralı</span>
        </div>
      </div>

      {/* Rakip segmentinde: izlenen rakip hesap yönetimi (Phase 5A — emekli
          CompetitorRadarSection'ın benzersiz "hesap ekle" eylemi canonical eve taşındı). */}
      {segment === "radar" && <CompetitorWatchlistCard />}

      {/* Kısmi motor hataları/engelleri (bütünü bozmaz) */}
      {notes.map((n) =>
        n.kind === "blocked" ? (
          <BlockedExternalState key={n.source} compact title={`${n.source === "youtube" ? "YouTube" : n.source} sinyalleri sınırlı`} description={n.message} />
        ) : (
          <div
            key={n.source}
            role="note"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              fontSize: "var(--text-xs)",
              color: "var(--status-warn-text)",
              background: "color-mix(in srgb, var(--status-warn) 8%, var(--bg-sunken))",
              border: "1px solid color-mix(in srgb, var(--status-warn) 24%, transparent)",
              borderRadius: "var(--radius-md)",
            }}
          >
            {n.message} Diğer fırsatlar gösterilmeye devam ediyor.
          </div>
        ),
      )}

      {/* Fırsat kartları */}
      {visible.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={22} strokeWidth={1.8} />}
          title="Bugün öne çıkan fırsat yok"
          description="Filtreye uygun sinyal bulunamadı. Ham araştırmayı açıp taze sinyalleri tarayabilirsin."
          action={
            <Button variant="primary" onClick={() => setActiveTab("flow-radar")} iconLeft={<Search size={15} strokeWidth={2} />}>
              Ham araştırmayı aç
            </Button>
          }
        />
      ) : (
        visible.map((o) => (
          <EntityCard
            key={o.id}
            avatar={<IconTile source={o.source} />}
            title={o.title}
            badges={
              <>
                <Badge variant={o.badgeTone ?? "muted"} size="sm">
                  {o.badge}
                </Badge>
                {o.curationMethod === "agent" && (
                  <span data-testid={`opp-agent-${o.id}`} title={o.curationReason ?? undefined}>
                    <Badge variant="accent" size="sm">
                      agent seçimi
                    </Badge>
                  </span>
                )}
              </>
            }
            body={
              <span>
                <span style={{ color: "var(--text-muted)" }}>Neden şimdi? </span>
                <strong style={{ color: "var(--text-primary)" }}>{o.whyNow}</strong>
                {o.whyNowDetail ? <span> — {o.whyNowDetail}</span> : null}
              </span>
            }
            meta={
              <>
                <Badge variant="accent" size="sm">
                  {o.suggestedPlatform} önerilen
                </Badge>
                {o.sourcePlatform && (
                  <Badge variant="muted" size="sm">
                    {o.sourcePlatform}
                  </Badge>
                )}
              </>
            }
            actions={
              <>
                <Button
                  size="sm"
                  variant="primary"
                  loading={busyKey === `generate-${o.id}`}
                  onClick={() => bridge("morning", "Bugün", "generate", o)}
                  data-testid={`opp-generate-${o.id}`}
                >
                  İçerik üret
                </Button>
                {o.source === "radar" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busyKey === `series-${o.id}`}
                    onClick={() => bridge("plan-seriler", "Seriler", "series", o)}
                    data-testid={`opp-series-${o.id}`}
                  >
                    Seriye ekle
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busyKey === `plan-${o.id}`}
                    onClick={() => bridge("plan-takvim", "Takvim", "plan", o)}
                    data-testid={`opp-plan-${o.id}`}
                  >
                    Plana ekle
                  </Button>
                )}
                {o.rawTab && (
                  <Button size="sm" variant="ghost" onClick={() => goRaw(o)} iconRight={<ArrowUpRight size={13} strokeWidth={2} />}>
                    Ham araştır
                  </Button>
                )}
                {o.url && (
                  <a href={safeExternalHref(o.url)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }} data-testid={`opp-open-${o.id}`}>
                    <Button size="sm" variant="ghost" iconRight={<ArrowUpRight size={13} strokeWidth={2} />}>
                      Instagram&apos;da aç
                    </Button>
                  </a>
                )}
              </>
            }
          />
        ))
      )}

      {/* Editoryal seçim notu */}
      {visible.length > 0 && (
        <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.6 }}>
          Bu liste editoryal olarak seçildi.{" "}
          <button
            onClick={() => setActiveTab("flow-radar")}
            style={{ background: "none", border: "none", color: "var(--accent-text)", fontFamily: "inherit", fontSize: "var(--text-xs)", cursor: "pointer", padding: 0 }}
          >
            Tüm ham sinyalleri gör ›
          </button>
        </p>
      )}

      {/* IA 15+3: Keşif Motoru Fırsatlar'a ABSORBED — çok kaynaklı keşif +
          müzakere konseyi bu listenin ham-sinyal üreticisidir. */}
      <div style={{ marginTop: "var(--space-8)" }} data-testid="firsatlar-discovery-section">
        <SectionHeader eyebrow="KEŞİF MOTORU" title="Keşif Motoru" description="Çok kaynaklı keşif → müzakere konseyi → taslak üretimi." />
        <DiscoveryEngineTab embedded />
      </div>
    </div>
  );
}
