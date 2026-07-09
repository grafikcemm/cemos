import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    memoryFact: { findMany: vi.fn(() => Promise.resolve([])) },
    captionDna: { findUnique: vi.fn(() => Promise.resolve(null)) },
    hashtagDna: { findFirst: vi.fn(() => Promise.resolve(null)) },
  },
}));
vi.mock("@/lib/ai/generateGated", () => ({ generateJsonGated: vi.fn() }));

import { prisma } from "@/lib/db/client";
import { generateJsonGated } from "@/lib/ai/generateGated";
import { buildIdentityMemoryBlock, rerankMemoryContext, RERANK_TOP_N } from "./retrieval";
import { getVoiceConstitution } from "./constitutions";
import type { MemoryContext, MemorySearchResult } from "@/lib/growth-engine/types";

const mockFacts = vi.mocked(prisma.memoryFact.findMany);
const mockCaption = vi.mocked(prisma.captionDna.findUnique);
const mockGated = vi.mocked(generateJsonGated);

function ex(id: string): MemorySearchResult {
  return { id, outputContent: `örnek ${id}`, label: "positive", similarity: 0.9 } as MemorySearchResult;
}

function ctxWith(counts: { p?: number; n?: number; e?: number; pt?: number }): MemoryContext {
  const mk = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ex(`${prefix}${i}`));
  return {
    positiveExamples: mk(counts.p ?? 0, "p"),
    negativeExamples: mk(counts.n ?? 0, "n"),
    editedExamples: mk(counts.e ?? 0, "e"),
    patternExamples: mk(counts.pt ?? 0, "t"),
    warnings: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFacts.mockResolvedValue([]);
  mockCaption.mockResolvedValue(null as never);
});

describe("getVoiceConstitution (Tier 1)", () => {
  it("her iki hesap için anayasa döner", () => {
    expect(getVoiceConstitution("grafikcem")).toContain("Ses Anayasası");
    expect(getVoiceConstitution("maskulenkod")).toContain("Ses Anayasası");
  });
  it("bilinmeyen handle null döner (fail-soft)", () => {
    expect(getVoiceConstitution("evil")).toBeNull();
  });
});

describe("buildIdentityMemoryBlock (§5.4 sırası)", () => {
  it("anayasa her zaman EN BAŞTA; aktif kurallar sonra", async () => {
    mockFacts.mockResolvedValue([
      {
        id: "f1", type: "preference", statement: "Kurumsal dil kullanma",
        sourceProvenance: "operator", confidence: 0.9,
      },
    ] as never);
    const block = await buildIdentityMemoryBlock("grafikcem");
    const constitutionIdx = block.indexOf("SES ANAYASASI");
    const rulesIdx = block.indexOf("ÖĞRENİLMİŞ KURALLAR");
    expect(constitutionIdx).toBeGreaterThanOrEqual(0);
    expect(rulesIdx).toBeGreaterThan(constitutionIdx);
    expect(block).toContain("Kurumsal dil kullanma");
  });

  it("DNA satırı varsa özet eklenir", async () => {
    mockCaption.mockResolvedValue({
      openingHookTypes: '["sert sayı"]',
      signaturePhrases: "[]",
      forbiddenPhrases: "[]",
      emojiPolicy: "none",
      languageRegister: "casual",
    } as never);
    const block = await buildIdentityMemoryBlock("grafikcem");
    expect(block).toContain("YAZIM DNA ÖZETİ");
    expect(block).toContain("sert sayı");
  });

  it("fact sorgusu patlasa da anayasa döner (fail-soft)", async () => {
    mockFacts.mockRejectedValue(new Error("db down"));
    const block = await buildIdentityMemoryBlock("grafikcem");
    expect(block).toContain("SES ANAYASASI");
  });
});

describe("rerankMemoryContext (§5.2)", () => {
  it("aday sayısı eşik altındaysa LLM ÇAĞRILMAZ", async () => {
    const ctx = ctxWith({ p: 3, n: 2, e: 2 }); // 7 ≤ 8
    const out = await rerankMemoryContext(ctx, "kaynak", "acc-1");
    expect(mockGated).not.toHaveBeenCalled();
    expect(out).toBe(ctx);
  });

  it("eşik üstünde judge rerank top-8 uygular (memory_rerank purpose)", async () => {
    const ctx = ctxWith({ p: 3, n: 3, e: 3, pt: 3 }); // 12 > 8
    mockGated.mockResolvedValue({
      data: { keep: [0, 1, 2, 3, 4, 5, 6, 7] },
      model: "m", inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0, actualCostUsd: 0,
    } as never);
    const out = await rerankMemoryContext(ctx, "kaynak", "acc-1");
    const total =
      out.positiveExamples.length + out.negativeExamples.length +
      out.editedExamples.length + out.patternExamples.length;
    expect(total).toBe(RERANK_TOP_N);
    const arg = mockGated.mock.calls[0][0];
    expect(arg.purpose).toBe("memory_rerank");
    expect(arg.preset).toBe("cemos-final-judge");
  });

  it("rerank hatasında cosine sırası aynen kalır (fail-open)", async () => {
    const ctx = ctxWith({ p: 3, n: 3, e: 3, pt: 3 });
    mockGated.mockRejectedValue(new Error("402"));
    const out = await rerankMemoryContext(ctx, "kaynak", "acc-1");
    expect(out).toBe(ctx);
  });
});
