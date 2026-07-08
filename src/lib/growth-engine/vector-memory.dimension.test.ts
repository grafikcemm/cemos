import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchSimilarExamples } from "./vector-memory";
import { prisma } from "@/lib/db/client";
import { accountRepo } from "@/lib/db/accountRepo";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    trainingExample: { findMany: vi.fn() },
    viralPattern: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/accountRepo", () => ({
  accountRepo: { findByHandle: vi.fn() },
}));

/**
 * FIRST-SPRINT item 14 regresyon testi — vector-memory:304 bug'ı.
 *
 * ESKİ davranış: ViralPattern'lar HER ZAMAN 256-dim local-hash ile
 * vektörlenirken sorgu gerçek 1536-dim embedding kullanıyordu → boyut
 * uyuşmazlığı → cosineSimilarity 0 → pattern hafızası RAG'e sessizce hiç
 * katkı vermiyordu.
 *
 * YENİ davranış: pattern metni de GERÇEK embedding ile vektörlenir
 * (local-hash yalnız createEmbedding içindeki hata fallback'i) → boyutlar
 * eşleşir, benzerlik > 0.
 */
describe("vector-memory — pattern retrieval gerçek embedding (item 14)", () => {
  const FAKE_DIM = 1536;
  // Deterministik sahte "gerçek" embedding: her çağrı aynı vektör → identical
  // vectors → cosine 1. Eski kodda pattern tarafı 256-dim local-hash olurdu → 0.
  const fakeVector = Array.from({ length: FAKE_DIM }, (_, i) => Math.sin(i + 1));

  const originalFetch = global.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: fakeVector }] }),
    }) as unknown as typeof fetch;

    vi.mocked(accountRepo.findByHandle).mockResolvedValue({
      id: "acc-1",
      handle: "grafikcem",
    } as never);
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue([
      {
        id: "vp-1",
        patternName: "Karşıtlık hook'u",
        exampleGood: "Diğerleri X yaparken ben Y yapıyorum.",
        hookType: "contrast",
        updatedAt: new Date("2026-07-01T00:00:00Z"),
      },
    ] as never);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.OPENROUTER_API_KEY = originalKey;
  });

  it("gerçek embedding varken pattern benzerliği > 0 (boyut uyuşmazlığı YOK)", async () => {
    const results = await searchSimilarExamples({
      accountHandle: "grafikcem",
      text: "AI araç testi hook fikri",
      label: "pattern",
    });

    expect(results).toHaveLength(1);
    expect(results[0].sourceType).toBe("viral_pattern");
    // Identical fake vectors → cosine 1. Eski local-hash yolunda bu 0'dı.
    expect(results[0].similarity).toBeGreaterThan(0.99);
  });

  it("pattern retrieval sorgu-anı embedding'i GERÇEK provider'dan alır (fetch çağrılır)", async () => {
    await searchSimilarExamples({
      accountHandle: "grafikcem",
      text: "sorgu metni",
      label: "pattern",
    });
    // Sorgu her aramada embed edilir; pattern embedding'i process-içi cache'ten
    // gelebilir (önceki test doldurdu) — kritik olan gerçek /embeddings yolunun
    // kullanılması, local-hash'in kullanılMAMASI.
    const embedCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter(([url]) => String(url).includes("/embeddings"));
    expect(embedCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("API tamamen çökükse local-hash fallback iki tarafta da çalışır (davranış korunur)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const results = await searchSimilarExamples({
      accountHandle: "grafikcem",
      text: "Karşıtlık hook Diğerleri yaparken",
      label: "pattern",
    });

    // Her iki taraf da 256-dim local-hash'e düşer → boyutlar eşleşir,
    // benzerlik hesaplanabilir (0 olmak zorunda değil).
    expect(results).toHaveLength(1);
    expect(results[0].similarity).toBeGreaterThanOrEqual(0);
  });
});
