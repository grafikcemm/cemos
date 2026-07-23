import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/viralPatternRepo", () => ({
  viralPatternRepo: { listByAccount: vi.fn().mockResolvedValue([]) },
}));
// WP-02f dummy-DB guard'ının İFŞA ETTİĞİ gizli sızıntılar: bu iki modül gerçek
// prisma'ya dokunuyordu (eskiden env'siz anında hata → fail-soft görünmezdi).
vi.mock("@/lib/db/sourcePostRepo", () => ({
  sourcePostRepo: { listNewByAccount: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/lib/memory/retrieval", () => ({
  buildIdentityMemoryContext: vi.fn().mockResolvedValue({ block: "", memoryFactIds: [] }),
  rerankMemoryContext: vi.fn(async (ctx: unknown) => ctx),
}));
vi.mock("@/lib/growth-engine/vector-memory", () => ({
  buildMemoryContext: vi.fn().mockResolvedValue({
    positiveExamples: [],
    negativeExamples: [],
    editedExamples: [],
    patternExamples: [],
    warnings: [],
  }),
  buildMemoryPromptBlock: vi.fn().mockReturnValue(""),
}));

import { buildGroundingBlock, buildGroundingContext, BANNED_PHRASES } from "@/lib/ai/grounding";
import { accountProfiles } from "@/lib/accounts";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";

describe("buildGroundingBlock", () => {
  it("always includes brand-voice discipline with banned phrases", async () => {
    const block = await buildGroundingBlock(accountProfiles.grafikcem, "acc_1", "kaynak metin");
    expect(block).toContain("MARKA SESİ DİSİPLİNİ");
    expect(block).toContain(BANNED_PHRASES[0]);
  });

  it("adds platform-native rewrite instruction for non-X sources", async () => {
    const block = await buildGroundingBlock(accountProfiles.grafikcem, "acc_1", "metin", "reddit");
    expect(block.toLowerCase()).toContain("reddit");
    expect(block).toContain("native");
  });

  it("includes mined viral patterns when present", async () => {
    vi.mocked(viralPatternRepo.listByAccount).mockResolvedValueOnce([
      {
        id: "p1",
        patternName: "Workflow Değişimi",
        exampleGood: "AI artık fikir değil üretim aracı",
        hookType: "claim",
        emotion: "merak",
      },
    ] as never);
    const block = await buildGroundingBlock(accountProfiles.grafikcem, "acc_1", "metin");
    expect(block).toContain("VİRAL PATTERN KILAVUZU");
    expect(block).toContain("AI artık fikir");
  });

  it("fails soft when the pattern repo throws", async () => {
    vi.mocked(viralPatternRepo.listByAccount).mockRejectedValueOnce(new Error("db down"));
    const block = await buildGroundingBlock(accountProfiles.grafikcem, "acc_1", "metin");
    expect(block).toContain("MARKA SESİ DİSİPLİNİ"); // still returns brand-voice
  });
});

describe("buildGroundingContext", () => {
  it("returns the ids of the top patterns the block was grounded on", async () => {
    vi.mocked(viralPatternRepo.listByAccount).mockResolvedValueOnce([
      { id: "p1", patternName: "A", exampleGood: "örnek a", hookType: "claim", emotion: "merak" },
      { id: "p2", patternName: "B", exampleGood: "örnek b", hookType: "list", emotion: "fomo" },
      { id: "p3", patternName: "C", exampleGood: "örnek c", hookType: "story", emotion: "öfke" },
      { id: "p4", patternName: "D", exampleGood: "örnek d", hookType: "stat", emotion: "şaşkınlık" },
    ] as never);

    const ctx = await buildGroundingContext(accountProfiles.grafikcem, "acc_1", "metin");

    expect(ctx.patternIds).toEqual(["p1", "p2", "p3"]); // top-3 only
    expect(ctx.block).toContain("VİRAL PATTERN KILAVUZU");
  });

  it("returns empty patternIds when there are no patterns or the repo fails", async () => {
    const ctxEmpty = await buildGroundingContext(accountProfiles.grafikcem, "acc_1", "metin");
    expect(ctxEmpty.patternIds).toEqual([]);

    vi.mocked(viralPatternRepo.listByAccount).mockRejectedValueOnce(new Error("db down"));
    const ctxFail = await buildGroundingContext(accountProfiles.grafikcem, "acc_1", "metin");
    expect(ctxFail.patternIds).toEqual([]);
    expect(ctxFail.block).toContain("MARKA SESİ DİSİPLİNİ");
  });
});
