import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * F4 degraded-tail accounting: the paid OpenRouter embeddings endpoint bills on any
 * 200, so createEmbedding must ledger EVERY 200 (usable → estimated, empty/invalid →
 * unknown) instead of recording silently $0 only on success. A non-200 throws before
 * the body is read → not billed → no row.
 */
const recordOpenRouter = vi.fn(async (_o?: unknown) => {});
vi.mock("@/lib/services/usageService", () => ({
  usageService: { recordOpenRouter: (o: unknown) => recordOpenRouter(o) },
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    trainingExample: { findMany: vi.fn(), update: vi.fn() },
    viralPattern: { findMany: vi.fn() },
    account: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/db/trainingExampleRepo", () => ({
  trainingExampleRepo: { findById: vi.fn(), updateEmbedding: vi.fn() },
}));
vi.mock("@/lib/db/accountRepo", () => ({ accountRepo: { findByHandle: vi.fn() } }));

import { createEmbedding } from "./vector-memory";

describe("createEmbedding — F4 degraded-tail accounting", () => {
  const origKey = process.env.OPENROUTER_API_KEY;
  const realFetch = global.fetch;

  beforeEach(() => {
    recordOpenRouter.mockClear();
    process.env.OPENROUTER_API_KEY = "test-key";
  });
  afterEach(() => {
    if (origKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = origKey;
    global.fetch = realFetch;
  });

  it("200 with an empty embedding array → ledgered as unknown (was silently $0), still falls back locally", async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const emb = await createEmbedding("Test metni");

    expect(emb.provider).toBe("local_fallback");
    expect(recordOpenRouter).toHaveBeenCalledTimes(1);
    expect(recordOpenRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ purpose: "embedding", costOutcome: "unknown", usable: false }),
      }),
    );
  });

  it("200 with a usable vector → ledgered as estimated and returned", async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const emb = await createEmbedding("Test metni");

    expect(emb.provider).toBe("openrouter");
    expect(emb.values).toEqual([0.1, 0.2, 0.3]);
    expect(recordOpenRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ costOutcome: "estimated", usable: true }),
      }),
    );
  });

  it("non-200 → NOT recorded (not billed), falls back locally", async () => {
    global.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;

    const emb = await createEmbedding("Test metni");

    expect(emb.provider).toBe("local_fallback");
    expect(recordOpenRouter).not.toHaveBeenCalled();
  });
});
