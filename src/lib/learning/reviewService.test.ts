import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma/client";

/**
 * 4C-H review idempotency + atomicity: aynı idempotencyKey ile çift-gönderim
 * schedule'ı İKİ KEZ ilerletmez (deduped). Eşzamanlı yarış (P2002) 500 değil,
 * mevcut durumu döndürür. Mastery attempt'lerden türer (idempotent).
 */

const scheduleFindUnique = vi.fn();
const scheduleCreate = vi.fn();
const scheduleUpdate = vi.fn();
const attemptFindUnique = vi.fn();
const attemptCreate = vi.fn();
const attemptFindMany = vi.fn();
const itemFindUnique = vi.fn();
const itemFindMany = vi.fn();
const conceptFindMany = vi.fn();
const conceptUpdate = vi.fn();
const packUpdate = vi.fn();

const tx = {
  learnReviewSchedule: {
    findUnique: (a: unknown) => scheduleFindUnique(a),
    create: (a: unknown) => scheduleCreate(a),
    update: (a: unknown) => scheduleUpdate(a),
  },
  learnReviewAttempt: {
    findUnique: (a: unknown) => attemptFindUnique(a),
    create: (a: unknown) => attemptCreate(a),
  },
};

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    learnItem: {
      findUnique: (a: unknown) => itemFindUnique(a),
      findMany: (a: unknown) => itemFindMany(a),
    },
    learnReviewSchedule: {
      findUnique: (a: unknown) => scheduleFindUnique(a),
      create: (a: unknown) => scheduleCreate(a),
      update: (a: unknown) => scheduleUpdate(a),
    },
    learnReviewAttempt: {
      findUnique: (a: unknown) => attemptFindUnique(a),
      create: (a: unknown) => attemptCreate(a),
      findMany: (a: unknown) => attemptFindMany(a),
    },
    learnConcept: {
      findMany: (a: unknown) => conceptFindMany(a),
      update: (a: unknown) => conceptUpdate(a),
    },
    learnPack: { update: (a: unknown) => packUpdate(a) },
  },
}));

import { reviewService } from "./reviewService";

const SCHED = { itemId: "it1", ladderStep: 0, intervalDays: 1, ease: 2.5, lapses: 0, dueAt: new Date("2026-07-01") };

beforeEach(() => {
  vi.clearAllMocks();
  itemFindUnique.mockResolvedValue({ id: "it1", conceptId: null, packId: "p1" });
  scheduleFindUnique.mockResolvedValue({ ...SCHED });
  scheduleCreate.mockResolvedValue({ ...SCHED });
  scheduleUpdate.mockResolvedValue({ ...SCHED });
  attemptCreate.mockResolvedValue({ id: "a1" });
  attemptFindMany.mockResolvedValue([]);
  conceptFindMany.mockResolvedValue([]);
  packUpdate.mockResolvedValue({});
});

describe("reviewService.grade idempotency (4C-H)", () => {
  it("ilk gönderim: attempt + schedule ilerler (deduped=false)", async () => {
    attemptFindUnique.mockResolvedValue(null);
    const r = await reviewService.grade({ itemId: "it1", grade: 2, responseMs: 100, idempotencyKey: "k1" });
    expect(r.deduped).toBe(false);
    expect(attemptCreate).toHaveBeenCalledTimes(1);
    expect(scheduleUpdate).toHaveBeenCalledTimes(1);
  });

  it("aynı key ikinci kez: schedule İLERLEMEZ (deduped=true, çift-atlama yok)", async () => {
    attemptFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "a1", idempotencyKey: "k1" });
    await reviewService.grade({ itemId: "it1", grade: 2, responseMs: 100, idempotencyKey: "k1" });
    const r2 = await reviewService.grade({ itemId: "it1", grade: 2, responseMs: 100, idempotencyKey: "k1" });
    expect(r2.deduped).toBe(true);
    expect(attemptCreate).toHaveBeenCalledTimes(1); // yalnız ilk gönderim insert etti
    expect(scheduleUpdate).toHaveBeenCalledTimes(1); // schedule bir kez ilerledi
  });

  it("eşzamanlı yarış: attempt create P2002 → 500 değil, deduped=true", async () => {
    attemptFindUnique.mockResolvedValue(null);
    attemptCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" })
    );
    const r = await reviewService.grade({ itemId: "it1", grade: 3, responseMs: 50, idempotencyKey: "race" });
    expect(r.deduped).toBe(true);
    expect(scheduleUpdate).not.toHaveBeenCalled(); // yarış kaybedeni schedule ilerletmez
  });

  it("bilinmeyen item → item_not_found", async () => {
    itemFindUnique.mockResolvedValue(null);
    await expect(
      reviewService.grade({ itemId: "yok", grade: 2, responseMs: 0 })
    ).rejects.toThrow("item_not_found");
  });
});
