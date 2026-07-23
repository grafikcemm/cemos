"use client";

import { useState } from "react";
import { ArrowUpRight, Sparkles, Wand2, CalendarPlus, ListPlus } from "lucide-react";
import { Badge, BlockedExternalState, Button, Drawer } from "@/components/ui";
import { safeExternalHref } from "@/lib/utils/url";
import { useToast } from "@/components/ui/Toast";
import { formatIcon, formatLabel } from "@/components/library/ilham/InspirationGrid";
import type { IlhamAnalysis, IlhamItem } from "@/components/library/ilham/useIlhamWorkspace";

/**
 * İlham detayı (Phase 3C §E): gözlenen gerçekler vs yapısal hipotez ayrımı,
 * "neden çalıştı / neden çalışabilir" dürüst dili, metrik provenance, ÜCRETSİZ
 * deterministik analiz ve ondan AYRI ücretli "Fikre dönüştür" AI eylemi.
 * AI kapısı kapalıyken yalnız ENV ADLARI gösterilir; ağ çağrısı yapılmaz
 * (sunucu da fail-closed). Instagram fikri X/Bugün'e AKMAZ — Seriler/Takvim
 * handoff'una gider.
 */

type Props = {
  item: IlhamItem | null;
  accountId: string;
  gate: { allowed: boolean; missing: string[] };
  onClose: () => void;
  onChanged: () => void;
};

export default function InspirationDetailDrawer({ item, accountId, gate, onClose, onChanged }: Props) {
  const toast = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [ideaId, setIdeaId] = useState<string | null>(null);
  const [handoffBusy, setHandoffBusy] = useState<"series" | "plan" | null>(null);

  if (!item) return null;

  const meta = item.meta;
  const analysis = meta?.analysis ?? null;
  const fmt = meta?.format ?? item.content?.format ?? "unknown";
  const handle = meta?.creatorHandle || item.content?.author || "";
  const sourceUrl = item.url || item.content?.canonicalUrl || "";
  const isInstagram = (item.content?.platform ?? "instagram") === "instagram";

  const runAnalysis = async () => {
    if (!accountId) return; // fail-closed: hesap çözülmeden ücretli analiz POST'u yok
    setAnalyzing(true);
    try {
      const res = await fetch("/api/inspiration/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, boardItemId: item.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "Analiz başarısız.");
        return;
      }
      toast.success("Deterministik yapısal analiz üretildi (ücretsiz).");
      onChanged();
    } catch {
      toast.error("Analiz başarısız (ağ hatası).");
    } finally {
      setAnalyzing(false);
    }
  };

  const convertToIdea = async () => {
    if (!accountId) return; // fail-closed (kardeş bileşenlerle tutarlı guard)
    if (!item.contentItemId) return;
    setConverting(true);
    try {
      const res = await fetch(`/api/content/${item.contentItemId}/reverse-engineer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, platform: item.content?.platform ?? "instagram" }),
      });
      const json = await res.json();
      if (res.status === 503 && json.code === "generation_blocked") {
        toast.error("AI uyarlaması kapalı (üretim kapısı) — eksik env'ler aşağıda listelendi.");
        return;
      }
      if (res.status === 402) {
        toast.error("AI bütçesi dolu (OpenRouter).");
        return;
      }
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "Fikre dönüştürülemedi.");
        return;
      }
      setIdeaId(json.idea?.id ?? null);
      toast.success(json.reused ? "Mevcut fikir yeniden kullanıldı (yeni maliyet yok)." : "Fikir üretildi.");
    } catch {
      toast.error("Fikre dönüştürülemedi (ağ hatası).");
    } finally {
      setConverting(false);
    }
  };

  const sendHandoff = async (action: "series" | "plan") => {
    if (!accountId) return; // fail-closed (kardeş bileşenlerle tutarlı guard)
    if (!item.contentItemId) return;
    setHandoffBusy(action);
    try {
      const res = await fetch("/api/opportunities/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          action,
          sourceKind: "radar",
          sourceId: item.contentItemId,
          sourcePlatform: "instagram",
          title: (item.title || (handle ? `@${handle} ilhamı` : "Instagram ilhamı")).slice(0, 500),
          topicSeed: (analysis?.transferablePrinciples.join(" · ") || item.note || "").slice(0, 2000),
          whyNow: "Kütüphane→İlham yapısal analizi",
          rawTab: "lib-ilham",
          suggestedPlatform: fmt === "ig_reel" ? "Reels" : "Instagram",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "Aktarım oluşturulamadı.");
        return;
      }
      toast.success(
        action === "series"
          ? "Seriler'e aktarım oluşturuldu — Plan→Seriler'de bekliyor."
          : "Takvim'e aktarım oluşturuldu — Plan→Takvim'de bekliyor.",
      );
    } catch {
      toast.error("Aktarım oluşturulamadı (ağ hatası).");
    } finally {
      setHandoffBusy(null);
    }
  };

  return (
    <Drawer open onClose={onClose} title={item.title || (handle ? `@${handle}` : "İçerik")} width={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="ilham-detail">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Badge variant="muted" size="sm">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              {formatIcon(fmt)} {formatLabel(fmt)}
            </span>
          </Badge>
          {handle && <Badge variant="muted" size="sm">@{handle}</Badge>}
          <Badge variant="muted" size="sm">
            {item.content?.sourceType === "external" ? "provider verisi" : "manuel kayıt"}
          </Badge>
        </div>

        {item.note && <TextBlock label="Notun">{item.note}</TextBlock>}
        {meta?.caption && <TextBlock label="Caption (operatör girdisi)">{meta.caption}</TextBlock>}
        {!meta?.caption && item.content?.body && <TextBlock label="Metin">{item.content.body}</TextBlock>}

        {/* Metrik provenance — manuel ve provider AYRI, karışmaz */}
        {meta?.manualMetrics && (
          <div>
            <SectionLabel>Manuel metrik (operatör gözlemi — Meta verisi değil)</SectionLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {meta.manualMetrics.likes !== undefined && <Badge variant="muted" size="xs">{meta.manualMetrics.likes} beğeni</Badge>}
              {meta.manualMetrics.comments !== undefined && <Badge variant="muted" size="xs">{meta.manualMetrics.comments} yorum</Badge>}
              {meta.manualMetrics.views !== undefined && <Badge variant="muted" size="xs">{meta.manualMetrics.views} izlenme</Badge>}
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-faint)" }}>
                gözlem: {new Date(meta.manualMetrics.observedAt).toLocaleDateString("tr-TR")}
              </span>
            </div>
          </div>
        )}
        {item.outlier && (
          <div>
            <SectionLabel>Provider outlier (Meta business_discovery)</SectionLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
              {item.outlier.insufficient || item.outlier.multiplier === null ? (
                <Badge variant="yellow" size="xs">çarpan güvenilir değil — örneklem {item.outlier.sampleSize}</Badge>
              ) : (
                <Badge variant="accent" size="xs">{item.outlier.multiplier.toFixed(1)}× (örneklem {item.outlier.sampleSize})</Badge>
              )}
              {item.outlier.computedAt && (
                <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-faint)" }}>
                  hesap: {new Date(item.outlier.computedAt).toLocaleDateString("tr-TR")}
                </span>
              )}
            </div>
          </div>
        )}

        {sourceUrl && (
          <a href={safeExternalHref(sourceUrl)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", alignSelf: "flex-start" }}>
            <Button size="sm" variant="ghost" iconRight={<ArrowUpRight size={13} strokeWidth={2} />}>Kaynağı aç</Button>
          </a>
        )}

        <div style={{ height: 1, background: "var(--border-faint)" }} />

        {/* ÜCRETSİZ deterministik analiz */}
        {!item.contentItemId ? (
          <BlockedExternalState
            compact
            title="Analiz için içerik bağlantısı gerekli"
            description="Bu kayıt bir nottur. Yapısal analiz için içeriği Instagram URL'siyle kaydet."
          />
        ) : analysis ? (
          <AnalysisView analysis={analysis} onRerun={runAnalysis} rerunning={analyzing} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              Bu içerik henüz analiz edilmedi. Deterministik yapısal analiz ÜCRETSİZDİR (LLM yok) — caption/transcript'ten
              hook, akış, CTA ve aktarılabilir ilkeleri çıkarır; rakip metnini kopyalamaz.
            </p>
            <div>
              <Button size="sm" variant="secondary" onClick={runAnalysis} loading={analyzing} iconLeft={<Sparkles size={14} strokeWidth={2} />} data-testid="ilham-analyze">
                Yapısal analiz (ücretsiz)
              </Button>
            </div>
          </div>
        )}

        <div style={{ height: 1, background: "var(--border-faint)" }} />

        {/* ÜCRETLİ AI eylemi — deterministik analizden AYRI, açık insan tıklaması */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SectionLabel>AI ile fikre dönüştür (ücretli — ayrı eylem)</SectionLabel>
          {!gate.allowed && isInstagram ? (
            <div data-testid="ilham-ai-blocked">
              <BlockedExternalState
                compact
                title="AI uyarlaması kapalı (üretim kapısı)"
                description="Instagram AI uyarlaması için üretim kapısı env'leri eksik. Deterministik analiz ücretsiz çalışmaya devam eder."
                detail={`Eksik env adları: ${gate.missing.join(", ")}`}
              />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                size="sm"
                variant="secondary"
                onClick={convertToIdea}
                loading={converting}
                disabled={!item.contentItemId}
                iconLeft={<Wand2 size={14} strokeWidth={2} />}
                data-testid="ilham-convert-idea"
              >
                Fikre dönüştür (AI)
              </Button>
            </div>
          )}
          {ideaId && isInstagram && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button size="sm" variant="primary" onClick={() => sendHandoff("series")} loading={handoffBusy === "series"} iconLeft={<ListPlus size={14} strokeWidth={2} />}>
                Seriler&apos;e aktar
              </Button>
              <Button size="sm" variant="primary" onClick={() => sendHandoff("plan")} loading={handoffBusy === "plan"} iconLeft={<CalendarPlus size={14} strokeWidth={2} />}>
                Takvim&apos;e aktar
              </Button>
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-faint)", alignSelf: "center" }}>
                Instagram fikri X/Bugün akışına gitmez — üretim Phase 3B kapılarından geçer.
              </span>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function AnalysisView({ analysis, onRerun, rerunning }: { analysis: IlhamAnalysis; onRerun: () => void; rerunning: boolean }) {
  const perf = analysis.performanceAssessment;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="ilham-analysis">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div className="eyebrow" style={{ color: "var(--accent-text)" }}>Deterministik yapısal analiz</div>
        <Badge variant="muted" size="xs">{analysis.analysisVersion}</Badge>
        <Badge variant="muted" size="xs">güven {(analysis.confidence * 100).toFixed(0)}%</Badge>
      </div>

      {/* "Neden çalıştı" vs "neden çalışabilir" — dürüst ayrım */}
      <div
        style={{
          padding: "10px 12px",
          borderRadius: "var(--radius-md)",
          border: `1px solid ${perf.workedClaimAllowed ? "var(--accent-border)" : "var(--border)"}`,
          background: "var(--bg-sunken)",
        }}
      >
        <SectionLabel>{perf.workedClaimAllowed ? "Neden çalıştı (performans kanıtlı)" : "Neden çalışabilir (yapısal hipotez)"}</SectionLabel>
        <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: 1.6 }}>{perf.statement}</p>
      </div>

      {analysis.observedFacts.length > 0 && <ListBlock label="Gözlenen gerçekler" items={analysis.observedFacts} />}
      {analysis.structuralHypotheses.length > 0 && <ListBlock label="Yapısal hipotezler" items={analysis.structuralHypotheses} />}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Badge variant="muted" size="xs">hook: {analysis.hookType}</Badge>
        <Badge variant="muted" size="xs">CTA: {analysis.ctaType}</Badge>
        <Badge variant="muted" size="xs">hashtag: {analysis.hashtagStructure.count} ({analysis.hashtagStructure.placement})</Badge>
        <Badge variant={analysis.copyingRisk.level === "high" ? "yellow" : "muted"} size="xs">
          kopyalama riski: {analysis.copyingRisk.level}
        </Badge>
      </div>
      {analysis.openingMechanism && <TextBlock label="Açılış mekanizması">{analysis.openingMechanism}</TextBlock>}
      {analysis.captionSequence.length > 0 && (
        <TextBlock label="Caption akışı">{analysis.captionSequence.join(" → ")}</TextBlock>
      )}
      {analysis.contentSequence.length > 0 && (
        <TextBlock label="İçerik akışı (transcript)">{analysis.contentSequence.join(" → ")}</TextBlock>
      )}
      {analysis.valuePromise.present && analysis.valuePromise.evidence && (
        <TextBlock label="Değer vaadi">{analysis.valuePromise.evidence}</TextBlock>
      )}
      {analysis.transferablePrinciples.length > 0 && <ListBlock label="Aktarılabilir ilkeler" items={analysis.transferablePrinciples} />}
      {analysis.nonTransferableElements.length > 0 && <ListBlock label="Kopyalanmaması gerekenler" items={analysis.nonTransferableElements} />}
      <TextBlock label="Kopyalama riski nedeni">{analysis.copyingRisk.reason}</TextBlock>
      {analysis.evidenceBasis.length > 0 && <ListBlock label="Kanıt tabanı" items={analysis.evidenceBasis} />}
      {analysis.limitations.length > 0 && <ListBlock label="Sınırlamalar" items={analysis.limitations} muted />}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Button size="sm" variant="ghost" onClick={onRerun} loading={rerunning}>
          Analizi yenile (ücretsiz)
        </Button>
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-faint)" }}>
          {new Date(analysis.analyzedAt).toLocaleString("tr-TR")}
        </span>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {children}
    </div>
  );
}

function TextBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: 1.6, whiteSpace: "pre-wrap", marginTop: 3 }}>
        {children}
      </div>
    </div>
  );
}

function ListBlock({ label, items, muted }: { label: string; items: string[]; muted?: boolean }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <ul style={{ margin: "4px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
        {items.map((s, i) => (
          <li key={i} style={{ fontSize: "var(--text-sm)", color: muted ? "var(--text-muted)" : "var(--text-secondary)", lineHeight: 1.55 }}>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
