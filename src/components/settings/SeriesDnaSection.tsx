"use client";

import { useCallback, useEffect, useState } from "react";
import { Dna, Save, Sprout } from "lucide-react";
import { Card, SectionHeader, EmptyState, Badge, Button } from "@/components/ui";
import ErrorState from "@/components/ui/ErrorState";
import { useActiveAccount } from "@/lib/accounts/useActiveAccount";

/**
 * Seri DNA editörü (Sprint 8 — CONTENT-ENGINE §5.3; C9: Settings içinde,
 * yeni ekran yok). Kaydet = version + promptVersion bump (insan-onaylı DNA).
 * 4 durum tasarımlı.
 */

type SeriesRow = {
  id: string;
  accountId: string;
  seriesKey: string;
  name: string;
  platform: string;
  purpose: string;
  audience: string;
  objective: string;
  format: string;
  slideCountRange: string;
  coverFormula: string;
  ctaFormula: string;
  slideArchetypesJson: string;
  variableElementsJson: string;
  bannedRepetitionJson: string;
  version: number;
  promptVersion: string;
};

type EditableKey =
  | "purpose"
  | "audience"
  | "objective"
  | "slideCountRange"
  | "coverFormula"
  | "ctaFormula"
  | "slideArchetypesJson"
  | "variableElementsJson"
  | "bannedRepetitionJson";

const FIELD_LABELS: Array<{ key: EditableKey; label: string; multiline?: boolean; json?: boolean }> = [
  { key: "purpose", label: "Amaç" },
  { key: "audience", label: "Kitle" },
  { key: "objective", label: "Hedef aksiyon (save/follow/share/profile_visit)" },
  { key: "slideCountRange", label: "Slayt sayısı aralığı" },
  { key: "coverFormula", label: "Kapak formülü", multiline: true },
  { key: "ctaFormula", label: "CTA formülü", multiline: true },
  { key: "slideArchetypesJson", label: "Slayt arketipleri (JSON dizi)", multiline: true, json: true },
  { key: "variableElementsJson", label: "Her bölümde değişmesi zorunlu (JSON dizi)", multiline: true, json: true },
  { key: "bannedRepetitionJson", label: "Tekrar yasakları (JSON dizi)", multiline: true, json: true },
];

export default function SeriesDnaSection() {
  // WP-04 / P0 batch A1: accountId artık TEK otorite global activeChannel'dan
  // (useActiveAccount) gelir — bu ekranın kendine özel /api/settings çağrısı
  // yalnızca accounts[0]?.id almak içindi, o yüzden kaldırıldı (DRY).
  const { accountId } = useActiveAccount();
  const [series, setSeries] = useState<SeriesRow[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Partial<Record<EditableKey, string>>>({});
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch("/api/series");
      if (!res.ok) throw new Error("http");
      const json = await res.json();
      if (!json.success) throw new Error("payload");
      setSeries(json.series ?? []);
      if ((json.series ?? []).length > 0) {
        setSelectedId((prev) => prev || json.series[0].id);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = (series ?? []).find((s) => s.id === selectedId) ?? null;

  const seed = async () => {
    setBusy(true);
    setNote(null);
    try {
      if (!accountId) {
        setNote("Hesap bulunamadı — önce hesap kurulmalı.");
        return;
      }
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed", accountId }),
      });
      const json = await res.json();
      setNote(
        res.ok && json.success
          ? json.created
            ? "Best AI Tools serisi tohumlandı."
            : "Seri zaten mevcut."
          : (json.error ?? "Tohumlama başarısız")
      );
      await load();
    } catch {
      setNote("Tohumlama başarısız (ağ hatası)");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/series", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, ...draft }),
      });
      const json = await res.json();
      setNote(
        res.ok && json.success
          ? `Kaydedildi — yeni sürüm: v${json.version} (promptVersion ${json.promptVersion})`
          : (json.error ?? "Kaydedilemedi")
      );
      setDraft({});
      await load();
    } catch {
      setNote("Kaydedilemedi (ağ hatası)");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="feature" padded style={{ marginTop: "var(--space-4)" }}>
      <SectionHeader
        eyebrow="SERİ DNA"
        title="Seri DNA Editörü"
        description="Tekrarlayan format sözleşmesi — kaydetmek sürümü artırır; motor yeni sürümü kullanır."
        action={
          <Button size="sm" variant="secondary" onClick={seed} loading={busy} iconLeft={<Sprout size={14} strokeWidth={2} />}>
            Best AI Tools tohumla
          </Button>
        }
      />

      {loading ? (
        <EmptyState
          icon={<Dna size={22} strokeWidth={1.8} />}
          title="Seriler yükleniyor"
          description="Seri DNA profilleri getiriliyor."
          compact
        />
      ) : loadFailed ? (
        <ErrorState
          title="Seriler alınamadı"
          description="Seri verisi getirilemedi (SeriesProfile tablosu db:push bekliyor olabilir)."
          onRetry={load}
        />
      ) : (series ?? []).length === 0 ? (
        <EmptyState
          icon={<Dna size={22} strokeWidth={1.8} />}
          title="Henüz seri yok"
          description="İlk seriyi tohumla: Best AI Tools (grafikcem carousel serisi)."
          compact
        />
      ) : (
        <>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setDraft({});
              }}
              aria-label="Seri seç"
              style={{
                padding: "9px 12px", background: "var(--bg-base)",
                border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
                color: "var(--text-primary)", fontSize: "var(--text-sm)", fontFamily: "inherit",
              }}
            >
              {(series ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.seriesKey})
                </option>
              ))}
            </select>
            {selected && (
              <>
                <Badge variant="muted" size="xs">{selected.platform}</Badge>
                <Badge variant="muted" size="xs">{selected.format}</Badge>
                <Badge variant="accent" size="xs">v{selected.version}</Badge>
              </>
            )}
          </div>

          {selected && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {FIELD_LABELS.map((f) => {
                const value = draft[f.key] ?? (selected[f.key] as string) ?? "";
                const common = {
                  value,
                  onChange: (
                    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
                  ) => setDraft((d) => ({ ...d, [f.key]: e.target.value })),
                  "aria-label": f.label,
                  style: {
                    width: "100%", padding: "9px 12px", background: "var(--bg-base)",
                    border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
                    color: "var(--text-primary)", fontSize: "var(--text-sm)",
                    fontFamily: f.json ? "var(--font-mono, monospace)" : "inherit",
                  } as React.CSSProperties,
                };
                return (
                  <label key={f.key} style={{ display: "block" }}>
                    <span style={{ display: "block", fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginBottom: 4 }}>
                      {f.label}
                    </span>
                    {f.multiline ? <textarea rows={3} {...common} /> : <input {...common} />}
                  </label>
                );
              })}
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                <Button
                  size="sm"
                  onClick={save}
                  loading={busy}
                  disabled={Object.keys(draft).length === 0}
                  iconLeft={<Save size={14} strokeWidth={2} />}
                >
                  Kaydet (v{selected.version + 1})
                </Button>
                {note && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>{note}</span>}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
