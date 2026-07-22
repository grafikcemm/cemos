import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ADR-030 — influence provenance: üretime GERÇEKTEN giren aktif MemoryFact
 * id'leri typed context'te akar; proposal/superseded id İMKÂNSIZ (retrieval
 * yalnız getActiveFacts okur); fail-soft yolda sahte influence oluşmaz.
 */

const getActiveFactsMock = vi.fn();
vi.mock("./memoryFactService", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./memoryFactService")>();
  return { ...orig, getActiveFacts: (...a: unknown[]) => getActiveFactsMock(...a) };
});

vi.mock("./constitutions", () => ({
  getVoiceConstitution: () => "Ses anayasası satırı",
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    captionDna: { findUnique: vi.fn().mockResolvedValue(null) },
    hashtagDna: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("@/lib/ai/generateGated", () => ({ generateJsonGated: vi.fn() }));

import { buildIdentityMemoryContext, buildIdentityMemoryBlock } from "./retrieval";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildIdentityMemoryContext (ADR-030)", () => {
  it("bloğa giren aktif fact id'leri typed context'te döner", async () => {
    getActiveFactsMock.mockResolvedValue([
      { id: "mf-1", type: "preference", statement: "Emoji kullanma", sourceProvenance: "operator", confidence: 0.9 },
      { id: "mf-2", type: "preference", statement: "Kısa cümle kur", sourceProvenance: "operator", confidence: 0.8 },
    ]);
    const ctx = await buildIdentityMemoryContext("grafikcem");
    expect(ctx.memoryFactIds).toEqual(["mf-1", "mf-2"]);
    expect(ctx.block).toContain("Emoji kullanma");
    expect(ctx.policyVersion).toBe("2B");
  });

  it("en fazla 8 fact bloğa girer — id listesi blokla birebir aynı", async () => {
    getActiveFactsMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        id: `mf-${i}`,
        type: "preference",
        statement: `Kural ${i}`,
        sourceProvenance: "operator",
        confidence: 1 - i * 0.05,
      }))
    );
    const ctx = await buildIdentityMemoryContext("grafikcem");
    expect(ctx.memoryFactIds).toHaveLength(8);
    expect(ctx.block).toContain("Kural 7");
    expect(ctx.block).not.toContain("Kural 8"); // bloğa girmeyen id de listede YOK
  });

  it("fact okunması düşerse memoryFactIds boş — sahte influence kaydı oluşmaz", async () => {
    getActiveFactsMock.mockRejectedValue(new Error("db down"));
    const ctx = await buildIdentityMemoryContext("grafikcem");
    expect(ctx.memoryFactIds).toEqual([]);
    expect(ctx.block).toContain("Ses anayasası"); // diğer bloklar yaşar
  });

  it("supersede sonrası yeni draft yalnız YENİ aktif id'yi kullanır (aktif küme neyse o)", async () => {
    getActiveFactsMock.mockResolvedValue([
      { id: "mf-new", type: "preference", statement: "Yeni sürüm kural", sourceProvenance: "operator", confidence: 0.9 },
    ]);
    const ctx = await buildIdentityMemoryContext("grafikcem");
    expect(ctx.memoryFactIds).toEqual(["mf-new"]); // eski/superseded id imkânsız
  });

  it("geriye-uyum: buildIdentityMemoryBlock aynı string'i döner", async () => {
    getActiveFactsMock.mockResolvedValue([]);
    const [ctx, block] = await Promise.all([
      buildIdentityMemoryContext("grafikcem"),
      buildIdentityMemoryBlock("grafikcem"),
    ]);
    expect(block).toBe(ctx.block);
  });
});
