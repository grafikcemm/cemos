/**
 * Instagram içerik-planı sağlık sözleşmesi (Phase 3E, ADR-039 §9) — SAF,
 * yan-etkisiz. Bu, üç canonical altyapı sözleşmesinden AYRI bir ÜRÜN/GÖREV
 * sözleşmesidir; infrastructure'ı EZMEZ. Slot üretim durumu Phase 3D
 * `computeDossierProductionState` çıktısından TÜRETİLİR — ikinci bir readiness
 * sözlüğü icat EDİLMEZ.
 *
 * Anlam korkulukları:
 *  - Planın bulunmaması ALTYAPI HATASI değildir (opsiyonel/not_configured).
 *  - Draft planın eksikliği normal olabilir (actionable değil).
 *  - Active planın YAKLAŞAN slotu hazır değilse actionable warning; bugün/geride
 *    kalan hazır değilse daha yüksek öncelik.
 *  - Bayat kanıt bir OUTAGE değildir (warn, error değil).
 *  - production_ready = yalnız Phase 3D'nin BÜTÜN kapıları geçmiş demektir.
 *  - Veri alınamıyorsa "healthy" UYDURMA → unknown.
 */

import type { SectionStatus } from "@/lib/health/healthContracts";
import type { ProductionOverall, EvidenceLayerState } from "@/lib/reels/productionState";

export const PLAN_HEALTH_VERSION = "instagram_plan_health.v1";
export const UPCOMING_WINDOW_DAYS = 7;

export type PlanSlotHealth = {
  slotId: string;
  dayOfMonth: number;
  status: string; // planned | drafted | done | skipped
  hasDossier: boolean;
  /** Phase 3D production overall (dossier varsa) — yeniden HESAPLANMAZ. */
  overall: ProductionOverall | null;
  productionReady: boolean;
  evidenceState: EvidenceLayerState | null;
};

export type InstagramPlanHealthInput = {
  /** Aktif/taslak plan (yoksa null → not_configured). */
  plan: {
    accountId: string;
    month: string;
    status: "draft" | "active" | "archived";
    warnings: string[];
    hardBlockers: string[];
    collisions: number;
    mixDeviation: boolean;
    repetitionWarnings: number;
  } | null;
  slots: PlanSlotHealth[];
  /** Plan ayı içinde bugünün günü (plan.month = mevcut ay ise), yoksa null. */
  todayDayOfMonth: number | null;
  /** Veri hiç toplanamadıysa true → unknown. */
  dataUnavailable?: boolean;
};

export type PlanHealthCounts = {
  totalActiveSlots: number;
  protectedSlots: number;
  skippedSlots: number;
  withoutDossier: number;
  attachedNotReady: number;
  productionReady: number;
  evidenceMissing: number;
  evidenceStale: number;
  evidenceFailed: number;
  creativeNeedsEdit: number;
  awaitingApproval: number;
  seriesChanged: number;
};

export type InstagramPlanHealthContract = {
  version: typeof PLAN_HEALTH_VERSION;
  status: SectionStatus;
  configured: boolean;
  planStatus: "draft" | "active" | "archived" | null;
  month: string | null;
  accountId: string | null;
  counts: PlanHealthCounts;
  collisions: number;
  repetitionWarnings: number;
  mixDeviation: boolean;
  overdueIncomplete: number;
  todayUnready: number;
  next7DaysUnready: number;
  nextActionable: { slotId: string; dayOfMonth: number; reason: string } | null;
  blockers: string[];
  warnings: string[];
  message: string;
};

const PROTECTED_STATUSES = ["drafted", "done"];

function emptyCounts(): PlanHealthCounts {
  return {
    totalActiveSlots: 0,
    protectedSlots: 0,
    skippedSlots: 0,
    withoutDossier: 0,
    attachedNotReady: 0,
    productionReady: 0,
    evidenceMissing: 0,
    evidenceStale: 0,
    evidenceFailed: 0,
    creativeNeedsEdit: 0,
    awaitingApproval: 0,
    seriesChanged: 0,
  };
}

function reasonFor(slot: PlanSlotHealth): string {
  if (!slot.hasDossier) return "dossier bekliyor";
  switch (slot.overall) {
    case "evidence_missing":
      return "site kanıtı yok";
    case "evidence_stale":
      return "kanıt bayat — yeniden doğrula";
    case "evidence_failed":
      return "site açılmıyor";
    case "creative_needs_edit":
      return "içerik düzenleme bekliyor";
    case "series_contract_changed":
      return "seri sözleşmesi değişti";
    case "awaiting_human_approval":
      return "onay bekliyor";
    case "attached_not_ready":
      return "bağlandı ama hazır değil";
    default:
      return "hazır değil";
  }
}

export function deriveInstagramPlanHealth(
  input: InstagramPlanHealthInput
): InstagramPlanHealthContract {
  const base: Omit<InstagramPlanHealthContract, "status" | "message"> = {
    version: PLAN_HEALTH_VERSION,
    configured: input.plan !== null,
    planStatus: input.plan?.status ?? null,
    month: input.plan?.month ?? null,
    accountId: input.plan?.accountId ?? null,
    counts: emptyCounts(),
    collisions: input.plan?.collisions ?? 0,
    repetitionWarnings: input.plan?.repetitionWarnings ?? 0,
    mixDeviation: input.plan?.mixDeviation ?? false,
    overdueIncomplete: 0,
    todayUnready: 0,
    next7DaysUnready: 0,
    nextActionable: null,
    blockers: input.plan?.hardBlockers ?? [],
    warnings: input.plan?.warnings ?? [],
  };

  if (input.dataUnavailable) {
    return { ...base, status: "unknown", message: "Instagram plan sağlığı verisi alınamadı." };
  }
  if (!input.plan) {
    return {
      ...base,
      status: "ok",
      message: "Instagram içerik planı yapılandırılmadı (opsiyonel).",
    };
  }

  const counts = emptyCounts();
  const active = input.slots.filter((s) => s.status !== "skipped");
  counts.skippedSlots = input.slots.length - active.length;
  counts.totalActiveSlots = active.length;

  let overdueIncomplete = 0;
  let todayUnready = 0;
  let next7DaysUnready = 0;
  const today = input.todayDayOfMonth;
  const unreadyCandidates: PlanSlotHealth[] = [];

  for (const s of active) {
    if (PROTECTED_STATUSES.includes(s.status) || s.hasDossier) counts.protectedSlots++;
    if (!s.hasDossier) counts.withoutDossier++;
    if (s.productionReady) counts.productionReady++;

    switch (s.overall) {
      case "attached_not_ready":
        counts.attachedNotReady++;
        break;
      case "awaiting_human_approval":
        counts.awaitingApproval++;
        break;
      case "creative_needs_edit":
        counts.creativeNeedsEdit++;
        break;
      case "series_contract_changed":
        counts.seriesChanged++;
        break;
    }
    switch (s.evidenceState) {
      case "missing":
        counts.evidenceMissing++;
        break;
      case "stale":
        counts.evidenceStale++;
        break;
      case "failed":
        counts.evidenceFailed++;
        break;
    }

    const unready = s.status !== "done" && !s.productionReady;
    if (unready) {
      unreadyCandidates.push(s);
      if (today !== null) {
        if (s.dayOfMonth < today) overdueIncomplete++;
        else if (s.dayOfMonth === today) todayUnready++;
        else if (s.dayOfMonth <= today + UPCOMING_WINDOW_DAYS) next7DaysUnready++;
      }
    }
  }

  // Sonraki actionable: bugünden itibaren en erken hazır-olmayan (yoksa en erken).
  const fromToday = today === null ? unreadyCandidates : unreadyCandidates.filter((s) => s.dayOfMonth >= today);
  const pool = fromToday.length > 0 ? fromToday : unreadyCandidates;
  const nextSlot = [...pool].sort((a, b) => a.dayOfMonth - b.dayOfMonth)[0] ?? null;
  const nextActionable = nextSlot
    ? { slotId: nextSlot.slotId, dayOfMonth: nextSlot.dayOfMonth, reason: reasonFor(nextSlot) }
    : null;

  // Durum: archived/draft neutral; active'de overdue/today > upcoming > ok.
  let status: SectionStatus;
  let message: string;
  const isActive = input.plan.status === "active";

  if (input.plan.status === "archived") {
    status = "ok";
    message = `${input.plan.month} planı arşivlendi (nötr).`;
  } else if (base.blockers.length > 0) {
    status = "warn";
    message = `Plan hard blocker içeriyor (${base.blockers.length}) — uygulanamaz/gözden geçir.`;
  } else if (isActive && (overdueIncomplete > 0 || todayUnready > 0)) {
    status = "warn";
    message =
      overdueIncomplete > 0
        ? `${overdueIncomplete} geçmiş slot hâlâ hazır değil${todayUnready > 0 ? `, bugün ${todayUnready} slot bekliyor` : ""}.`
        : `Bugün ${todayUnready} slot yayına hazır değil.`;
  } else if (isActive && next7DaysUnready > 0) {
    status = "warn";
    message = `Önümüzdeki ${UPCOMING_WINDOW_DAYS} günde ${next7DaysUnready} slot hazır değil${nextActionable ? ` (gün ${nextActionable.dayOfMonth}: ${nextActionable.reason})` : ""}.`;
  } else if (input.plan.status === "draft") {
    status = "ok";
    message =
      counts.totalActiveSlots === 0
        ? "Taslak plan boş — günleri ve sütunları ekleyip önizle."
        : `Taslak plan: ${counts.totalActiveSlots} slot, ${counts.productionReady} yayına hazır (taslakta eksik normal).`;
  } else {
    status = "ok";
    message =
      counts.totalActiveSlots === 0
        ? "Aktif plan boş."
        : `Aktif plan sağlıklı: ${counts.productionReady}/${counts.totalActiveSlots} yayına hazır.`;
  }

  return {
    ...base,
    counts,
    overdueIncomplete,
    todayUnready,
    next7DaysUnready,
    nextActionable,
    status,
    message,
  };
}
