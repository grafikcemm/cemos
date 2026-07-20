import { prisma } from "@/lib/db/client";
import {
  getBudgetStatus,
  BudgetExceededError,
  type AiBudgetClass,
} from "@/lib/config/costGate";
import { usageService } from "@/lib/services/usageService";

/**
 * Atomic AI-spend reservation (closure C) — closes the budget TOCTOU.
 *
 * The gate reserves an estimated cost BEFORE the provider call, settles it to the
 * actual cost after (or releases it on failure). `getBudgetStatus` counts open,
 * unexpired reservations, so two concurrent essential calls can't both read the
 * same pre-spend total and both overshoot the monthly cap.
 *
 * Design notes:
 *  - The FULL budget status (incl. the provider key-status network probe, which
 *    is cache-warm) is computed OUTSIDE the advisory lock. The lock region is
 *    DB-ONLY (fresh UsageLog sum + open-reservation sum + insert), so a slow
 *    provider probe can never stall generation while the lock is held.
 *  - Fails OPEN: the base cap check runs before the lock, so a missing table
 *    (pre-migration) or any transient reservation fault leaves the legacy
 *    (non-atomic but still cap-enforcing) behavior intact — generation is never
 *    blocked by a reservation bug.
 */

/** A single LLM call never exceeds this; an abandoned (crashed) reservation
 *  stops counting against budget after it expires. */
const RESERVATION_TTL_MS = 5 * 60 * 1000;
const LOCK_KEY = "ai_spend_reservation";

export type ReserveInput = {
  budgetClass: AiBudgetClass;
  estimatedCostUsd: number;
  purpose: string;
  model?: string;
  now?: number;
};

/** `id === null` → no live reservation row (pre-migration / transient fault); the
 *  base cap check already ran, so there is nothing to settle or release. */
export type Reservation = { id: string | null };

function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  if (code === "P2021") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /P2021|does not exist/i.test(msg);
}

/** Sum of open, unexpired reservations (USD). Fails open (0) on any error. */
export async function getOpenReservationUsd(now: number = Date.now()): Promise<number> {
  try {
    const agg = await prisma.aiSpendReservation.aggregate({
      _sum: { estimatedCostUsd: true },
      where: { status: "open", expiresAt: { gt: new Date(now) } },
    });
    return agg._sum.estimatedCostUsd ?? 0;
  } catch {
    return 0;
  }
}

export async function reserveAiSpend(input: ReserveInput): Promise<Reservation> {
  const now = input.now ?? Date.now();

  // 1) Base cap check OUTSIDE the lock (this is where the provider key-status
  //    probe lives). Enforces the actual-spend / pacing / class / provider-key
  //    cap on the non-concurrent path and gives us the numeric limits.
  const base = await getBudgetStatus({
    budgetClass: input.budgetClass,
    estimatedCostUsd: input.estimatedCostUsd,
    now: new Date(now),
  });
  if (!base.allowed) {
    throw new BudgetExceededError(base.spentUsd, base.limitUsd, base.reason ?? "monthly_limit");
  }
  const hardLimit = Math.min(base.limitUsd, base.pacedLimitUsd ?? base.limitUsd);

  // 2) Atomic reservation under an advisory lock — DB-ONLY, so concurrent essential
  //    calls serialize on the decision and can't both overshoot the monthly/paced
  //    cap. hardLimit and base.spentUsd (incl. provider usage) come from step 1.
  try {
    const id = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${LOCK_KEY}))`;
      const [freshLocal, reserved] = await Promise.all([
        usageService.getMonthlyOpenRouterCost(),
        getOpenReservationUsd(now),
      ]);
      const actualSpent = Math.max(freshLocal, base.spentUsd);
      if (actualSpent + reserved + input.estimatedCostUsd > hardLimit) {
        throw new BudgetExceededError(actualSpent + reserved, hardLimit, "monthly_limit");
      }
      const row = await tx.aiSpendReservation.create({
        data: {
          budgetClass: input.budgetClass,
          purpose: input.purpose,
          model: input.model ?? null,
          estimatedCostUsd: input.estimatedCostUsd,
          status: "open",
          expiresAt: new Date(now + RESERVATION_TTL_MS),
        },
      });
      return row.id;
    });
    return { id };
  } catch (err) {
    if (err instanceof BudgetExceededError) throw err; // provable, atomic budget stop
    // Table missing (pre-migration) or a transient fault: the base cap check
    // above already passed, so proceed WITHOUT blocking generation.
    if (!isMissingTable(err)) {
      console.error("reserveAiSpend hata (base kapı geçti, rezervasyonsuz devam):", err instanceof Error ? err.message : err);
    }
    return { id: null };
  }
}

/** Settle a reservation to its actual cost after the call succeeds. Best-effort. */
export async function settleAiSpend(
  reservation: Reservation,
  actualCostUsd: number,
  now: number = Date.now(),
): Promise<void> {
  if (!reservation.id) return;
  try {
    await prisma.aiSpendReservation.update({
      where: { id: reservation.id },
      data: { status: "settled", actualCostUsd, settledAt: new Date(now) },
    });
  } catch (err) {
    console.error("settleAiSpend hata:", err instanceof Error ? err.message : err);
  }
}

/** Release a reservation (call failed / no billable spend). Best-effort. */
export async function releaseAiSpend(reservation: Reservation, now: number = Date.now()): Promise<void> {
  if (!reservation.id) return;
  try {
    await prisma.aiSpendReservation.update({
      where: { id: reservation.id },
      data: { status: "released", settledAt: new Date(now) },
    });
  } catch (err) {
    console.error("releaseAiSpend hata:", err instanceof Error ? err.message : err);
  }
}
