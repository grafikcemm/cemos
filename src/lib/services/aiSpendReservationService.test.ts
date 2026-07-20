import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => {
  const aiSpendReservation = {
    aggregate: vi.fn(async () => ({ _sum: { estimatedCostUsd: 0 } })),
    create: vi.fn(async () => ({ id: "resv-1" })),
    update: vi.fn(async () => ({})),
  };
  // The in-lock month-spend read now runs on the tx connection via prisma.usageLog.
  const usageLog = {
    aggregate: vi.fn(async () => ({ _sum: { estimatedCostUsd: 0 } })),
  };
  const prisma = {
    aiSpendReservation,
    usageLog,
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn(async (cb: (tx: typeof prisma) => unknown) => cb(prisma)),
  };
  return { prisma };
});
vi.mock("@/lib/config/costGate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/costGate")>("@/lib/config/costGate");
  return { ...actual, getBudgetStatus: vi.fn() };
});

import {
  reserveAiSpend,
  settleAiSpend,
  releaseAiSpend,
  getOpenReservationUsd,
} from "./aiSpendReservationService";
import { prisma } from "@/lib/db/client";
import {
  getBudgetStatus,
  BudgetExceededError,
  BudgetSystemUnavailableError,
} from "@/lib/config/costGate";

const okStatus = (over: Record<string, unknown> = {}) =>
  ({ allowed: true, spentUsd: 5, limitUsd: 100, pacedLimitUsd: 100, ...over }) as never;

/** Set the in-lock reads: open-reservation sum + month OpenRouter spend. */
function seedReads(reservedUsd: number, monthSpendUsd = 0) {
  vi.mocked(prisma.aiSpendReservation.aggregate).mockResolvedValueOnce({
    _sum: { estimatedCostUsd: reservedUsd },
  } as never);
  vi.mocked(prisma.usageLog.aggregate).mockResolvedValueOnce({
    _sum: { estimatedCostUsd: monthSpendUsd },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reserveAiSpend (closure C)", () => {
  it("reserves atomically (advisory lock + insert) when within budget", async () => {
    vi.mocked(getBudgetStatus).mockResolvedValueOnce(okStatus({ spentUsd: 5 }));
    seedReads(10, 5);

    const r = await reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 1, purpose: "test" });

    expect(r.id).toBe("resv-1");
    expect(prisma.$queryRaw).toHaveBeenCalled(); // advisory lock taken
    expect(prisma.aiSpendReservation.create).toHaveBeenCalledTimes(1);
  });

  it("denies (BudgetExceeded) when the base cap is already exceeded — no reservation", async () => {
    vi.mocked(getBudgetStatus).mockResolvedValueOnce(okStatus({ allowed: false, spentUsd: 100, reason: "monthly_limit" }));

    await expect(
      reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 1, purpose: "test" }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
    expect(prisma.aiSpendReservation.create).not.toHaveBeenCalled();
  });

  it("denies when concurrent open reservations would overshoot the cap (the TOCTOU it closes)", async () => {
    // Base allows (actual spend alone fits), but actual + in-flight reservations
    // + this estimate exceeds the hard limit → the atomic check must deny.
    vi.mocked(getBudgetStatus).mockResolvedValueOnce(okStatus({ spentUsd: 90, pacedLimitUsd: 100 }));
    seedReads(8, 90);

    // 90 actual + 8 reserved + 5 estimate = 103 > 100
    await expect(
      reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 5, purpose: "test" }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
    expect(prisma.aiSpendReservation.create).not.toHaveBeenCalled();
  });

  it("fails CLOSED (BudgetSystemUnavailable) when the reservation table is missing", async () => {
    // Post-migration this is a real misconfiguration — refuse the paid call
    // rather than the old fail-open "proceed without a reservation".
    vi.mocked(getBudgetStatus).mockResolvedValueOnce(okStatus());
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(
      Object.assign(new Error('relation "AiSpendReservation" does not exist'), { code: "P2021" }),
    );

    await expect(
      reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 1, purpose: "test" }),
    ).rejects.toBeInstanceOf(BudgetSystemUnavailableError);
  });

  it("fails CLOSED when the budget-status read itself throws", async () => {
    vi.mocked(getBudgetStatus).mockRejectedValueOnce(new Error("db unreachable"));
    await expect(
      reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 1, purpose: "test" }),
    ).rejects.toBeInstanceOf(BudgetSystemUnavailableError);
  });

  it("retries once on a transient connection error, then succeeds", async () => {
    vi.mocked(getBudgetStatus).mockResolvedValueOnce(okStatus());
    // First $transaction attempt hits a cold-start P1001; the retry uses the
    // default mock impl (runs the callback) → success.
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(
      Object.assign(new Error("Can't reach database server"), { code: "P1001" }),
    );
    const r = await reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 1, purpose: "test" });
    expect(r.id).toBe("resv-1");
  });

  it("fails CLOSED after the retry when a transient error persists", async () => {
    vi.mocked(getBudgetStatus).mockResolvedValueOnce(okStatus());
    const timeout = Object.assign(new Error("Timed out fetching a connection"), { code: "P2024" });
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(timeout).mockRejectedValueOnce(timeout);
    await expect(
      reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 1, purpose: "test" }),
    ).rejects.toBeInstanceOf(BudgetSystemUnavailableError);
  });

  it("uses paced limit as the hard ceiling", async () => {
    // monthly limit 100 but paced (mid-month) 40; 30 actual + 0 reserved + 15 est = 45 > 40 → deny
    vi.mocked(getBudgetStatus).mockResolvedValueOnce(okStatus({ spentUsd: 30, limitUsd: 100, pacedLimitUsd: 40 }));
    seedReads(0, 30);

    await expect(
      reserveAiSpend({ budgetClass: "essential", estimatedCostUsd: 15, purpose: "test" }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });
});

describe("getOpenReservationUsd", () => {
  it("sums open unexpired reservations, fails open (0) on error", async () => {
    vi.mocked(prisma.aiSpendReservation.aggregate).mockResolvedValueOnce({ _sum: { estimatedCostUsd: 12 } } as never);
    expect(await getOpenReservationUsd()).toBe(12);
    vi.mocked(prisma.aiSpendReservation.aggregate).mockRejectedValueOnce(new Error("db down"));
    expect(await getOpenReservationUsd()).toBe(0);
  });
});

describe("settle / release", () => {
  it("settleAiSpend marks the row settled with the actual cost", async () => {
    await settleAiSpend({ id: "resv-1" }, 0.02);
    expect(prisma.aiSpendReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "resv-1" },
        data: expect.objectContaining({ status: "settled", actualCostUsd: 0.02 }),
      }),
    );
  });

  it("releaseAiSpend marks the row released", async () => {
    await releaseAiSpend({ id: "resv-1" });
    expect(prisma.aiSpendReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "released" }) }),
    );
  });

  it("settle / release are no-ops for a null reservation (defensive null guard)", async () => {
    await settleAiSpend({ id: null }, 0.02);
    await releaseAiSpend({ id: null });
    expect(prisma.aiSpendReservation.update).not.toHaveBeenCalled();
  });
});
