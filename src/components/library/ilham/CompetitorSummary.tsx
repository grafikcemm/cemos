"use client";

import { Flame, Radar } from "lucide-react";
import { Badge, BlockedExternalState, Card, EmptyState, SectionHeader, StaleNotice } from "@/components/ui";
import type { IlhamWorkspace } from "@/components/library/ilham/useIlhamWorkspace";
import { safeExternalHref } from "@/lib/utils/url";

/**
 * Rakip watchlist özeti + outlier feed (Phase 3C §C/§E). Watchlist GLOBALDİR —
 * "CemOS ortak rakip listesi" olarak etiketlenir (hesap-scoped algısı yaratılmaz).
 * Meta yapılandırılmamışsa dürüst config-required; hiç sync olmamışsa
 * never-synced; bayatsa stale. Yetersiz örneklem çarpanı sayı gibi GÖSTERİLMEZ.
 */

type Props = {
  watch: IlhamWorkspace["watch"];
  outliers: IlhamWorkspace["outliers"];
};

export default function CompetitorSummary({ watch, outliers }: Props) {
  return (
    <Card variant="feature" padded>
      <SectionHeader
        eyebrow="RAKİP RADARI"
        title="CemOS ortak rakip listesi"
        description="Watchlist hesap-bazlı değil, tüm CemOS için ortaktır. Tek otomatik kaynak: Meta business_discovery (scraping asla)."
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
        <Badge variant="muted" size="xs">{watch.total} hesap</Badge>
        <Badge variant={watch.ok > 0 ? "success" : "muted"} size="xs">{watch.ok} API-bağlı</Badge>
        {watch.unavailable > 0 && <Badge variant="yellow" size="xs">{watch.unavailable} manuel</Badge>}
        {watch.configRequired > 0 && <Badge variant="yellow" size="xs">{watch.configRequired} config bekliyor</Badge>}
      </div>

      {!watch.configured ? (
        <div data-testid="ilham-watch-blocked">
          <BlockedExternalState
            compact
            title="Meta business_discovery yapılandırılmamış"
            description="Otomatik rakip senkronu için Meta erişimi gerekiyor. Manuel ilham kaydı ve deterministik analiz bu olmadan da tam çalışır."
            detail="Gereken env adları: META_IG_USER_ID + Meta erişim token'ı (business_discovery izni). Composio own-account köprüsü rakip verisi İÇİN KULLANILAMAZ (toolkit'te business_discovery yok)."
          />
        </div>
      ) : watch.lastSyncAt === null ? (
        <EmptyState
          icon={<Radar size={22} strokeWidth={1.8} />}
          title="Henüz hiç sync olmadı"
          description="Watchlist hazır — günlük cron ilk taramada outlier feed'i dolduracak."
          compact
        />
      ) : watch.stale ? (
        <StaleNotice message={`Son sync ${new Date(watch.lastSyncAt).toLocaleDateString("tr-TR")} — veriler bayat olabilir (günlük cron bekleniyor).`} />
      ) : null}

      <div style={{ marginTop: "var(--space-4)" }}>
        <SectionHeader
          eyebrow="OUTLIER FEED"
          title="Patlayan İçerikler"
          description="Hesabın KENDİ format-medyanına göre çarpan; güncel baseline ile hesaplanır. Az örneklemde çarpan gösterilmez."
        />
        {outliers.length === 0 ? (
          <EmptyState
            icon={<Flame size={22} strokeWidth={1.8} />}
            title="Henüz outlier yok"
            description={watch.configured ? "Watchlist tarandıkça hesap-medyanını aşan içerikler burada sıralanır." : "Meta yapılandırılınca günlük sync feed'i doldurur."}
            compact
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {outliers.slice(0, 12).map((o, i) => (
              <a
                key={o.contentItemId}
                href={safeExternalHref(o.url)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)",
                  minHeight: 44, padding: "6px var(--space-1)",
                  borderTop: i === 0 ? "none" : "1px solid var(--border-faint)",
                  textDecoration: "none",
                }}
              >
                {o.multiplier === null ? (
                  <Badge variant="yellow" size="xs">az örneklem ({o.sampleSize})</Badge>
                ) : (
                  <Badge variant={o.multiplier >= 2 ? "accent" : "muted"} size="xs">{o.multiplier.toFixed(1)}×</Badge>
                )}
                <Badge variant="muted" size="xs">{o.format.replace("ig_", "")}</Badge>
                <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>@{o.author}</span>
                <span
                  title={o.caption || undefined}
                  style={{
                    flex: "1 1 180px", minWidth: 0, color: "var(--text-primary)",
                    fontSize: "var(--text-sm)", overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {o.caption || "(caption yok)"}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
