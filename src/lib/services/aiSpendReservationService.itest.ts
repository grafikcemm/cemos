/**
 * REAL-Postgres integration test for the AI-spend reservation (closure C).
 *
 * This is the test the mocked unit suite CANNOT be: it runs two concurrent
 * `reserveAiSpend` calls against a real Postgres and proves that
 * `pg_advisory_xact_lock` + the open-reservation SUM *inside the same lock*
 * actually serialize the budget decision. With a mocked `$transaction` (which
 * just runs the callback inline, no real lock) both callers read `reserved = 0`
 * and both overshoot — exactly the TOCTOU this mechanism exists to close.
 *
 * Gated: skipped unless DB_INTEGRATION=1; refuses a non-ephemeral DATABASE_URL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { shouldRunDbIntegration, truncate, prisma } from "@/test/integration/guard";

// Mock ONLY the network/ledger reads. Prisma + the advisory lock + the insert/sum
// are the REAL thing under test. BudgetExceededError stays real (partial mock).
vi.mock("@/lib/config/costGate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/costGate")>(
    "@/lib/config/costGate",
  );
  return { ...actual, getBudgetStatus: vi.fn(), getFalBudgetStatus: vi.fn() };
});
vi.mock("@/lib/services/usageService", () => ({
  usageService: {
    getMonthlyOpenRouterCost: vi.fn(async () => 0),
    getMonthlyFalCost: vi.fn(async () => 0),
  },
}));

import {
  reserveAiSpend,
  reserveFalSpend,
  settleAiSpend,
  getOpenReservationUsd,
} from "./aiSpendReservationService";
import { getBudgetStatus, getFalBudgetStatus, BudgetExceededError } from "@/lib/config/costGate";
import { usageService } from "@/lib/services/usageService";

const RUN = shouldRunDbIntegration();

/** Base budget: monthly + paced limit both `limit`, zero prior spend. */
function budget(limit: number) {
  vi.mocked(getBudgetStatus).mockResolvedValue({
    allowed: true,
    spentUsd: 0,
    limitUsd: limit,
    remainingUsd: limit,
    pacedLimitUsd: limit,
  } as never);
  vi.mocked(usageService.getMonthlyOpenRouterCost).mockResolvedValue(0);
}

/** Separate fal image budget: zero prior spend, cap `limit`. */
function falBudget(limit: number) {
  vi.mocked(getFalBudgetStatus).mockResolvedValue({
    allowed: true,
    spentUsd: 0,
    limitUsd: limit,
    remainingUsd: limit,
  } as never);
  vi.mocked(usageService.getMonthlyFalCost).mockResolvedValue(0);
}

describe.skipIf(!RUN)("reserveAiSpend — real Postgres advisory-lock serialization", () => {
  beforeEach(async () => {
    // Both tables the in-lock critical section reads (open reservations + month
    // OpenRouter spend) must start empty so `budget()` fully controls the ceiling.
    await truncate(["AiSpendReservation", "UsageLog"]);
    vi.clearAllMocks();
  });

  it("two concurrent reservers that TOGETHER overshoot the cap: exactly one wins", async () => {
    // limit 10, each estimate 6 → only one can fit. Correct serialization means
    // the loser sees the winner's open reservation under the lock and is denied.
    budget(10);

    const results = await Promise.allSettled([
      reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 6, purpose: "itest_a" }),
      reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 6, purpose: "itest_b" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BudgetExceededError);

    // The DB is the ground truth: exactly ONE open reservation row exists.
    const rows = await prisma.aiSpendReservation.count({ where: { status: "open" } });
    expect(rows).toBe(1);
    expect(await getOpenReservationUsd()).toBe(6);
  });

  it("both fit → both reserve; a third that overshoots is denied", async () => {
    budget(20);
    const [a, b] = await Promise.all([
      reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 6, purpose: "itest_a" }),
      reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 6, purpose: "itest_b" }),
    ]);
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(await getOpenReservationUsd()).toBe(12);

    // 0 actual + 12 reserved + 9 est = 21 > 20 → denied.
    await expect(
      reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 9, purpose: "itest_c" }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("settling a reservation frees its budget for the next caller", async () => {
    budget(10);
    const first = await reserveAiSpend({
      budgetClass: "essential",
      estimatedCostUsd: 6,
      purpose: "itest_a",
    });
    expect(first.id).toBeTruthy();

    // Before settle: 0 + 6 + 6 = 12 > 10 → denied.
    await expect(
      reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 6, purpose: "itest_b" }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    // Settle to the real (small) cost → open sum drops → next caller fits.
    await settleAiSpend(first, 0.5);
    expect(await getOpenReservationUsd()).toBe(0);
    const second = await reserveAiSpend({
      budgetClass: "essential",
      estimatedCostUsd: 6,
      purpose: "itest_b",
    });
    expect(second.id).toBeTruthy();
  });

  it("expired open reservations do not count toward the cap", async () => {
    budget(10);
    const t0 = 1_000_000_000_000;
    // Reserve 6 that expires 6 minutes later (TTL is 5m).
    await reserveAiSpend({
      budgetClass: "essential",
      estimatedCostUsd: 6,
      purpose: "itest_stale",
      now: t0,
    });
    // At t0 the open sum counts it…
    expect(await getOpenReservationUsd(t0)).toBe(6);
    // …but 6 minutes later it has expired and no longer blocks a new caller.
    const later = t0 + 6 * 60 * 1000;
    expect(await getOpenReservationUsd(later)).toBe(0);
    const next = await reserveAiSpend({
      budgetClass: "essential",
      estimatedCostUsd: 6,
      purpose: "itest_fresh",
      now: later,
    });
    expect(next.id).toBeTruthy();
  });
});

describe.skipIf(!RUN)("reserveFalSpend — real Postgres fal-lock serialization + budget isolation", () => {
  beforeEach(async () => {
    await truncate(["AiSpendReservation", "UsageLog"]);
    vi.clearAllMocks();
  });

  it("two concurrent fal reservers that TOGETHER overshoot the fal cap: exactly one wins", async () => {
    // fal cap 10, each estimate 6 → only one fits. The loser must see the winner's
    // open fal reservation UNDER the fal advisory lock and be denied (TOCTOU closed).
    falBudget(10);
    const results = await Promise.allSettled([
      reserveFalSpend({ estimatedCostUsd: 6, purpose: "itest_fal_a" }),
      reserveFalSpend({ estimatedCostUsd: 6, purpose: "itest_fal_b" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BudgetExceededError);
    // Ground truth: exactly one OPEN fal_image reservation row.
    expect(
      await prisma.aiSpendReservation.count({ where: { status: "open", budgetClass: "fal_image" } }),
    ).toBe(1);
  });

  it("fal and LLM budgets are ISOLATED: neither open reservation consumes the other's cap", async () => {
    budget(10); // LLM cap 10
    falBudget(10); // separate fal cap 10
    // Nearly fill the LLM cap with an open essential reservation…
    const llm = await reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 9, purpose: "itest_llm" });
    expect(llm.id).toBeTruthy();
    // …the fal reservation still fits its OWN untouched cap (LLM row is scoped out).
    const fal = await reserveFalSpend({ estimatedCostUsd: 9, purpose: "itest_fal" });
    expect(fal.id).toBeTruthy();
    // A second LLM reserve is denied by the essential row alone (9+9>10) — the open
    // fal_image row neither leaked into the LLM cap nor rescued it.
    await expect(
      reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 9, purpose: "itest_llm2" }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
    // …and a second fal reserve is denied by the fal row alone (9+9>10).
    await expect(
      reserveFalSpend({ estimatedCostUsd: 9, purpose: "itest_fal2" }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });
});
