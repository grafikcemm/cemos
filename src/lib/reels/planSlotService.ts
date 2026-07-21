/**
 * Slot operasyonları (Phase 3E, ADR-039 §8) — açık kullanıcı eylemleri:
 *  - move (reschedule): gün değişir, dossier bağlantısı KORUNUR, hedef gün dolu
 *    ise 409, done slot taşınamaz, ayın gerçek günü doğrulanır.
 *  - skip: status="skipped" (non-destructive; dossier/handoff FİZİKSEL silinmez).
 *  - restore: skipped → planned (dossier varsa drafted).
 *
 * Hepsi account ownership + optimistic concurrency (expectedUpdatedAt) + atomik
 * claim (yarış → 409). Dossier veya handoff hiçbir işlemde silinmez.
 */

import { prisma } from "@/lib/db/client";
import { acquireXactAdvisoryLock } from "@/lib/db/advisoryLock";
import { daysInMonth } from "@/lib/utils/calendarGrid";

export type SlotOpError = {
  ok: false;
  code:
    | "not_found"
    | "account_mismatch"
    | "done_immutable"
    | "day_occupied"
    | "invalid_day"
    | "not_skipped"
    | "stale";
  message: string;
};

export type SlotOpResult<T> = SlotOpError | ({ ok: true } & T);

type SlotWithPlan = {
  id: string;
  dayOfMonth: number;
  status: string;
  dossierId: string | null;
  updatedAt: Date;
  planId: string;
  plan: { accountId: string; month: string };
};

async function loadOwnedSlot(
  slotId: string,
  accountId: string
): Promise<SlotWithPlan | SlotOpError> {
  const slot = await prisma.reelPlanSlot.findUnique({
    where: { id: slotId },
    include: { plan: { select: { accountId: true, month: true } } },
  });
  if (!slot) return { ok: false, code: "not_found", message: "Slot bulunamadı." };
  if (slot.plan.accountId !== accountId) {
    return { ok: false, code: "account_mismatch", message: "Slot bu hesaba ait değil." };
  }
  return {
    id: slot.id,
    dayOfMonth: slot.dayOfMonth,
    status: slot.status,
    dossierId: slot.dossierId ?? null,
    updatedAt: slot.updatedAt,
    planId: slot.planId,
    plan: { accountId: slot.plan.accountId, month: slot.plan.month },
  };
}

function checkConcurrency(slot: SlotWithPlan, expectedUpdatedAt: string): SlotOpError | null {
  const expected = Date.parse(expectedUpdatedAt);
  if (!Number.isFinite(expected) || expected !== slot.updatedAt.getTime()) {
    return { ok: false, code: "stale", message: "Slot bu arada değişti — yenileyip tekrar dene." };
  }
  return null;
}

// ── MOVE (reschedule) ────────────────────────────────────────────────────────
export async function moveSlot(input: {
  accountId: string;
  slotId: string;
  targetDay: number;
  expectedUpdatedAt: string;
}): Promise<SlotOpResult<{ dayOfMonth: number; alreadyThere: boolean; updatedAt: string }>> {
  const slot = await loadOwnedSlot(input.slotId, input.accountId);
  if ("ok" in slot && slot.ok === false) return slot;
  const s = slot as SlotWithPlan;

  if (s.status === "done") {
    return { ok: false, code: "done_immutable", message: "İşlenmiş (done) slot taşınamaz." };
  }
  const [y, m] = s.plan.month.split("-").map(Number);
  if (input.targetDay < 1 || input.targetDay > daysInMonth(y, m)) {
    return { ok: false, code: "invalid_day", message: `${s.plan.month} ayında ${input.targetDay}. gün yok.` };
  }
  const concurrency = checkConcurrency(s, input.expectedUpdatedAt);
  if (concurrency) return concurrency;

  if (input.targetDay === s.dayOfMonth) {
    return { ok: true, dayOfMonth: s.dayOfMonth, alreadyThere: true, updatedAt: s.updatedAt.toISOString() };
  }

  const result = await prisma.$transaction(async (tx) => {
    await acquireXactAdvisoryLock(tx, "reel_plan:" + s.planId);
    const fresh = await tx.reelPlanSlot.findUnique({
      where: { id: s.id },
      select: { updatedAt: true, status: true, dayOfMonth: true },
    });
    if (!fresh) return { code: "not_found" as const };
    if (fresh.updatedAt.getTime() !== Date.parse(input.expectedUpdatedAt) || fresh.status === "done") {
      return { code: "stale" as const };
    }
    // Hedef gün dolu mu (skipped hariç, kendisi hariç)?
    const occupied = await tx.reelPlanSlot.findFirst({
      where: { planId: s.planId, dayOfMonth: input.targetDay, status: { not: "skipped" }, id: { not: s.id } },
      select: { id: true },
    });
    if (occupied) return { code: "day_occupied" as const };
    const updated = await tx.reelPlanSlot.update({
      where: { id: s.id },
      data: { dayOfMonth: input.targetDay }, // dossierId KORUNUR
      select: { dayOfMonth: true, updatedAt: true },
    });
    return { ok: true as const, dayOfMonth: updated.dayOfMonth, updatedAt: updated.updatedAt.toISOString() };
  });

  if ("code" in result) {
    if (result.code === "not_found") return { ok: false, code: "not_found", message: "Slot bulunamadı." };
    if (result.code === "day_occupied")
      return { ok: false, code: "day_occupied", message: "Hedef günde zaten bir slot var." };
    return { ok: false, code: "stale", message: "Slot bu arada değişti — yenile." };
  }
  return { ok: true, dayOfMonth: result.dayOfMonth, alreadyThere: false, updatedAt: result.updatedAt };
}

// ── SKIP ─────────────────────────────────────────────────────────────────────
export async function skipSlot(input: {
  accountId: string;
  slotId: string;
  expectedUpdatedAt: string;
}): Promise<SlotOpResult<{ alreadySkipped: boolean; updatedAt: string }>> {
  const slot = await loadOwnedSlot(input.slotId, input.accountId);
  if ("ok" in slot && slot.ok === false) return slot;
  const s = slot as SlotWithPlan;

  if (s.status === "skipped") {
    return { ok: true, alreadySkipped: true, updatedAt: s.updatedAt.toISOString() };
  }
  if (s.status === "done") {
    return { ok: false, code: "done_immutable", message: "İşlenmiş (done) slot atlanamaz." };
  }
  const concurrency = checkConcurrency(s, input.expectedUpdatedAt);
  if (concurrency) return concurrency;

  // Atomik: yalnız beklenen updatedAt + done değil iken skip (dossier KORUNUR).
  const claimed = await prisma.reelPlanSlot.updateMany({
    where: { id: s.id, updatedAt: s.updatedAt, status: { not: "done" } },
    data: { status: "skipped" },
  });
  if (claimed.count === 0) {
    return { ok: false, code: "stale", message: "Slot bu arada değişti — yenile." };
  }
  const reloaded = await prisma.reelPlanSlot.findUnique({ where: { id: s.id }, select: { updatedAt: true } });
  return { ok: true, alreadySkipped: false, updatedAt: (reloaded?.updatedAt ?? s.updatedAt).toISOString() };
}

// ── RESTORE ──────────────────────────────────────────────────────────────────
export async function restoreSlot(input: {
  accountId: string;
  slotId: string;
  expectedUpdatedAt: string;
}): Promise<SlotOpResult<{ status: string; updatedAt: string }>> {
  const slot = await loadOwnedSlot(input.slotId, input.accountId);
  if ("ok" in slot && slot.ok === false) return slot;
  const s = slot as SlotWithPlan;

  if (s.status !== "skipped") {
    return { ok: false, code: "not_skipped", message: "Yalnız atlanmış (skipped) slot geri alınabilir." };
  }
  const concurrency = checkConcurrency(s, input.expectedUpdatedAt);
  if (concurrency) return concurrency;

  // Dossier bağlıysa "drafted"e, değilse "planned"e döner.
  const nextStatus = s.dossierId ? "drafted" : "planned";
  const claimed = await prisma.reelPlanSlot.updateMany({
    where: { id: s.id, updatedAt: s.updatedAt, status: "skipped" },
    data: { status: nextStatus },
  });
  if (claimed.count === 0) {
    return { ok: false, code: "stale", message: "Slot bu arada değişti — yenile." };
  }
  const reloaded = await prisma.reelPlanSlot.findUnique({ where: { id: s.id }, select: { updatedAt: true } });
  return { ok: true, status: nextStatus, updatedAt: (reloaded?.updatedAt ?? s.updatedAt).toISOString() };
}
