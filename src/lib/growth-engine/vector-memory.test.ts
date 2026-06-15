import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createLocalFallbackEmbedding,
  createEmbedding,
  cosineSimilarity,
  embedTrainingExample,
  embedTrainingExamplesByAccount,
  mapTrainingLabelToMemoryLabel,
  searchSimilarExamples,
  buildMemoryContext,
  memoryResultToPromptSnippet,
  buildMemoryPromptBlock,
} from "./vector-memory";
import { prisma } from "@/lib/db/client";
import { trainingExampleRepo } from "@/lib/db/trainingExampleRepo";
import { accountRepo } from "@/lib/db/accountRepo";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    trainingExample: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    viralPattern: {
      findMany: vi.fn(),
    },
    account: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/trainingExampleRepo", () => ({
  trainingExampleRepo: {
    findById: vi.fn(),
    updateEmbedding: vi.fn(),
  },
}));

vi.mock("@/lib/db/accountRepo", () => ({
  accountRepo: {
    findByHandle: vi.fn(),
  },
}));

describe("Vector Memory — Core Embedding & Mathematics", () => {
  it("should generate deterministic local fallback embedding", () => {
    const text = "Süreçleri tamamen AI yönetiyor";
    const emb1 = createLocalFallbackEmbedding(text);
    const emb2 = createLocalFallbackEmbedding(text);

    expect(emb1.provider).toBe("local_fallback");
    expect(emb1.dimensions).toBe(256);
    expect(emb1.values.length).toBe(256);
    expect(emb1.values).toEqual(emb2.values);
  });

  it("should produce different fallback embeddings for different inputs", () => {
    const emb1 = createLocalFallbackEmbedding("Süreçleri tamamen AI yönetiyor");
    const emb2 = createLocalFallbackEmbedding("Farklı bir metin girdisi");

    expect(emb1.values).not.toEqual(emb2.values);
  });

  it("should handle empty inputs gracefully in local fallback", () => {
    const emb = createLocalFallbackEmbedding("");
    expect(emb.values.every((v) => v === 0)).toBe(true);
  });

  it("should fall back to local embedding if OpenRouter is missing or throws error", async () => {
    const oldKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const emb = await createEmbedding("Test metni");
    expect(emb.provider).toBe("local_fallback");

    process.env.OPENROUTER_API_KEY = oldKey;
  });

  it("should calculate correct cosine similarity of identical vectors as 1", () => {
    const a = [1, 0, 0, 0];
    const b = [1, 0, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it("should calculate correct cosine similarity of opposite vectors as 0 (due to clamp Math.max(0))", () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("should return 0 for malformed vectors in cosineSimilarity", () => {
    expect(cosineSimilarity([], [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
    expect(cosineSimilarity(null as any, [1])).toBe(0);
  });
});

describe("Vector Memory — Training Example & Account Embedding Sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should embed single training example correctly", async () => {
    const mockEx = {
      id: "te-1",
      accountId: "acc-1",
      inputType: "tweet",
      sourceContent: "Giriş metni",
      outputContent: "Çıkış metni",
      label: "good",
      reason: "approved",
      metricsJson: {},
      embeddingJson: null,
    };

    vi.mocked(trainingExampleRepo.findById).mockResolvedValue(mockEx as any);
    vi.mocked(trainingExampleRepo.updateEmbedding).mockResolvedValue({} as any);

    const emb = await embedTrainingExample("te-1");

    expect(trainingExampleRepo.findById).toHaveBeenCalledWith("te-1");
    expect(trainingExampleRepo.updateEmbedding).toHaveBeenCalled();
    expect(emb.dimensions).toBe(256);
  });

  it("should throw error if training example not found", async () => {
    vi.mocked(trainingExampleRepo.findById).mockResolvedValue(null);

    await expect(embedTrainingExample("invalid-id")).rejects.toThrow("not found");
  });

  it("should bulk embed missing examples for account, skipping existing and counting stats", async () => {
    const mockExamples = [
      { id: "te-1", embeddingJson: null, sourceContent: "A", outputContent: "B" },
      { id: "te-2", embeddingJson: JSON.stringify([0.1, 0.2]), sourceContent: "C", outputContent: "D" },
      { id: "te-3", embeddingJson: null, sourceContent: "E", outputContent: "F" },
    ];

    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue(mockExamples as any);
    vi.mocked(trainingExampleRepo.findById).mockImplementation(async (id) => {
      const match = mockExamples.find((e) => e.id === id);
      return match ? (match as any) : null;
    });

    const stats = await embedTrainingExamplesByAccount("acc-1");

    expect(stats.embedded).toBe(2);
    expect(stats.skipped).toBe(1);
    expect(stats.failed).toBe(0);
  });
});

describe("Vector Memory — Map Labels & Similarity Search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should map DB training labels to RAG MemoryLabels properly", () => {
    expect(mapTrainingLabelToMemoryLabel("good")).toBe("positive");
    expect(mapTrainingLabelToMemoryLabel("published")).toBe("positive");
    expect(mapTrainingLabelToMemoryLabel("bad")).toBe("negative");
    expect(mapTrainingLabelToMemoryLabel("edited")).toBe("edited");
    expect(mapTrainingLabelToMemoryLabel("good", "saved_as_pattern")).toBe("pattern");
    expect(mapTrainingLabelToMemoryLabel("bad", "pattern extraction")).toBe("pattern");
    expect(mapTrainingLabelToMemoryLabel("random")).toBe("unknown");
  });

  it("should search similar examples respecting account isolation and labels", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue({ id: "acc-1", handle: "grafikcem" } as any);
    
    const mockExs = [
      { id: "te-1", accountId: "acc-1", label: "good", sourceContent: "AI Tasarım", outputContent: "Harika AI", reason: "" },
      { id: "te-2", accountId: "acc-1", label: "bad", sourceContent: "Haber", outputContent: "Kötü tweet", reason: "" },
    ];
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue(mockExs as any);
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue([]);

    const results = await searchSimilarExamples({
      accountHandle: "grafikcem",
      text: "Yapay zeka",
      label: "positive",
    });

    expect(accountRepo.findByHandle).toHaveBeenCalledWith("grafikcem");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("te-1");
    expect(results[0].label).toBe("positive");
  });

  it("should skip corrupt embeddingJson values in similarity search without crashing", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue({ id: "acc-1", handle: "grafikcem" } as any);

    const mockExs = [
      { id: "te-1", accountId: "acc-1", label: "good", embeddingJson: "corrupt_json_string", outputContent: "Good one" },
      { id: "te-2", accountId: "acc-1", label: "edited", embeddingJson: null, outputContent: "Edited one" },
    ];
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue(mockExs as any);
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue([]);

    const results = await searchSimilarExamples({
      accountHandle: "grafikcem",
      text: "sorgu",
    });

    // te-1 has parse error, so skipped. te-2 generates in-memory fallback and is returned.
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("te-2");
  });
});

describe("Vector Memory — Memory Context & Prompt Block Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should build memory context retrieving correctly partitioned groups", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue({ id: "acc-1", handle: "grafikcem" } as any);

    const mockExs = [
      { id: "te-1", accountId: "acc-1", label: "good", outputContent: "Good tweet", reason: "" },
      { id: "te-2", accountId: "acc-1", label: "bad", outputContent: "Bad tweet", reason: "" },
      { id: "te-3", accountId: "acc-1", label: "edited", outputContent: "Edited tweet", reason: "" },
    ];
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue(mockExs as any);
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue([]);

    const context = await buildMemoryContext({
      accountHandle: "grafikcem",
      sourceContent: "AI",
    });

    expect(context.positiveExamples.length).toBe(1);
    expect(context.negativeExamples.length).toBe(1);
    expect(context.editedExamples.length).toBe(1);
    expect(context.warnings.length).toBe(0);
  });

  it("should fail softly and log a warning inside buildMemoryContext if database throws", async () => {
    vi.mocked(accountRepo.findByHandle).mockRejectedValue(new Error("Database offline"));

    const context = await buildMemoryContext({
      accountHandle: "grafikcem",
      sourceContent: "AI",
    });

    expect(context.positiveExamples).toEqual([]);
    expect(context.warnings.length).toBe(1);
    expect(context.warnings[0]).toContain("Database offline");
  });

  it("should build memory prompt block safely with correct structure and limit caps", () => {
    const mockContext = {
      positiveExamples: [
        { id: "1", accountHandle: "grafikcem", label: "positive" as const, sourceType: "manual", outputContent: "Good Tweet", similarity: 0.9 },
      ],
      negativeExamples: [
        { id: "2", accountHandle: "grafikcem", label: "negative" as const, sourceType: "manual", outputContent: "Too AI style", reason: "too_ai", similarity: 0.8 },
      ],
      editedExamples: [
        { id: "3", accountHandle: "grafikcem", label: "edited" as const, sourceType: "manual", sourceContent: "Old draft", outputContent: "Beautiful improved draft", similarity: 0.75 },
      ],
      patternExamples: [
        { id: "4", accountHandle: "grafikcem", label: "pattern" as const, sourceType: "viral_pattern", outputContent: "Pattern Example", similarity: 0.7 },
      ],
      warnings: [],
    };

    const block = buildMemoryPromptBlock(mockContext);

    expect(block).toContain("PAST WINNING EXAMPLES");
    expect(block).toContain("PAST REJECTED EXAMPLES");
    expect(block).toContain("Avoid this style");
    expect(block).toContain("too_ai");
    expect(block).toContain("PAST EDITED EXAMPLES");
    expect(block).toContain("Original Draft: \"Old draft\" -> Improved Editorial Style: \"Beautiful improved draft\"");
  });

  it("should clip extremely long output contents in memory snippets", () => {
    const longText = "a".repeat(300);
    const mockResult = {
      id: "1",
      accountHandle: "grafikcem",
      label: "positive" as const,
      sourceType: "manual",
      outputContent: longText,
      similarity: 0.95,
    };

    const snippet = memoryResultToPromptSnippet(mockResult);
    expect(snippet.length).toBeLessThan(180);
    expect(snippet).toContain("...");
  });
});
