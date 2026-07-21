import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * F3 degraded-tail accounting: a fal.ai call that actually REACHES the provider but
 * returns no usable URL (200-with-no-URL, malformed 200, abort-after-send) may still
 * have billed — it must be ledgered as costOutcome:"unknown", never silently $0. A
 * pre-flight miss (not configured) never billed → no row.
 *
 * `callFal` short-circuits under `process.env.VITEST`; this suite unsets it (restored
 * after each test) and mocks `fetch` so the real provider path runs deterministically.
 */
const queueFindById = vi.fn();
const queueUpdate = vi.fn(async (_id?: string, _d?: unknown) => ({}));
const accountFindById = vi.fn(async () => ({ id: "acc1", handle: "grafikcem" }));
const recordImage = vi.fn(async (_o?: unknown) => {});
const settleAiSpend = vi.fn(async (_r?: unknown, _c?: unknown) => {});
const releaseAiSpend = vi.fn(async (_r?: unknown) => {});

vi.mock("@/lib/db/queueRepo", () => ({
  queueRepo: {
    findById: (id: string) => queueFindById(id),
    update: (id: string, d: unknown) => queueUpdate(id, d),
  },
}));
vi.mock("@/lib/db/accountRepo", () => ({ accountRepo: { findById: () => accountFindById() } }));
vi.mock("@/lib/services/usageService", () => ({ usageService: { recordImage: (o: unknown) => recordImage(o) } }));
// fal budget flows through the atomic reservation (getFalBudgetStatus lives inside it
// now). Reservation succeeds so the degraded-tail accounting under it can be asserted.
vi.mock("@/lib/services/aiSpendReservationService", () => ({
  reserveFalSpend: async () => ({ id: "fal-res-1" }),
  settleAiSpend: (r: unknown, c: unknown) => settleAiSpend(r, c),
  releaseAiSpend: (r: unknown) => releaseAiSpend(r),
}));
vi.mock("@/lib/config/costLimits", () => ({
  getCostLimits: () => ({ falImageModel: "fal-ai/test", falImageCostUsd: 0.05 }),
}));

import { imageService } from "@/lib/services/imageService";

describe("imageService — F3 degraded-tail accounting", () => {
  const origKey = process.env.FAL_KEY;
  const origVitest = process.env.VITEST;
  const realFetch = global.fetch;

  beforeEach(() => {
    queueFindById.mockReset();
    queueUpdate.mockClear();
    recordImage.mockClear();
    settleAiSpend.mockClear();
    releaseAiSpend.mockClear();
    process.env.FAL_KEY = "test-key";
    delete process.env.VITEST; // let callFal reach the (mocked) provider path
  });
  afterEach(() => {
    if (origKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = origKey;
    if (origVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = origVitest;
    global.fetch = realFetch;
  });

  it("200-with-no-URL is ledgered as costOutcome:unknown, no image persisted", async () => {
    queueFindById.mockResolvedValue({ id: "q1", accountId: "acc1", content: "metin", generatedImageUrl: null });
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ images: [] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const res = await imageService.generateForQueueItem("q1");

    expect(res.generatedImageUrl).toBeNull();
    expect(res.costUsd).toBe(0); // no image produced → caller sees no charge
    expect(queueUpdate).not.toHaveBeenCalled();
    expect(recordImage).toHaveBeenCalledTimes(1); // but the billed-but-unusable call IS ledgered
    expect(recordImage).toHaveBeenCalledWith(
      expect.objectContaining({
        estimatedCostUsd: 0.05,
        meta: expect.objectContaining({ costOutcome: "unknown", usable: false }),
      }),
    );
    // The billed-but-unusable tail must SETTLE the reservation (count the spend),
    // never release it — releasing would free the cap for a spend that happened.
    expect(settleAiSpend).toHaveBeenCalledTimes(1);
    expect(releaseAiSpend).not.toHaveBeenCalled();
  });

  it("a real URL is ledgered as costOutcome:estimated and persisted", async () => {
    queueFindById.mockResolvedValue({ id: "q2", accountId: "acc1", content: "metin", generatedImageUrl: null });
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ images: [{ url: "https://img/y.png" }] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const res = await imageService.generateForQueueItem("q2");

    expect(res.generatedImageUrl).toBe("https://img/y.png");
    expect(res.costUsd).toBe(0.05);
    expect(queueUpdate).toHaveBeenCalledWith("q2", { generatedImageUrl: "https://img/y.png" });
    expect(recordImage).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ costOutcome: "estimated", usable: true }),
      }),
    );
  });

  it("non-2xx (billed uncertain, no body) is still ledgered as unknown (reached provider)", async () => {
    queueFindById.mockResolvedValue({ id: "q3", accountId: "acc1", content: "metin", generatedImageUrl: null });
    global.fetch = vi.fn(async () => new Response("err", { status: 500 })) as unknown as typeof fetch;

    const res = await imageService.generateForQueueItem("q3");

    expect(res.generatedImageUrl).toBeNull();
    expect(recordImage).toHaveBeenCalledWith(
      expect.objectContaining({ meta: expect.objectContaining({ costOutcome: "unknown" }) }),
    );
  });
});
