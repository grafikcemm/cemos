"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import HandoffBand from "@/components/handoff/HandoffBand";
import { usePendingHandoffs } from "@/components/handoff/useHandoffs";

/**
 * Bugün — bekleyen "İçerik üret" aktarımları (ADR-028). Fırsatlar'dan gelen
 * her handoff burada gerçek üretime bağlanır:
 *  - Başarı: QueueItem oluşur, kuyruk yenilenir, yeni taslak odaklanır.
 *  - Dış engel (kredi/bütçe/mock): fırsat KAYBOLMAZ — pending + blockedReason
 *    + Entegrasyonlar kurtarma yolu (sahte taslak yazılmaz).
 *  - Retry idempotent: tüketilmiş aktarım ikinci taslak üretmez.
 */

type Props = {
  onGenerated: (queueItemId: string) => void | Promise<void>;
};

export default function OpportunityHandoffBand({ onGenerated }: Props) {
  const toast = useToast();
  const { handoffs, loading, reload, cancel } = usePendingHandoffs("generate");
  const [busyId, setBusyId] = useState<string | null>(null);

  if (loading || handoffs.length === 0) return null;

  const generate = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/opportunities/handoff/${id}/generate`, { method: "POST" });
      const json = await res.json();
      if (res.ok && json.success && json.queueItemId) {
        toast.success("Fırsattan taslak üretildi — kuyruğa eklendi.");
        await reload();
        await onGenerated(json.queueItemId as string);
        return;
      }
      if (res.ok && json.success && json.blocked) {
        toast.error(json.message ?? "Üretim şu an engelli — fırsat bekliyor.");
        await reload(); // blockedReason bandda görünür olsun
        return;
      }
      toast.error(json.error ?? "Üretim başarısız — fırsat bekliyor, yeniden dene.");
    } catch {
      toast.error("Üretim başarısız (ağ hatası) — fırsat bekliyor.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      aria-label="Fırsattan gelen üretim aktarımları"
      style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "var(--space-4)" }}
    >
      {handoffs.map((h) => (
        <HandoffBand
          key={h.id}
          handoff={h}
          onCancel={async () => {
            const r = await cancel(h.id);
            if (!r.ok) toast.error(r.error ?? "İptal edilemedi.");
          }}
          primary={
            <Button
              size="sm"
              variant="primary"
              loading={busyId === h.id}
              onClick={() => generate(h.id)}
              iconLeft={busyId === h.id ? undefined : <Zap size={14} strokeWidth={2} />}
              data-testid={`handoff-generate-${h.id}`}
            >
              {busyId === h.id ? "Üretiliyor…" : "Taslak üret"}
            </Button>
          }
        />
      ))}
    </section>
  );
}
