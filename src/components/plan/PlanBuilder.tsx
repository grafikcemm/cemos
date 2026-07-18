"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Select, Textarea, Badge, Toggle, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { postDaysFromFrequency } from "@/lib/utils/calendarGrid";

/**
 * Aylık plan builder (ADR-039 §11): preview → apply → activate ayrı adımlar.
 * Ham slug yok (seri görünen adı), window.prompt yok. Preview sıfır-write;
 * apply fingerprint + expectedUpdatedAt taşır; aktivasyon açık ayrı eylem.
 */

const DEFAULT_PILLARS = ["ai_prompt_reveal", "site_turu", "arac_demo", "palet_reveal"];

type SeriesRow = { id: string; seriesKey: string; name: string; format: string };
type PlanSeriesInput = { seriesKey: string; pillar: string; episodesPerMonth: number };

type PreviewSlot = { dayOfMonth: number; pillar: string; mixBucket: string; seriesKey: string | null; topicHint: string; status: string };
type Preview = {
  daysInMonth: number;
  planExists: boolean;
  planStatus: string | null;
  expectedUpdatedAt: string | null;
  fingerprint: string;
  mix: Record<string, number>;
  slotsAdded: PreviewSlot[];
  slotsUpdated: PreviewSlot[];
  slotsUnchanged: PreviewSlot[];
  slotsProtected: PreviewSlot[];
  slotsSkipped: PreviewSlot[];
  collisions: Array<{ dayOfMonth: number; reason: string }>;
  histogram: { findings: Array<{ dimension: string; message: string }> };
  warnings: string[];
  hardBlockers: string[];
  idempotentNoop: boolean;
};

const COMPATIBLE_FORMATS = ["carousel", "reel", "single"];

export default function PlanBuilder({
  accountId,
  monthStr,
  monthLabel,
  year,
  month1,
  planStatus,
  planUpdatedAt,
  onApplied,
}: {
  accountId: string;
  monthStr: string;
  monthLabel: string;
  year: number;
  month1: number;
  planStatus: string | null;
  planUpdatedAt: string | null;
  onApplied: () => void;
}) {
  const toast = useToast();
  const [pillarText, setPillarText] = useState(DEFAULT_PILLARS.join("\n"));
  const [frequency, setFrequency] = useState("3");
  const [seasonalText, setSeasonalText] = useState("");
  const [allSeries, setAllSeries] = useState<SeriesRow[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<Record<string, number>>({}); // seriesKey -> episodes
  const [seriesPillar, setSeriesPillar] = useState<Record<string, string>>({}); // seriesKey -> pillar

  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [ackWarnings, setAckWarnings] = useState(false);
  const [currentUpdatedAt, setCurrentUpdatedAt] = useState<string | null>(planUpdatedAt);
  const [currentStatus, setCurrentStatus] = useState<string | null>(planStatus);

  useEffect(() => {
    setCurrentUpdatedAt(planUpdatedAt);
    setCurrentStatus(planStatus);
  }, [planUpdatedAt, planStatus]);

  const pillars = useMemo(
    () => pillarText.split("\n").map((p) => p.trim()).filter(Boolean),
    [pillarText]
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/series`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.success) return;
        const rows = (j.series ?? []) as SeriesRow[];
        setAllSeries(rows.filter((s) => COMPATIBLE_FORMATS.includes(s.format)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSeries = (s: SeriesRow) => {
    setSelectedSeries((prev) => {
      const next = { ...prev };
      if (next[s.seriesKey] != null) delete next[s.seriesKey];
      else next[s.seriesKey] = 2;
      return next;
    });
    setSeriesPillar((prev) => ({ ...prev, [s.seriesKey]: prev[s.seriesKey] ?? pillars[0] ?? "" }));
  };

  const buildSeriesInput = (): PlanSeriesInput[] =>
    Object.entries(selectedSeries).map(([seriesKey, episodesPerMonth]) => ({
      seriesKey,
      episodesPerMonth,
      pillar: seriesPillar[seriesKey] || pillars[0] || "",
    }));

  const planConfig = useCallback(() => {
    const seasonalTopics = seasonalText.split("\n").map((t) => t.trim()).filter(Boolean);
    return {
      pillars,
      postDays: postDaysFromFrequency(Number(frequency), year, month1),
      series: buildSeriesInput(),
      seasonalTopics,
    };
  }, [pillars, frequency, year, month1, seasonalText, selectedSeries, seriesPillar]);

  const runPreview = async () => {
    if (pillars.length < 3 || pillars.length > 5) {
      toast.error("3–5 sütun (pillar) gerekli.");
      return;
    }
    setBusy(true);
    setPreview(null);
    try {
      const res = await fetch("/api/reels/plan/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, month: monthStr, plan: planConfig() }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setPreview(json.preview as Preview);
        setCurrentUpdatedAt(json.preview.expectedUpdatedAt);
        setCurrentStatus(json.preview.planStatus);
      } else if (json.code === "series_invalid") {
        toast.error(`Seri geçersiz: ${(json.invalid ?? []).join("; ")}`);
      } else {
        toast.error(json.error ?? "Önizleme başarısız.");
      }
    } catch {
      toast.error("Önizleme başarısız (ağ).");
    } finally {
      setBusy(false);
    }
  };

  const runApply = async () => {
    if (!preview) return;
    if (preview.hardBlockers.length > 0) {
      toast.error("Plan hard blocker içeriyor — uygulanamaz.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/reels/plan/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          month: monthStr,
          plan: planConfig(),
          fingerprint: preview.fingerprint,
          expectedUpdatedAt: preview.expectedUpdatedAt,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(
          json.idempotent
            ? "Plan değişmedi (idempotent)."
            : `Plan uygulandı: +${json.created} yeni, ${json.updated} güncel, ${json.skipped} atlandı.`
        );
        setCurrentUpdatedAt(json.updatedAt);
        setCurrentStatus((s) => s ?? "draft");
        onApplied();
        // Preview'i güncel updatedAt ile tazele (aktivasyon için).
        void runPreview();
      } else if (json.code === "stale" || json.code === "fingerprint_mismatch") {
        toast.error("Plan bu arada değişti — yeniden önizle.");
        void runPreview();
      } else {
        toast.error(json.error ?? "Plan uygulanamadı.");
      }
    } catch {
      toast.error("Plan uygulanamadı (ağ).");
    } finally {
      setBusy(false);
    }
  };

  const runLifecycle = async (target: "active" | "archived" | "draft") => {
    if (!currentUpdatedAt) {
      toast.error("Önce planı uygula/önizle.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/reels/plan/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          month: monthStr,
          target,
          expectedUpdatedAt: currentUpdatedAt,
          acknowledgeWarnings: ackWarnings,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(`Plan durumu: ${json.status}.`);
        setCurrentStatus(json.status);
        setCurrentUpdatedAt(json.updatedAt);
        onApplied();
      } else if (json.code === "ack_required") {
        toast.error("Plan uyarı içeriyor — aktive etmek için uyarıları onayla.");
      } else if (json.code === "stale") {
        toast.error("Plan bu arada değişti — yenile.");
      } else {
        toast.error(json.error ?? "Durum değiştirilemedi.");
      }
    } catch {
      toast.error("Durum değiştirilemedi (ağ).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="plan-builder">
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
        Deterministik: %60 evergreen / %25 seasonal / %15 reactive (±10p). Önizle → uygula → <strong>ayrı</strong> aktive et.
        İşlenmiş (drafted/done), dossier bağlı ve Fırsat slotları korunur (silinmez).
      </p>

      <Field label="Sütunlar (pillar) — her satıra bir tane, 3–5 arası">
        <Textarea value={pillarText} onChange={(e) => setPillarText(e.target.value)} rows={5} aria-label="Sütunlar" />
      </Field>

      <Field label="Yayın sıklığı">
        <Select
          aria-label="Sıklık"
          options={[
            { value: "2", label: "2 günde bir" },
            { value: "3", label: "3 günde bir" },
            { value: "4", label: "4 günde bir" },
          ]}
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
        />
      </Field>

      <Field label="Seriler (aktif) — seçilirse ayda kaç bölüm">
        {allSeries.length === 0 ? (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Uygun aktif seri yok.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {allSeries.map((s) => {
              const selected = selectedSeries[s.seriesKey] != null;
              return (
                <div
                  key={s.id}
                  data-testid={`series-row-${s.seriesKey}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    background: "var(--bg-sunken)",
                    border: `1px solid ${selected ? "var(--accent-border)" : "var(--border-faint)"}`,
                    borderRadius: "var(--radius-md)",
                    flexWrap: "wrap",
                  }}
                >
                  <Toggle checked={selected} onChange={() => toggleSeries(s)} aria-label={`Seri ${s.name}`} />
                  <span style={{ flex: 1, minWidth: 120, display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>
                    {s.name || s.seriesKey}
                    <Badge variant="muted" size="xs">{s.format}</Badge>
                  </span>
                  {selected && (
                    <>
                      <Select
                        aria-label={`${s.name} bölüm sayısı`}
                        options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n} bölüm` }))}
                        value={String(selectedSeries[s.seriesKey])}
                        onChange={(e) => setSelectedSeries((p) => ({ ...p, [s.seriesKey]: Number(e.target.value) }))}
                      />
                      <Select
                        aria-label={`${s.name} sütunu`}
                        options={pillars.map((p) => ({ value: p, label: p }))}
                        value={seriesPillar[s.seriesKey] || pillars[0] || ""}
                        onChange={(e) => setSeriesPillar((p) => ({ ...p, [s.seriesKey]: e.target.value }))}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Field>

      <Field label="Sezonluk konular (her satıra bir tane)">
        <Textarea value={seasonalText} onChange={(e) => setSeasonalText(e.target.value)} rows={3} aria-label="Sezonluk konular" />
      </Field>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Button variant="secondary" onClick={runPreview} loading={busy && !preview} data-testid="plan-preview-btn">
          Önizle ({monthLabel})
        </Button>
        {preview && (
          <Button
            variant="primary"
            onClick={runApply}
            loading={busy}
            disabled={preview.hardBlockers.length > 0}
            data-testid="plan-apply-btn"
          >
            Planı uygula
          </Button>
        )}
      </div>

      {busy && !preview && <Skeleton lines={4} />}
      {preview && <PreviewPanel preview={preview} />}

      {/* Lifecycle: apply otomatik AKTİVE ETMEZ — ayrı adım. */}
      {currentStatus && (
        <div
          data-testid="plan-lifecycle"
          style={{ borderTop: "1px solid var(--border-faint)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Plan durumu
            </span>
            <Badge variant={currentStatus === "active" ? "success" : currentStatus === "archived" ? "muted" : "yellow"} size="sm">
              {currentStatus}
            </Badge>
          </div>
          {(preview?.warnings.length ?? 0) > 0 && currentStatus === "draft" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
              <Toggle checked={ackWarnings} onChange={() => setAckWarnings((v) => !v)} aria-label="Uyarıları onayla" />
              {preview?.warnings.length} uyarıyı gördüm — yine de aktive et
            </label>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {currentStatus === "draft" && (
              <Button variant="primary" size="sm" onClick={() => runLifecycle("active")} loading={busy} data-testid="plan-activate-btn">
                Planı aktive et
              </Button>
            )}
            {currentStatus === "active" && (
              <Button variant="secondary" size="sm" onClick={() => runLifecycle("archived")} loading={busy} data-testid="plan-archive-btn">
                Arşivle
              </Button>
            )}
            {currentStatus === "archived" && (
              <Button variant="secondary" size="sm" onClick={() => runLifecycle("draft")} loading={busy} data-testid="plan-restore-btn">
                Taslağa geri al
              </Button>
            )}
          </div>
          <p style={{ margin: 0, fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
            &quot;Aktif&quot; hiçbir zaman &quot;tüm içerikler üretime hazır&quot; demek değildir — yaklaşan slotları Sistem sağlığı gösterir.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function PreviewPanel({ preview }: { preview: Preview }) {
  return (
    <div
      data-testid="plan-preview-panel"
      style={{ background: "var(--bg-sunken)", border: "1px solid var(--border-faint)", borderRadius: "var(--radius-md)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Badge variant="success" size="sm">+{preview.slotsAdded.length} eklenecek</Badge>
        <Badge variant="accent" size="sm">{preview.slotsUpdated.length} güncellenecek</Badge>
        <Badge variant="muted" size="sm">{preview.slotsProtected.length} korunacak</Badge>
        <Badge variant="yellow" size="sm">{preview.slotsSkipped.length} atlanacak</Badge>
        {preview.idempotentNoop && <Badge variant="muted" size="sm">değişiklik yok</Badge>}
      </div>

      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
        Mix: evergreen {preview.mix.evergreen ?? 0} / seasonal {preview.mix.seasonal ?? 0} / reactive {preview.mix.reactive ?? 0}
        {" · "}ay {preview.daysInMonth} gün
      </div>

      {preview.hardBlockers.length > 0 && (
        <div data-testid="plan-hard-blockers" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {preview.hardBlockers.map((b, i) => (
            <div key={i} style={{ fontSize: "var(--text-xs)", color: "var(--status-error)", fontWeight: 500 }}>
              ⛔ {b}
            </div>
          ))}
        </div>
      )}

      {preview.collisions.length > 0 && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--status-warn)" }}>
          {preview.collisions.length} çakışma: {preview.collisions.slice(0, 4).map((c) => `gün ${c.dayOfMonth}`).join(", ")}
        </div>
      )}

      {preview.warnings.length > 0 && (
        <details>
          <summary style={{ fontSize: "var(--text-xs)", color: "var(--status-warn)", cursor: "pointer" }}>
            {preview.warnings.length} uyarı
          </summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {preview.warnings.slice(0, 12).map((w, i) => (
              <li key={i} style={{ fontSize: "var(--text-2xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      {preview.slotsProtected.length > 0 && (
        <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
          Korunan günler: {preview.slotsProtected.map((s) => s.dayOfMonth).join(", ")} (silinmez)
        </div>
      )}
    </div>
  );
}
