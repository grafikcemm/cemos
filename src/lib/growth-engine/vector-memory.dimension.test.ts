import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchSimilarExamples } from "./vector-memory";
import { prisma } from "@/lib/db/client";
import { accountRepo } from "@/lib/db/accountRepo";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    trainingExample: { findMany: vi.fn() },
    viralPattern: { findMany: vi.fn(), update: vi.fn() },
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

/** Üretim kodundaki djb2 ile birebir — persist edilen hash'i doğrulamak için. */
function djb2(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Sprint 9 — kalıcı pattern embedding (embeddingJson + embeddingHash).
 */
describe("vector-memory — kalıcı pattern embedding (Sprint 9)", () => {
  const FAKE_DIM = 1536;
  const fakeVector = Array.from({ length: FAKE_DIM }, (_, i) => Math.sin(i + 1));

  const originalFetch = global.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;

  const basePattern = {
    id: "vp-persist-1",
    patternName: "Kanıt hook'u",
    exampleGood: "Rakamla açılış: 12 dakikada bitirdim.",
    hookType: "proof",
    updatedAt: new Date("2026-07-08T00:00:00Z"),
    embeddingJson: null as string | null,
    embeddingHash: null as string | null,
  };
  const patternText = `${basePattern.patternName}\n${basePattern.exampleGood}`;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: fakeVector }] }),
    }) as unknown as typeof fetch;
    vi.mocked(accountRepo.findByHandle).mockResolvedValue({ id: "acc-1", handle: "grafikcem" } as never);
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.viralPattern.update).mockResolvedValue({} as never);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.OPENROUTER_API_KEY = originalKey;
  });

  it("hash eşleşen kalıcı embedding YENİDEN embed edilmez ve update çağrılmaz", async () => {
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue([
      { ...basePattern, embeddingJson: JSON.stringify(fakeVector), embeddingHash: djb2(patternText) },
    ] as never);

    const results = await searchSimilarExamples({
      accountHandle: "grafikcem",
      text: "rakam hook fikri",
      label: "pattern",
    });

    expect(results[0].similarity).toBeGreaterThan(0.99); // aynı sahte vektör → cosine 1
    expect(prisma.viralPattern.update).not.toHaveBeenCalled();
    // Tek /embeddings çağrısı = sorgu; pattern kalıcıdan okundu.
    const embedCalls = vi.mocked(global.fetch).mock.calls.filter(([u]) => String(u).includes("/embeddings"));
    expect(embedCalls.length).toBe(1);
  });

  it("kalıcısı olmayan pattern gerçek embedding ile persist edilir (embeddingJson + doğru hash)", async () => {
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue([
      { ...basePattern, id: "vp-persist-2" },
    ] as never);

    await searchSimilarExamples({ accountHandle: "grafikcem", text: "sorgu", label: "pattern" });

    expect(prisma.viralPattern.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "vp-persist-2" },
        data: expect.objectContaining({ embeddingHash: djb2(patternText) }),
      })
    );
  });

  it("BOYUT KORUMASI: sorgu local-fallback'e düşünce 1536-dim kalıcı vektör KULLANILMAZ (sessiz 0 benzerlik yok)", async () => {
    // API çökük → sorgu 256-dim local-hash. Kalıcı 1536-dim vektör hash'i tutuyor
    // ama boyut uyuşmuyor → reuse reddedilir, pattern de local-hash'e düşer →
    // iki taraf tutarlı, benzerlik hesaplanabilir; local_fallback persist EDİLMEZ.
    global.fetch = vi.fn().mockRejectedValue(new Error("402 credit")) as unknown as typeof fetch;
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue([
      {
        ...basePattern,
        id: "vp-persist-3",
        patternName: "Kanıt hook'u rakam",
        embeddingJson: JSON.stringify(fakeVector),
        embeddingHash: djb2(`Kanıt hook'u rakam\n${basePattern.exampleGood}`),
      },
    ] as never);

    const results = await searchSimilarExamples({
      accountHandle: "grafikcem",
      text: "Kanıt hook rakam dakika",
      label: "pattern",
    });

    expect(results).toHaveLength(1);
    expect(results[0].similarity).toBeGreaterThan(0); // eski davranışta sessizce 0'dı
    expect(prisma.viralPattern.update).not.toHaveBeenCalled(); // fallback persist edilmez
  });
});
