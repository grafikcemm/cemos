import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const queueFindById = vi.fn();
const queueUpdate = vi.fn(async (_id: string, data: unknown) => data);
const accountFindById = vi.fn(async () => ({ id: "acc1", handle: "maskulenkod" }));
const recordImage = vi.fn(async (_o?: unknown) => {});
const reserveFalSpend = vi.fn(async (_i?: unknown) => ({ id: "fal-res-1" }));
const settleAiSpend = vi.fn(async (_r?: unknown, _c?: unknown) => {});
const releaseAiSpend = vi.fn(async (_r?: unknown) => {});

vi.mock("@/lib/db/queueRepo", () => ({
  queueRepo: { findById: (id: string) => queueFindById(id), update: (id: string, d: unknown) => queueUpdate(id, d) },
}));
vi.mock("@/lib/db/accountRepo", () => ({ accountRepo: { findById: () => accountFindById() } }));
vi.mock("@/lib/services/usageService", () => ({ usageService: { recordImage: (o: unknown) => recordImage(o) } }));
// The fal budget gate now flows through the atomic reservation (closes the TOCTOU).
vi.mock("@/lib/services/aiSpendReservationService", () => ({
  reserveFalSpend: (i: unknown) => reserveFalSpend(i),
  settleAiSpend: (r: unknown, c: unknown) => settleAiSpend(r, c),
  releaseAiSpend: (r: unknown) => releaseAiSpend(r),
}));

import { imageService } from "@/lib/services/imageService";
import { BudgetExceededError } from "@/lib/config/costGate";

describe("imageService credit discipline", () => {
  const origKey = process.env.FAL_KEY;

  beforeEach(() => {
    queueFindById.mockReset();
    queueUpdate.mockClear();
    recordImage.mockClear();
    reserveFalSpend.mockClear();
    reserveFalSpend.mockResolvedValue({ id: "fal-res-1" });
    settleAiSpend.mockClear();
    releaseAiSpend.mockClear();
  });

  afterEach(() => {
    if (origKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = origKey;
  });

  it("reuses an existing image without spending (dedupe)", async () => {
    process.env.FAL_KEY = "test-key";
    queueFindById.mockResolvedValue({ id: "q1", accountId: "acc1", content: "metin", generatedImageUrl: "https://img/x.png" });
    const res = await imageService.generateForQueueItem("q1");
    expect(res.reused).toBe(true);
    expect(res.generatedImageUrl).toBe("https://img/x.png");
    expect(res.costUsd).toBe(0);
    expect(recordImage).not.toHaveBeenCalled();
    expect(reserveFalSpend).not.toHaveBeenCalled();
  });

  it("returns not_configured when FAL_KEY is absent (no spend)", async () => {
    delete process.env.FAL_KEY;
    queueFindById.mockResolvedValue({ id: "q2", accountId: "acc1", content: "metin", generatedImageUrl: null });
    const res = await imageService.generateForQueueItem("q2");
    expect(res.blocked).toBe("not_configured");
    expect(res.generatedImageUrl).toBeNull();
    expect(recordImage).not.toHaveBeenCalled();
  });

  it("hard-stops when the fal reservation is over budget (no spend, no ledger)", async () => {
    process.env.FAL_KEY = "test-key";
    reserveFalSpend.mockRejectedValueOnce(new BudgetExceededError(10, 10, "monthly_limit"));
    queueFindById.mockResolvedValue({ id: "q3", accountId: "acc1", content: "metin", generatedImageUrl: null });
    const res = await imageService.generateForQueueItem("q3");
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe("budget");
    expect(recordImage).not.toHaveBeenCalled();
    expect(queueUpdate).not.toHaveBeenCalled();
    expect(settleAiSpend).not.toHaveBeenCalled();
  });

  it("RELEASES the reservation (not settle) when callFal does not reach the provider", async () => {
    // In the vitest runtime callFal short-circuits to reached:false (never spends real
    // fal credits). The reservation must then be RELEASED — otherwise it would hold the
    // fal cap until the 5-min TTL. Positive guard on the else-release branch so a future
    // edit that drops it can't pass silently.
    process.env.FAL_KEY = "test-key";
    queueFindById.mockResolvedValue({ id: "q4", accountId: "acc1", content: "metin", generatedImageUrl: null });
    const res = await imageService.generateForQueueItem("q4");
    expect(res.ok).toBe(true);
    expect(res.generatedImageUrl).toBeNull();
    expect(reserveFalSpend).toHaveBeenCalledTimes(1);
    expect(releaseAiSpend).toHaveBeenCalledTimes(1);
    expect(settleAiSpend).not.toHaveBeenCalled();
    expect(recordImage).not.toHaveBeenCalled(); // no billable spend → no ledger row
  });

  it("throws when the queue item is missing", async () => {
    queueFindById.mockResolvedValue(null);
    await expect(imageService.generateForQueueItem("nope")).rejects.toThrow("queue_item_not_found");
  });
});
