import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Slot operasyonları (ADR-039 §8) — mocked prisma:
 *  - move: done_immutable, invalid_day (Şubat 30), day_occupied, dossier korunur, stale, cross-account
 *  - skip: idempotent alreadySkipped, done_immutable, non-destructive
 *  - restore: not_skipped, dossier → drafted / boş → planned
 */

const txMock = {
  $queryRaw: vi.fn(() => Promise.resolve([])),
  reelPlanSlot: {
    findUnique: vi.fn(),
    findFirst: vi.fn(() => Promise.resolve(null)),
    update: vi.fn(),
  },
};

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
    reelPlanSlot: {
      findUnique: vi.fn(),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
  },
}));

import { prisma } from "@/lib/db/client";
import { moveSlot, skipSlot, restoreSlot } from "./planSlotService";

const ACC = "acc-1";
const UPDATED = new Date("2026-08-10T09:00:00.000Z");

function slot(overrides: Record<string, unknown> = {}) {
  return {
    id: "slot-1",
    dayOfMonth: 10,
    status: "planned",
    dossierId: null,
    updatedAt: UPDATED,
    planId: "plan-1",
    plan: { accountId: ACC, month: "2026-08" },
    ...overrides,
  };
}

const mockFind = vi.mocked(prisma.reelPlanSlot.findUnique);
const mockUpdateMany = vi.mocked(prisma.reelPlanSlot.updateMany);

beforeEach(() => {
  vi.clearAllMocks();
  txMock.$queryRaw.mockResolvedValue([]);
  txMock.reelPlanSlot.findFirst.mockResolvedValue(null);
});

const BASE = { accountId: ACC, slotId: "slot-1", expectedUpdatedAt: UPDATED.toISOString() };

describe("moveSlot", () => {
  it("cross-account fail-closed", async () => {
    mockFind.mockResolvedValue(slot({ plan: { accountId: "OTHER", month: "2026-08" } }) as never);
    const r = await moveSlot({ ...BASE, targetDay: 15 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("account_mismatch");
  });

  it("done slot taşınamaz", async () => {
    mockFind.mockResolvedValue(slot({ status: "done" }) as never);
    const r = await moveSlot({ ...BASE, targetDay: 15 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("done_immutable");
  });

  it("ayın gerçek günü dışı reddedilir (Şubat 30)", async () => {
    mockFind.mockResolvedValue(slot({ plan: { accountId: ACC, month: "2026-02" } }) as never);
    const r = await moveSlot({ ...BASE, targetDay: 30 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_day");
  });

  it("hedef gün dolu → day_occupied", async () => {
    mockFind.mockResolvedValue(slot() as never);
    txMock.reelPlanSlot.findUnique.mockResolvedValue({ updatedAt: UPDATED, status: "planned", dayOfMonth: 10 });
    txMock.reelPlanSlot.findFirst.mockResolvedValue({ id: "other" } as never);
    const r = await moveSlot({ ...BASE, targetDay: 15 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("day_occupied");
  });

  it("başarılı taşıma dossier'ı korur", async () => {
    mockFind.mockResolvedValue(slot({ dossierId: "d1" }) as never);
    txMock.reelPlanSlot.findUnique.mockResolvedValue({ updatedAt: UPDATED, status: "planned", dayOfMonth: 10 });
    txMock.reelPlanSlot.findFirst.mockResolvedValue(null);
    txMock.reelPlanSlot.update.mockResolvedValue({ dayOfMonth: 15, updatedAt: new Date("2026-08-10T10:00:00Z") });
    const r = await moveSlot({ ...BASE, targetDay: 15 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dayOfMonth).toBe(15);
    // update data dossierId'ye DOKUNMAZ (yalnız dayOfMonth).
    expect(txMock.reelPlanSlot.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { dayOfMonth: 15 } })
    );
  });

  it("aynı güne taşıma no-op (alreadyThere)", async () => {
    mockFind.mockResolvedValue(slot() as never);
    const r = await moveSlot({ ...BASE, targetDay: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.alreadyThere).toBe(true);
  });

  it("stale expectedUpdatedAt reddedilir", async () => {
    mockFind.mockResolvedValue(slot() as never);
    const r = await moveSlot({ ...BASE, targetDay: 15, expectedUpdatedAt: new Date("2020-01-01").toISOString() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("stale");
  });
});

describe("skipSlot", () => {
  it("zaten skipped → idempotent", async () => {
    mockFind.mockResolvedValue(slot({ status: "skipped" }) as never);
    const r = await skipSlot(BASE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.alreadySkipped).toBe(true);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("done atlanamaz", async () => {
    mockFind.mockResolvedValue(slot({ status: "done" }) as never);
    const r = await skipSlot(BASE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("done_immutable");
  });

  it("planned → skipped (non-destructive updateMany, done guard)", async () => {
    mockFind
      .mockResolvedValueOnce(slot() as never)
      .mockResolvedValueOnce({ updatedAt: new Date("2026-08-10T10:00:00Z") } as never);
    mockUpdateMany.mockResolvedValue({ count: 1 } as never);
    const r = await skipSlot(BASE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.alreadySkipped).toBe(false);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "skipped" }, where: expect.objectContaining({ status: { not: "done" } }) })
    );
  });
});

describe("restoreSlot", () => {
  it("skipped olmayan slot reddedilir", async () => {
    mockFind.mockResolvedValue(slot({ status: "planned" }) as never);
    const r = await restoreSlot(BASE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_skipped");
  });

  it("dossier'lı skipped → drafted; boş → planned", async () => {
    mockFind
      .mockResolvedValueOnce(slot({ status: "skipped", dossierId: "d1" }) as never)
      .mockResolvedValueOnce({ updatedAt: new Date("2026-08-10T10:00:00Z") } as never);
    mockUpdateMany.mockResolvedValue({ count: 1 } as never);
    const r1 = await restoreSlot(BASE);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.status).toBe("drafted");

    vi.clearAllMocks();
    mockFind
      .mockResolvedValueOnce(slot({ status: "skipped", dossierId: null }) as never)
      .mockResolvedValueOnce({ updatedAt: new Date("2026-08-10T10:00:00Z") } as never);
    mockUpdateMany.mockResolvedValue({ count: 1 } as never);
    const r2 = await restoreSlot(BASE);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.status).toBe("planned");
  });
});
