/**
 * Instagram plan sağlığı — sunucu montajı (Phase 3E, ADR-039 §9/§10). Aktif
 * (yoksa en güncel) planı okur, bağlı dossier'lerin ÜRETİM DURUMUNU Phase 3D
 * `getDossierProductionState` ile TÜRETİR (ikinci readiness sözlüğü YOK) ve saf
 * `deriveInstagramPlanHealth`'e verir. Fail-soft: veri toplanamazsa unknown.
 *
 * Bu sözleşme AYRI bir ürün/görev domain'idir; infrastructure'ı bozmaz. Secret
 * DEĞERİ yazılmaz.
 */

import { prisma } from "@/lib/db/client";
import { getDossierProductionState } from "@/lib/reels/dossierProductionService";
import { parsePlanNotes } from "@/lib/reels/planNotes";
import {
  deriveInstagramPlanHealth,
  type InstagramPlanHealthContract,
  type InstagramPlanHealthInput,
  type PlanSlotHealth,
} from "@/lib/health/planHealthContract";
import type { ProductionOverall, EvidenceLayerState } from "@/lib/reels/productionState";

function istanbulMonthDay(nowMs: number): { month: string; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
  const [y, m, d] = parts.split("-");
  return { month: `${y}-${m}`, day: Number(d) };
}

type DossierState = {
  overall: ProductionOverall;
  productionReady: boolean;
  evidenceState: EvidenceLayerState;
};

async function loadPlanHealthInput(nowMs: number): Promise<InstagramPlanHealthInput> {
  // Rapor edilecek plan: aktif (varsa) → en güncel ay; yoksa en son güncellenen.
  const plan =
    (await prisma.reelPlan.findFirst({ where: { status: "active" }, orderBy: { month: "desc" } })) ??
    (await prisma.reelPlan.findFirst({ orderBy: { updatedAt: "desc" } }));

  if (!plan) return { plan: null, slots: [], todayDayOfMonth: null };

  const slotRows = await prisma.reelPlanSlot.findMany({
    where: { planId: plan.id },
    orderBy: { dayOfMonth: "asc" },
    select: { id: true, dayOfMonth: true, status: true, dossierId: true },
  });

  // Bağlı dossier'lerin production durumunu Phase 3D servisinden TÜRET.
  const dossierIds = [...new Set(slotRows.map((s) => s.dossierId).filter((x): x is string => Boolean(x)))];
  const stateByDossier = new Map<string, DossierState>();
  if (dossierIds.length > 0) {
    const dossiers = await prisma.reelDossier.findMany({ where: { id: { in: dossierIds } } });
    for (const d of dossiers) {
      const state = await getDossierProductionState(d, nowMs);
      stateByDossier.set(d.id, {
        overall: state.overall,
        productionReady: state.productionReady,
        evidenceState: state.layers.evidence.state,
      });
    }
  }

  const slots: PlanSlotHealth[] = slotRows.map((s) => {
    const state = s.dossierId ? stateByDossier.get(s.dossierId) : undefined;
    return {
      slotId: s.id,
      dayOfMonth: s.dayOfMonth,
      status: s.status,
      hasDossier: Boolean(s.dossierId),
      overall: state?.overall ?? null,
      productionReady: state?.productionReady ?? false,
      evidenceState: state?.evidenceState ?? null,
    };
  });

  // Collision: aynı günde >1 non-skipped slot (canlı hesap).
  const dayCount = new Map<number, number>();
  for (const s of slots) {
    if (s.status === "skipped") continue;
    dayCount.set(s.dayOfMonth, (dayCount.get(s.dayOfMonth) ?? 0) + 1);
  }
  const collisions = [...dayCount.values()].filter((n) => n > 1).length;

  const notes = parsePlanNotes(plan.notesJson);
  const warnings = notes.warnings;
  const mixDeviation = warnings.some((w) => w.includes("Mix sapması"));
  const repetitionWarnings = warnings.filter(
    (w) => w.includes("Tekrar") || w.includes("Benzer konu")
  ).length;
  const hardBlockers = notes.envelope?.hardBlockers ?? [];

  const { month: nowMonth, day: nowDay } = istanbulMonthDay(nowMs);
  const todayDayOfMonth = plan.month === nowMonth ? nowDay : null;

  return {
    plan: {
      accountId: plan.accountId,
      month: plan.month,
      status: plan.status as "draft" | "active" | "archived",
      warnings,
      hardBlockers,
      collisions,
      mixDeviation,
      repetitionWarnings,
    },
    slots,
    todayDayOfMonth,
  };
}

/**
 * Instagram plan sağlığını türetir. Fail-soft: herhangi bir sorgu hata verirse
 * "unknown" döner (healthy uydurulmaz), sistemi kırmızı yapmaz.
 */
export async function getInstagramPlanHealth(nowMs = Date.now()): Promise<InstagramPlanHealthContract> {
  try {
    const input = await loadPlanHealthInput(nowMs);
    return deriveInstagramPlanHealth(input);
  } catch {
    return deriveInstagramPlanHealth({ plan: null, slots: [], todayDayOfMonth: null, dataUnavailable: true });
  }
}
