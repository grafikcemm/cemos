"use client";

import { useCallback, useEffect, useState } from "react";
import { Dna } from "lucide-react";
import { Button, Select, Badge, Card } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import HandoffBand from "@/components/handoff/HandoffBand";
import { usePendingHandoffs, type HandoffDto } from "@/components/handoff/useHandoffs";

/**
 * Seriler — bekleyen "Seriye ekle" aktarımları (ADR-028). Kullanıcı hedef
 * seriyi SEÇMEDEN ilişki kurulmaz; onay server-side kalıcı + idempotent
 * (handoff consumed + resultRef=seriesKey). Uygun seri yoksa dürüst boş
 * durum — sahte "eklendi" toast'ı YOK.
 */

export type SeriesOption = { seriesKey: string; name: string };

type Props = {
  accountId?: string;
  seriesOptions: SeriesOption[];
  onAttached: () => void | Promise<void>;
};

export default function SeriesHandoffBand({ accountId, seriesOptions, onAttached }: Props) {
  const toast = useToast();
  const { handoffs, loading, reload, cancel } = usePendingHandoffs("series", accountId);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  if (loading || handoffs.length === 0) return null;

  const attach = async (h: HandoffDto) => {
    const seriesKey = selection[h.id] ?? seriesOptions[0]?.seriesKey;
    if (!seriesKey) return;
    setBusyId(h.id);
    try {
      const res = await fetch(`/api/opportunities/handoff/${h.id}/consume-series`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesKey }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(
          json.alreadyConsumed ? "Bu fırsat zaten bir seriye eklenmişti." : "Fırsat seriye aday konu olarak eklendi."
        );
        await reload();
        await onAttached();
        return;
      }
      toast.error(json.error ?? "Seriye eklenemedi.");
    } catch {
      toast.error("Seriye eklenemedi (ağ hatası).");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label="Fırsattan gelen seri aktarımları" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {handoffs.map((h) => (
        <HandoffBand
          key={h.id}
          handoff={h}
          onCancel={async () => {
            const r = await cancel(h.id);
            if (!r.ok) toast.error(r.error ?? "İptal edilemedi.");
          }}
          primary={
            seriesOptions.length === 0 ? (
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                Uygun seri yok — önce aşağıdan bir seri oluştur; fırsat bekliyor.
              </span>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Select
                  aria-label="Hedef seri"
                  options={seriesOptions.map((s) => ({ value: s.seriesKey, label: s.name }))}
                  value={selection[h.id] ?? seriesOptions[0].seriesKey}
                  onChange={(e) => setSelection((prev) => ({ ...prev, [h.id]: e.target.value }))}
                  data-testid={`handoff-series-select-${h.id}`}
                />
                <Button
                  size="sm"
                  variant="primary"
                  loading={busyId === h.id}
                  onClick={() => attach(h)}
                  iconLeft={busyId === h.id ? undefined : <Dna size={14} strokeWidth={2} />}
                  data-testid={`handoff-series-confirm-${h.id}`}
                >
                  Bu seriye ekle
                </Button>
              </span>
            )
          }
        />
      ))}
    </section>
  );
}

/**
 * Seçili serinin fırsattan gelen aday konuları — kalıcı ilişki kayıtları
 * (consumed handoff + resultRef=seriesKey). Sessiz yardımcı kart; boşken
 * hiç görünmez.
 */
export function SeriesCandidateTopics({ accountId, seriesKey }: { accountId?: string; seriesKey: string }) {
  const [items, setItems] = useState<HandoffDto[]>([]);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ action: "series", status: "consumed", resultRef: seriesKey });
      if (accountId) qs.set("accountId", accountId);
      const res = await fetch(`/api/opportunities/handoff?${qs.toString()}`);
      const json = await res.json();
      setItems(res.ok && json.success ? (json.handoffs ?? []) : []);
    } catch {
      setItems([]);
    }
  }, [accountId, seriesKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (items.length === 0) return null;

  return (
    // Card data-* forward etmez — testid sarmalayıcı div'de.
    <div data-testid="series-candidate-topics">
      <Card variant="quiet" padded>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="eyebrow" style={{ color: "var(--text-muted)" }}>
          Fırsattan gelen aday konular
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((h) => (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Badge variant="accent" size="sm">{h.suggestedPlatform}</Badge>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{h.title}</span>
              {h.whyNow && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>· {h.whyNow}</span>}
            </div>
          ))}
        </div>
      </div>
      </Card>
    </div>
  );
}
