"use client";

import { useState } from "react";
import { Button, Select, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

/**
 * Slot operasyon çubuğu (ADR-039 §8/§11): taşı / atla / geri al. Optimistic
 * concurrency (expectedUpdatedAt); done slot taşınamaz/atlanamaz; dossier
 * bağlantısı taşımada korunur. Dossier veya handoff FİZİKSEL silinmez.
 */
export default function SlotOpsBar({
  accountId,
  slotRawId,
  dayOfMonth,
  status,
  updatedAt,
  daysInMonth,
  onChanged,
}: {
  accountId: string;
  slotRawId: string;
  dayOfMonth: number;
  status: string;
  updatedAt: string | null;
  daysInMonth: number;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [targetDay, setTargetDay] = useState(String(dayOfMonth));
  const [busy, setBusy] = useState(false);

  const call = async (path: string, body: Record<string, unknown>, okMsg: string) => {
    if (!updatedAt) {
      toast.error("Slot durumu bilinmiyor — sayfayı yenile.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, expectedUpdatedAt: updatedAt, ...body }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(okMsg);
        onChanged();
      } else if (json.code === "day_occupied") {
        toast.error("Hedef günde zaten bir slot var.");
      } else if (json.code === "stale") {
        toast.error("Slot bu arada değişti — yenile.");
      } else {
        toast.error(json.error ?? "İşlem başarısız.");
      }
    } catch {
      toast.error("İşlem başarısız (ağ).");
    } finally {
      setBusy(false);
    }
  };

  if (status === "done") {
    return (
      <div data-testid="slot-ops" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Badge variant="success" size="sm">operatör tamamladı</Badge>
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
          İşlenmiş slot taşınamaz/atlanamaz (IG yayın iddiası değildir).
        </span>
      </div>
    );
  }

  if (status === "skipped") {
    return (
      <div data-testid="slot-ops" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Badge variant="muted" size="sm">atlandı</Badge>
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={() => call(`/api/reels/plan/slot/${slotRawId}/restore`, {}, "Slot geri alındı.")}
          data-testid="slot-restore-btn"
        >
          Geri al
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="slot-ops" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Select
        aria-label="Hedef gün"
        options={Array.from({ length: daysInMonth }, (_, i) => ({ value: String(i + 1), label: `Gün ${i + 1}` }))}
        value={targetDay}
        onChange={(e) => setTargetDay(e.target.value)}
      />
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        onClick={() => call(`/api/reels/plan/slot/${slotRawId}/move`, { targetDay: Number(targetDay) }, "Slot taşındı.")}
        data-testid="slot-move-btn"
      >
        Taşı
      </Button>
      <Button
        size="sm"
        variant="ghost"
        loading={busy}
        onClick={() => call(`/api/reels/plan/slot/${slotRawId}/skip`, {}, "Slot atlandı.")}
        data-testid="slot-skip-btn"
      >
        Atla
      </Button>
    </div>
  );
}
