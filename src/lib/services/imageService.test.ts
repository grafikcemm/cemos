import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const queueFindById = vi.fn();
const queueUpdate = vi.fn(async (_id: string, data: unknown) => data);
const accountFindById = vi.fn(async () => ({ id: "acc1", handle: "maskulenkod" }));
const recordImage = vi.fn(async (_o?: unknown) => {});
const falBudgetStatus = vi.fn(async () => ({ allowed: true, spentUsd: 0, limitUsd: 10, remainingUsd: 10 }));

vi.mock("@/lib/db/queueRepo", () => ({
  queueRepo: { findById: (id: string) => queueFindById(id), update: (id: string, d: unknown) => queueUpdate(id, d) },
}));
vi.mock("@/lib/db/accountRepo", () => ({ accountRepo: { findById: () => accountFindById() } }));
vi.mock("@/lib/services/usageService", () => ({ usageService: { recordImage: (o: unknown) => recordImage(o) } }));
vi.mock("@/lib/config/costGate", () => ({ getFalBudgetStatus: () => falBudgetStatus() }));

import { imageService } from "@/lib/services/imageService";

describe("imageService credit discipline", () => {
  const origKey = process.env.FAL_KEY;

  beforeEach(() => {
    queueFindById.mockReset();
    queueUpdate.mockClear();
    recordImage.mockClear();
    falBudgetStatus.mockClear();
    falBudgetStatus.mockResolvedValue({ allowed: true, spentUsd: 0, limitUsd: 10, remainingUsd: 10 });
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
    expect(falBudgetStatus).not.toHaveBeenCalled();
  });

  it("returns not_configured when FAL_KEY is absent (no spend)", async () => {
    delete process.env.FAL_KEY;
    queueFindById.mockResolvedValue({ id: "q2", accountId: "acc1", content: "metin", generatedImageUrl: null });
    const res = await imageService.generateForQueueItem("q2");
    expect(res.blocked).toBe("not_configured");
    expect(res.generatedImageUrl).toBeNull();
    expect(recordImage).not.toHaveBeenCalled();
  });

  it("hard-stops on the fal budget without spending", async () => {
    process.env.FAL_KEY = "test-key";
    falBudgetStatus.mockResolvedValue({ allowed: false, spentUsd: 10, limitUsd: 10, remainingUsd: 0 });
    queueFindById.mockResolvedValue({ id: "q3", accountId: "acc1", content: "metin", generatedImageUrl: null });
    const res = await imageService.generateForQueueItem("q3");
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe("budget");
    expect(recordImage).not.toHaveBeenCalled();
    expect(queueUpdate).not.toHaveBeenCalled();
  });

  it("throws when the queue item is missing", async () => {
    queueFindById.mockResolvedValue(null);
    await expect(imageService.generateForQueueItem("nope")).rejects.toThrow("queue_item_not_found");
  });
});
