import { prisma } from "@/lib/db/client";
import { acquireXactAdvisoryLock } from "@/lib/db/advisoryLock";
import {
  getBudgetStatus,
  BudgetExceededError,
  BudgetSystemUnavailableError,
  type AiBudgetClass,
} from "@/lib/config/costGate";
import { redactError } from "@/lib/utils/redactSecrets";

/**
 * Atomic AI-spend reservation (closure C) — closes the budget TOCTOU.
 *
 * The gate reserves an estimated cost BEFORE the provider call, settles it to the
 * actual cost after (or releases it on failure). Two concurrent essential calls
 * can't both read the same pre-spend total and both overshoot the monthly cap.
 *
 * Design notes:
 *  - The FULL budget status (incl. the provider key-status network probe, which
 *    is cache-warm) is computed OUTSIDE the advisory lock, so a slow provider
 *    probe never stalls generation while the lock is held.
 *  - The critical section — advisory lock + BOTH sum reads (open reservations +
 *    this month's OpenRouter spend) + the insert — runs entirely on the SAME
 *    `tx` connection, so the lock holder never checks out a second pooled
 *    connection (no self-starvation under a concurrency burst ≥ pool size).
 *  - Fails CLOSED (Pre-Launch Certification): if the budget AUTHORITY cannot be
 *    verified (reservation table missing, DB unreachable, status read failed),
 *    the paid call is REFUSED with BudgetSystemUnavailableError — never an
 *    unverified spend. One cold-start retry precedes the fail-closed throw.
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

/** Cold-start / transient pool errors that warrant one retry before failing closed. */
function isTransientConnection(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  if (code === "P1001" || code === "P2024") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /P1001|P2024|Can't reach database|Timed out fetching a connection/i.test(msg);
}

/** Current-month OpenRouter spend filter — kept in sync with
 *  usageLogRepo.sumOpenRouterCostByMonth so the in-lock read matches the ledger. */
function openRouterMonthWhere(yearMonth: string) {
  return {
    date: { startsWith: yearMonth },
    OR: [{ provider: "openrouter" }, { type: "openrouter" }, { type: "generation" }],
  };
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
  //    cap on the non-concurrent path and gives us the numeric limits. If the
  //    budget authority itself can't be read, fail CLOSED — no unverified spend.
  let base;
  try {
    base = await getBudgetStatus({
      budgetClass: input.budgetClass,
      estimatedCostUsd: input.estimatedCostUsd,
      now: new Date(now),
    });
  } catch (err) {
    throw new BudgetSystemUnavailableError(
      `budget status read failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!base.allowed) {
    throw new BudgetExceededError(base.spentUsd, base.limitUsd, base.reason ?? "monthly_limit");
  }
  const hardLimit = Math.min(base.limitUsd, base.pacedLimitUsd ?? base.limitUsd);
  const yearMonth = new Date(now).toISOString().slice(0, 7);

  // 2) Atomic reservation under an advisory lock. The lock, BOTH sum reads and the
  //    insert all run on the SAME `tx` connection (no extra pool checkout), so
  //    concurrent essential calls serialize on the decision and can't both
  //    overshoot the cap. base.spentUsd (incl. provider usage) is the floor.
  const attempt = (): Promise<string> =>
    prisma.$transaction(async (tx) => {
      await acquireXactAdvisoryLock(tx, LOCK_KEY);
      const reservedAgg = await tx.aiSpendReservation.aggregate({
        _sum: { estimatedCostUsd: true },
        where: { status: "open", expiresAt: { gt: new Date(now) } },
      });
      const spendAgg = await tx.usageLog.aggregate({
        _sum: { estimatedCostUsd: true },
        where: openRouterMonthWhere(yearMonth),
      });
      const reserved = reservedAgg._sum.estimatedCostUsd ?? 0;
      const freshLocal = spendAgg._sum.estimatedCostUsd ?? 0;
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

  try {
    return { id: await attempt() };
  } catch (err) {
    if (err instanceof BudgetExceededError) throw err; // provable, atomic budget stop
    // FAIL CLOSED: the budget authority could not be verified (missing table,
    // unreachable DB, pool timeout). Refuse the paid call rather than spend
    // unverified. One cold-start retry for a transient connection error first.
    if (isTransientConnection(err)) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        return { id: await attempt() };
      } catch (err2) {
        if (err2 instanceof BudgetExceededError) throw err2;
        throw new BudgetSystemUnavailableError(
          `reservation transient failure: ${err2 instanceof Error ? err2.message : String(err2)}`,
        );
      }
    }
    throw new BudgetSystemUnavailableError(
      isMissingTable(err)
        ? "AiSpendReservation table missing (migration not applied)"
        : err instanceof Error
          ? err.message
          : String(err),
    );
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
    console.error("settleAiSpend hata:", redactError(err));
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
    console.error("releaseAiSpend hata:", redactError(err));
  }
}
