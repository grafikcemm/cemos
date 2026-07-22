"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AtSign, CheckCircle2, RefreshCw } from "lucide-react";
import {
  Card,
  EmptyState,
  ErrorState,
  Badge,
  Button,
  Skeleton,
  Drawer,
} from "@/components/ui";
import type {
  InstagramDnaObservation,
} from "@/lib/instagram/dnaObservationService";
import type { CaptionDnaApplyField } from "@/lib/instagram/dnaApplyService";

/**
 * "Instagram'da gözlenen" bölümü (Phase 3A §F — Plan/Seriler içinde, yeni ekran
 * değil). Gözlem ile ONAYLI DNA açıkça ayrılır; "DNA'ya uygula" alan-bazlı
 * seçim + önce/sonra önizleme + AÇIK insan onayıdır. Otomatik apply yok.
 */

type ApprovedCaptionDna = {
  openingHookTypes: string;
  lengthRange: string;
  emojiPolicy: string;
  lineBreakPattern: string;
  ctaStyle: string | null;
  provenance: string;
  version: number;
  evidenceCount: number;
} | null;

type ObservationResponse = {
  success: boolean;
  status: string;
  reason: string;
  account: { id: string; handle: string } | null;
  binding: {
    provider: string;
    externalHandle: string;
    connectionStatus: string;
    lastSuccessfulSyncAt: string | null;
    staleSync: boolean;
  } | null;
  observation: InstagramDnaObservation | null;
  proposedCaptionDnaValues: Partial<Record<CaptionDnaApplyField, string>> | null;
  approved: { captionDna: ApprovedCaptionDna };
};

const FIELD_LABELS: Record<CaptionDnaApplyField, string> = {
  openingHookTypes: "Açılış kancaları",
  lengthRange: "Caption uzunluğu (min/max/medyan)",
  emojiPolicy: "Emoji politikası",
  lineBreakPattern: "Paragraf düzeni",
  ctaStyle: "CTA stili",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("tr-TR");
}

function distLine(dist: Record<string, number> | undefined): string {
  if (!dist) return "—";
  const entries = Object.entries(dist).filter(([, n]) => n > 0);
  if (entries.length === 0) return "—";
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(" · ");
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 6 }}>
        {label}
      </div>
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: 1.55 }}>
        {value}
      </p>
    </div>
  );
}

export default function InstagramDnaSection({
  selectedSeries,
  onApplied,
}: {
  selectedSeries: { id: string; name: string; version: number } | null;
  onApplied?: () => void;
}) {
  const [data, setData] = useState<ObservationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [selection, setSelection] = useState<Set<CaptionDnaApplyField>>(new Set());
  const [applySeriesTags, setApplySeriesTags] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/instagram/dna-observation");
      if (!res.ok) throw new Error("http");
      const json = (await res.json()) as ObservationResponse;
      if (!json.success) throw new Error("payload");
      setData(json);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const observation = data?.observation ?? null;
  const proposed = data?.proposedCaptionDnaValues ?? null;
  const approved = data?.approved.captionDna ?? null;
  const sufficient = observation?.sampleSufficiency === "sufficient";

  const availableFields = useMemo(
    () => (proposed ? (Object.keys(proposed) as CaptionDnaApplyField[]) : []),
    [proposed]
  );

  const toggleField = (f: CaptionDnaApplyField) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  const apply = async () => {
    if (!data?.account || (!selection.size && !applySeriesTags)) return;
    setBusy(true);
    setNote(null);
    try {
      const results: string[] = [];
      if (selection.size > 0) {
        const res = await fetch("/api/instagram/dna-observation/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "caption_dna",
            accountId: data.account.id,
            selectedFields: [...selection],
            expectedVersion: approved?.version ?? null,
          }),
        });
        const json = await res.json();
        if (res.status === 409) {
          setNote("Onaylı DNA bu arada değişti (sürüm çakışması) — gözlem yenilendi, tekrar dene.");
          await load();
          return;
        }
        if (!res.ok || !json.success) {
          setNote(json.error ?? "Uygulanamadı.");
          return;
        }
        results.push(
          json.applied.alreadyApplied
            ? `Hesap DNA'sı zaten günceldi (v${json.applied.version}).`
            : `Hesap DNA'sı onaylandı — v${json.applied.version}.`
        );
      }
      if (applySeriesTags && selectedSeries) {
        const res = await fetch("/api/instagram/dna-observation/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "series_hashtag",
            seriesId: selectedSeries.id,
            expectedVersion: selectedSeries.version,
          }),
        });
        const json = await res.json();
        if (res.status === 409) {
          results.push("Seri sürümü çakıştı — seriyi yenileyip tekrar dene.");
        } else if (!res.ok || !json.success) {
          results.push(json.error ?? "Seri hashtag override'ı uygulanamadı.");
        } else {
          results.push(
            json.applied.alreadyApplied
              ? `Seri hashtag'leri zaten güncel (v${json.applied.version}).`
              : `Seri hashtag override'ı onaylandı — v${json.applied.version}.`
          );
          onApplied?.();
        }
      }
      setNote(results.join(" "));
      setSelection(new Set());
      setApplySeriesTags(false);
      setApplyOpen(false);
      await load();
    } catch {
      setNote("Uygulanamadı (ağ hatası).");
    } finally {
      setBusy(false);
    }
  };

  // ── Durumlar ──
  if (loading) {
    return (
      <Card variant="quiet" padded>
        <div data-testid="ig-dna-loading" aria-busy="true" aria-label="Instagram gözlemi yükleniyor">
          <Skeleton width={220} height={14} style={{ marginBottom: "var(--space-3)" }} />
          <Skeleton lines={3} />
        </div>
      </Card>
    );
  }
  if (failed) {
    return (
      <ErrorState
        title="Instagram gözlemi alınamadı"
        description="Gözlem verisi getirilemedi. Yeniden dene."
        onRetry={load}
      />
    );
  }
  if (!data) return null;

  if (data.status !== "ok") {
    const map: Record<string, { title: string; desc: string }> = {
      config_required: {
        title: "Instagram bağlantısı yok",
        desc: data.reason,
      },
      multi_binding_blocked: {
        title: "Birden fazla hesap bağlı — gözlem güvenli değil",
        desc: data.reason,
      },
      account_unresolved: {
        title: "Bağlı hesap çözülemedi",
        desc: data.reason,
      },
      no_media: {
        title: "Bağlı ama medya yok",
        desc: data.reason,
      },
    };
    const m = map[data.status] ?? { title: "Gözlem hazır değil", desc: data.reason };
    return (
      <Card variant="quiet" padded>
        <div data-testid={`ig-dna-state-${data.status}`}>
          <EmptyState
            icon={<AtSign size={22} strokeWidth={1.8} />}
            title={m.title}
            description={m.desc}
          />
        </div>
      </Card>
    );
  }

  if (!observation) return null;

  const perf =
    observation.performanceEvidence === "insights_available"
      ? "Insight verisi mevcut (reach/save/share)."
      : observation.performanceEvidence === "engagement_partial"
        ? "Yalnız like/yorum var — tek başına virallik kanıtı değil."
        : "Performans verisi MEVCUT DEĞİL (sıfır değil).";

  return (
    <Card variant="feature" padded>
      <div data-testid="ig-dna-section">
      {/* Başlık */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h3
            className="font-display"
            style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
          >
            Instagram&apos;da gözlenen
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            @{data.binding?.externalHandle || data.account?.handle} · kaynak {data.binding?.provider} · son sync{" "}
            {fmtDate(data.binding?.lastSuccessfulSyncAt)}
            {data.binding?.staleSync ? " (bayat)" : ""} · {observation.evidenceCount} içerik ·{" "}
            {fmtDate(observation.dateRange.from)} – {fmtDate(observation.dateRange.to)}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {data.binding?.staleSync && (
            <Badge variant="yellow" size="sm">sync bayat</Badge>
          )}
          <span data-testid="ig-dna-sufficiency">
            <Badge variant={sufficient ? "success" : "yellow"} size="sm">
              {sufficient ? "örneklem yeterli" : "örneklem yetersiz"}
            </Badge>
          </span>
          <Button size="sm" variant="ghost" onClick={load} iconLeft={<RefreshCw size={13} strokeWidth={2} />} aria-label="Gözlemi yenile">
            Yenile
          </Button>
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border-faint)", margin: "16px 0" }} />

      {/* Gözlem istatistikleri */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 18 }}>
        <StatBlock label="Format dağılımı" value={distLine(observation.mediaTypeDistribution)} />
        <StatBlock label="Açılış kancaları" value={distLine(observation.hookDistribution as Record<string, number>)} />
        <StatBlock
          label="Caption uzunluğu"
          value={`${observation.captionLength.min}–${observation.captionLength.max} kr · medyan ${observation.captionLength.median} · ${observation.paragraphPattern}`}
        />
        <StatBlock
          label="Emoji"
          value={`${observation.emoji.policy} (%${Math.round(observation.emoji.ratio * 100)} içerikte)`}
        />
        <StatBlock label="CTA bitişleri" value={distLine(observation.ctaEndingDistribution)} />
        <StatBlock
          label="Hashtag düzeni"
          value={`${observation.hashtag.countRange.min}–${observation.hashtag.countRange.max} adet · ${observation.hashtag.placement} · ${observation.hashtag.casing}${observation.hashtag.coreTags.length ? ` · çekirdek: ${observation.hashtag.coreTags.slice(0, 4).join(" ")}` : ""}`}
        />
      </div>

      {/* Performans + uyarılar */}
      <p style={{ margin: "14px 0 0", fontSize: "var(--text-xs)", color: "var(--text-secondary)" }} data-testid="ig-dna-performance">
        Performans: {perf}
      </p>
      {observation.warnings.length > 0 && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {observation.warnings.map((w, i) => (
            <li key={i} style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.5 }}>
              {w}
            </li>
          ))}
        </ul>
      )}

      <div style={{ height: 1, background: "var(--border-faint)", margin: "16px 0" }} />

      {/* Onaylı DNA vs gözlem farkı */}
      <div>
        <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 8 }}>
          Onaylı DNA ↔ gözlenen fark
        </div>
        {approved ? (
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Onaylı hesap DNA'sı: v{approved.version} · kaynak {approved.provenance} ·{" "}
            {approved.evidenceCount} kanıt. Aşağıdaki uygulama YALNIZ seçtiğin alanları günceller.
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Bu hesap için onaylı CaptionDna henüz yok — uygulama ilk sürümü oluşturur.
          </p>
        )}
      </div>

      {/* Eylem */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 16,
          paddingTop: 14,
          borderTop: "1px solid var(--border-faint)",
        }}
      >
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          Gözlem mekanik yapıdır — onaylanmadan üretim kuralı OLMAZ.
        </span>
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            setSelection(new Set());
            setApplySeriesTags(false);
            setNote(null);
            setApplyOpen(true);
          }}
          disabled={!sufficient}
          data-testid="ig-dna-apply-open"
          iconLeft={<CheckCircle2 size={14} strokeWidth={2} />}
        >
          DNA&apos;ya uygula
        </Button>
      </div>
      {note && (
        <p style={{ margin: "10px 0 0", fontSize: "var(--text-xs)", color: "var(--text-secondary)" }} data-testid="ig-dna-note">
          {note}
        </p>
      )}

      {/* Apply drawer — alan-bazlı seçim + önce/sonra */}
      <Drawer open={applyOpen} onClose={() => setApplyOpen(false)} title="Gözlemi DNA'ya uygula" width={560}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            Kaydetmek <strong>açık insan onayıdır</strong> ve sürüm artırır
            {approved ? ` (v${approved.version} → v${approved.version + 1})` : " (ilk sürüm v1)"}.
            Hiçbir alan otomatik seçili gelmez; yalnız işaretlediklerin yazılır.
          </p>
          {availableFields.map((f) => {
            const current = approved
              ? f === "ctaStyle"
                ? (approved.ctaStyle ?? "—")
                : ((approved[f] as string) || "—")
              : "—";
            const next = proposed?.[f] ?? "—";
            const checked = selection.has(f);
            return (
              <label
                key={f}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  background: "var(--bg-sunken)",
                  border: `1px solid ${checked ? "var(--accent-border)" : "var(--border-faint)"}`,
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleField(f)}
                  data-testid={`ig-dna-field-${f}`}
                  style={{ marginTop: 3 }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)" }}>
                    {FIELD_LABELS[f]}
                  </span>
                  <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 3, wordBreak: "break-word" }}>
                    şu an: {current}
                  </span>
                  <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--accent-text)", marginTop: 2, wordBreak: "break-word" }}>
                    önerilen: {next}
                  </span>
                </span>
              </label>
            );
          })}

          {selectedSeries && observation.hashtag.coreTags.length > 0 && (
            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "10px 12px",
                background: "var(--bg-sunken)",
                border: `1px solid ${applySeriesTags ? "var(--accent-border)" : "var(--border-faint)"}`,
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={applySeriesTags}
                onChange={() => setApplySeriesTags((v) => !v)}
                data-testid="ig-dna-field-seriesHashtags"
                style={{ marginTop: 3 }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)" }}>
                  &ldquo;{selectedSeries.name}&rdquo; serisi hashtag override&apos;ı
                </span>
                <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--accent-text)", marginTop: 3, wordBreak: "break-word" }}>
                  önerilen: {[...observation.hashtag.coreTags, ...observation.hashtag.rotatingTags].slice(0, 8).join(" ")}
                </span>
              </span>
            </label>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            <Button
              variant="primary"
              onClick={apply}
              loading={busy}
              disabled={selection.size === 0 && !applySeriesTags}
              data-testid="ig-dna-apply-save"
            >
              Onayla ve uygula
            </Button>
            <Button variant="ghost" onClick={() => setApplyOpen(false)}>
              Vazgeç
            </Button>
            {note && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>{note}</span>}
          </div>
        </div>
      </Drawer>
      </div>
    </Card>
  );
}
