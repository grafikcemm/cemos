"use client";

import { useMemo, useState } from "react";
import { Sparkles, Newspaper, TrendingUp, Users, Search, ArrowUpRight } from "lucide-react";
import { EntityCard, EmptyState, ErrorState, Badge, Button, Skeleton, BlockedExternalState } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useXAgentStore } from "@/store/xagent";
import { OPPORTUNITY_SEGMENTS, type Opportunity, type OpportunitySourceKind } from "@/lib/services/opportunityCuration";
import { useOpportunities } from "./useOpportunities";

/**
 * Plan / Fırsatlar (05 §C2) — ham motor sonuçlarını birkaç editoryal fırsata
 * indirger; her fırsat "neden şimdi" + platform önerisi + ileri eylem taşır.
 * Bare host: başlık + SubNav shell'de. Gövde-only.
 *
 * Eylem köprüleri (1D): İçerik üret → Bugün · Plana ekle → Takvim · Seriye ekle →
 * Seriler · Ham araştır → ilgili advanced ekran. Hedef yüzeye YÖNLENDİRİR + toast
 * (görünür, gerçek etki; sessiz no-op değil). Otomatik ön-doldurma Faz 2.
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
  const [segment, setSegment] = useState("all");

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

  const bridge = (dest: string, label: string, o: Opportunity) => {
    setActiveTab(dest);
    toast.info(`${label} açıldı — fırsat: "${o.title.slice(0, 36)}".`);
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
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>buzz × uyum × tazelik sıralı</span>
      </div>

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
              <Badge variant={o.badgeTone ?? "muted"} size="sm">
                {o.badge}
              </Badge>
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
                <Button size="sm" variant="primary" onClick={() => bridge("morning", "Bugün", o)} data-testid={`opp-generate-${o.id}`}>
                  İçerik üret
                </Button>
                {o.source === "radar" ? (
                  <Button size="sm" variant="secondary" onClick={() => bridge("plan-seriler", "Seriler", o)}>
                    Seriye ekle
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => bridge("plan-takvim", "Takvim", o)}>
                    Plana ekle
                  </Button>
                )}
                {o.rawTab && (
                  <Button size="sm" variant="ghost" onClick={() => goRaw(o)} iconRight={<ArrowUpRight size={13} strokeWidth={2} />}>
                    Ham araştır
                  </Button>
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
    </div>
  );
}
