"use client";

import { useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button, Drawer, Select, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import HandoffBand from "@/components/handoff/HandoffBand";
import { HANDOFF_SOURCE_LABEL, usePendingHandoffs, type HandoffDto } from "@/components/handoff/useHandoffs";
import { daysInMonth, monthLabel } from "@/lib/utils/calendarGrid";

/**
 * Takvim — bekleyen "Plana ekle" aktarımları (ADR-028). Sessiz slot YAZILMAZ:
 * kullanıcı prefilled panelde GÜN seçip onaylayınca gerçek ReelPlanSlot
 * oluşur (consume+create tek transaction, tekrar onay duplicate üretmez).
 * İptal = aktarım tüketilmiş SAYILMAZ (pending kalır, reload'da geri gelir).
 */

type Props = {
  accountId: string;
  year: number;
  month1: number;
  monthStr: string;
  onPlaced: () => void | Promise<void>;
  onNeedPlan: () => void;
};

export default function PlanHandoffBand({ accountId, year, month1, monthStr, onPlaced, onNeedPlan }: Props) {
  const toast = useToast();
  const { handoffs, loading, reload, cancel } = usePendingHandoffs("plan", accountId || undefined);
  const [active, setActive] = useState<HandoffDto | null>(null);
  const [day, setDay] = useState("1");
  const [busy, setBusy] = useState(false);
  const [planMissing, setPlanMissing] = useState(false);

  const dayOptions = useMemo(
    () => Array.from({ length: daysInMonth(year, month1) }, (_, i) => ({ value: String(i + 1), label: `${i + 1}. gün` })),
    [year, month1]
  );

  if (loading || handoffs.length === 0) return null;

  const confirmPlace = async () => {
    if (!active) return;
    setBusy(true);
    setPlanMissing(false);
    try {
      const res = await fetch(`/api/opportunities/handoff/${active.id}/consume-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: monthStr, dayOfMonth: Number(day) }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.alreadyConsumed ? "Bu fırsat zaten plana eklenmişti." : `Plana eklendi — ${day}. gün.`);
        setActive(null);
        await reload();
        await onPlaced();
        return;
      }
      if (json.code === "plan_not_found") {
        setPlanMissing(true); // dürüst boş durum — sahte slot yok
        return;
      }
      toast.error(json.error ?? "Plana eklenemedi.");
    } catch {
      toast.error("Plana eklenemedi (ağ hatası).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section
        aria-label="Fırsattan gelen plan aktarımları"
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
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
                onClick={() => {
                  setActive(h);
                  setPlanMissing(false);
                }}
                iconLeft={<CalendarPlus size={14} strokeWidth={2} />}
                data-testid={`handoff-place-${h.id}`}
              >
                Güne yerleştir
              </Button>
            }
          />
        ))}
      </section>

      {/* Prefilled yerleştirme paneli — onaydan önce DB kaydı YOK */}
      <Drawer open={!!active} onClose={() => setActive(null)} title="Fırsatı plana yerleştir" width={460}>
        {active && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="handoff-plan-drawer">
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Badge variant="muted" size="sm">{HANDOFF_SOURCE_LABEL[active.sourceKind]}</Badge>
              <Badge variant="muted" size="sm">{active.suggestedPlatform}</Badge>
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>deterministik seçim</span>
            </div>
            <div>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }}>{active.title}</div>
              {active.whyNow && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.55 }}>
                  Neden şimdi? {active.whyNow}
                  {active.whyNowDetail ? ` — ${active.whyNowDetail}` : ""}
                </div>
              )}
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Gün — {monthLabel(year, month1)}
              </span>
              <Select aria-label="Gün" options={dayOptions} value={day} onChange={(e) => setDay(e.target.value)} data-testid="handoff-plan-day" />
            </label>
            {planMissing && (
              <div
                data-testid="handoff-plan-missing"
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--status-warn-text)",
                  background: "color-mix(in srgb, var(--status-warn) 8%, var(--bg-sunken))",
                  border: "1px solid color-mix(in srgb, var(--status-warn) 24%, transparent)",
                  borderRadius: "var(--radius-md)",
                  padding: "8px 10px",
                  lineHeight: 1.55,
                }}
              >
                Bu ay ({monthLabel(year, month1)}) için aylık plan yok — fırsat bekliyor.{" "}
                <button
                  onClick={() => {
                    setActive(null);
                    onNeedPlan();
                  }}
                  style={{ background: "none", border: "none", padding: 0, color: "var(--accent-text)", fontFamily: "inherit", fontSize: "var(--text-xs)", cursor: "pointer", textDecoration: "underline" }}
                >
                  Önce aylık planı kur
                </button>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
              <Button variant="primary" onClick={confirmPlace} loading={busy} data-testid="handoff-plan-confirm">
                Plana ekle
              </Button>
              <Button variant="ghost" onClick={() => setActive(null)}>
                Vazgeç
              </Button>
            </div>
            <p style={{ margin: 0, fontSize: "var(--text-2xs)", color: "var(--text-muted)", lineHeight: 1.5 }}>
              Onaylamadan hiçbir takvim kaydı oluşmaz; vazgeçersen fırsat bekleyenler arasında kalır.
            </p>
          </div>
        )}
      </Drawer>
    </>
  );
}
