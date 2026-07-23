import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  feedbackToTrainingLabel,
  shouldCreateTrainingExample,
  shouldSaveAsPattern,
  buildFeedbackEventInput,
  buildTrainingExampleFromFeedback,
  mergeViralPatternIdIntoReason,
  extractViralPatternIdFromReason,
  processFeedback
} from "./feedback-service";
import { prisma } from "@/lib/db/client";
import { scoreDraft } from "@/lib/growth-engine/scorer";
import { extractPattern, patternExtractionToViralPatternInput } from "@/lib/growth-engine/pattern-extractor";
import { accountRepo } from "@/lib/db/accountRepo";
import { feedbackEventRepo } from "@/lib/db/feedbackEventRepo";
import { trainingExampleRepo } from "@/lib/db/trainingExampleRepo";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
import type { FeedbackApiInput } from "./types";

// ---------------------------------------------------------------------------
// Mock repos and engines
// ---------------------------------------------------------------------------
vi.mock("@/lib/accounts/profileRepository", () =>
  import("@/lib/accounts/profileRepository.testDouble").then((m) =>
    m.createProfileRepositoryTestDouble()
  )
);

vi.mock("@/lib/db/feedbackEventRepo", () => ({
  feedbackEventRepo: {
    create: vi.fn(),
    findByIdempotencyKey: vi.fn(),
    updateReason: vi.fn()
  }
}));

vi.mock("@/lib/db/trainingExampleRepo", () => ({
  trainingExampleRepo: {
    create: vi.fn()
  }
}));

vi.mock("@/lib/db/viralPatternRepo", () => ({
  viralPatternRepo: {
    create: vi.fn()
  }
}));

vi.mock("@/lib/db/accountRepo", () => ({
  accountRepo: {
    findByHandle: vi.fn()
  }
}));

vi.mock("@/lib/growth-engine/scorer", () => ({
  scoreDraft: vi.fn()
}));

vi.mock("@/lib/growth-engine/pattern-extractor", () => ({
  extractPattern: vi.fn(),
  patternExtractionToViralPatternInput: vi.fn()
}));

describe("Feedback Service Helpers", () => {
  describe("feedbackToTrainingLabel", () => {
    it("maps approved to good", () => {
      expect(feedbackToTrainingLabel("approved")).toBe("good");
    });
    it("maps saved_as_pattern to good", () => {
      expect(feedbackToTrainingLabel("saved_as_pattern")).toBe("good");
    });
    it("maps edited to edited", () => {
      expect(feedbackToTrainingLabel("edited")).toBe("edited");
    });
    it("maps make_stronger to edited", () => {
      expect(feedbackToTrainingLabel("make_stronger")).toBe("edited");
    });
    it("maps make_clearer to edited", () => {
      expect(feedbackToTrainingLabel("make_clearer")).toBe("edited");
    });
    it("maps rejected to bad", () => {
      expect(feedbackToTrainingLabel("rejected")).toBe("bad");
    });
    it("maps not_my_tone to bad", () => {
      expect(feedbackToTrainingLabel("not_my_tone")).toBe("bad");
    });
    it("maps hook_weak to bad", () => {
      expect(feedbackToTrainingLabel("hook_weak")).toBe("bad");
    });
    it("maps too_ai to bad", () => {
      expect(feedbackToTrainingLabel("too_ai")).toBe("bad");
    });
  });

  describe("shouldCreateTrainingExample", () => {
    it("returns false if saveTrainingExample is false", () => {
      expect(
        shouldCreateTrainingExample({
          feedbackType: "approved",
          saveTrainingExample: false
        } as any)
      ).toBe(false);
    });

    it("returns true for approved feedbackType by default", () => {
      expect(
        shouldCreateTrainingExample({
          feedbackType: "approved"
        } as any)
      ).toBe(true);
    });

    it("returns true for rejected feedbackType by default", () => {
      expect(
        shouldCreateTrainingExample({
          feedbackType: "rejected"
        } as any)
      ).toBe(true);
    });

    it("returns true for edited feedbackType by default", () => {
      expect(
        shouldCreateTrainingExample({
          feedbackType: "edited"
        } as any)
      ).toBe(true);
    });

    it("returns true for saved_as_pattern feedbackType by default", () => {
      expect(
        shouldCreateTrainingExample({
          feedbackType: "saved_as_pattern"
        } as any)
      ).toBe(true);
    });

    it("returns true if editedContent is present even if type is not approved/rejected/edited", () => {
      expect(
        shouldCreateTrainingExample({
          feedbackType: "not_my_tone",
          editedContent: "Some changes"
        } as any)
      ).toBe(true);
    });

    it("returns false for non-training feedbackTypes with no editedContent", () => {
      expect(
        shouldCreateTrainingExample({
          feedbackType: "not_my_tone"
        } as any)
      ).toBe(false);
    });
  });

  describe("shouldSaveAsPattern", () => {
    it("returns true if saveAsPattern is true", () => {
      expect(
        shouldSaveAsPattern({
          saveAsPattern: true,
          feedbackType: "approved"
        } as any)
      ).toBe(true);
    });

    it("returns true if feedbackType is saved_as_pattern", () => {
      expect(
        shouldSaveAsPattern({
          saveAsPattern: false,
          feedbackType: "saved_as_pattern"
        } as any)
      ).toBe(true);
    });

    it("returns false if saveAsPattern is false and feedbackType is not saved_as_pattern", () => {
      expect(
        shouldSaveAsPattern({
          saveAsPattern: false,
          feedbackType: "approved"
        } as any)
      ).toBe(false);
    });
  });

  describe("buildFeedbackEventInput", () => {
    it("maps all properties correctly and handles fallback content", () => {
      const input: FeedbackApiInput = {
        accountId: "acc-123",
        accountHandle: "grafikcem",
        feedbackType: "approved",
        originalContent: "Original",
        editedContent: "Edited",
        reason: "Looks great",
        queueItemId: "q-1",
        sourcePostId: "s-1",
        saveTrainingExample: true,
        saveAsPattern: false
      };

      const result = buildFeedbackEventInput(input);
      expect(result.accountId).toBe("acc-123");
      expect(result.feedbackType).toBe("approved");
      expect(result.originalContent).toBe("Original");
      expect(result.editedContent).toBe("Edited");
      expect(result.reason).toBe("Looks great");
      expect(result.queueItemId).toBe("q-1");
      expect(result.sourcePostId).toBe("s-1");
    });

    it("falls back to editedContent if originalContent is empty", () => {
      const input: FeedbackApiInput = {
        accountId: "acc-123",
        accountHandle: "grafikcem",
        feedbackType: "edited",
        editedContent: "Edited Only",
        saveTrainingExample: true,
        saveAsPattern: false
      };

      const result = buildFeedbackEventInput(input);
      expect(result.originalContent).toBe("Edited Only");
    });

    it("populates the queryable editDistance field for edited feedback (and mirrors it into reason)", () => {
      const input: FeedbackApiInput = {
        accountId: "acc-123",
        accountHandle: "grafikcem",
        feedbackType: "edited",
        originalContent: "Bugün Midjourney v8 çıktı.",
        editedContent: "Bugün Midjourney v8 çıktı — 4 saatlik işi 12 dakikaya indirdim.",
        saveTrainingExample: true,
        saveAsPattern: false,
      };

      const result = buildFeedbackEventInput(input);
      expect(typeof result.editDistance).toBe("number");
      expect(result.editDistance).toBeGreaterThan(0);
      // Geriye uyum: reason JSON'a da yansır.
      expect(JSON.parse(result.reason).editDistance).toBe(result.editDistance);
    });

    it("leaves editDistance null for non-edit feedback", () => {
      const result = buildFeedbackEventInput({
        accountId: "acc-123",
        accountHandle: "grafikcem",
        feedbackType: "approved",
        originalContent: "x",
        editedContent: "x",
        saveTrainingExample: true,
        saveAsPattern: false,
      });
      expect(result.editDistance).toBeNull();
    });
  });

  describe("buildTrainingExampleFromFeedback", () => {
    it("includes score inside metricsJson", () => {
      const input: FeedbackApiInput = {
        accountId: "acc-123",
        accountHandle: "grafikcem",
        feedbackType: "approved",
        originalContent: "Content",
        sourceContent: "Source",
        modeId: "daily_ai_news",
        saveTrainingExample: true,
        saveAsPattern: false
      };

      const mockScore = {
        publishScore: 85,
        publishRecommendation: "publish"
      } as any;

      const result = buildTrainingExampleFromFeedback(input, mockScore);
      expect(result.accountId).toBe("acc-123");
      expect(result.inputType).toBe("daily_ai_news");
      expect(result.label).toBe("good");
      expect(result.metricsJson).toEqual({ draftScore: mockScore });
    });
  });
});

describe("processFeedback (Main Flow)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock behavior
    vi.mocked(accountRepo.findByHandle).mockResolvedValue({ id: "acc-123", handle: "grafikcem" } as any);
    vi.mocked(feedbackEventRepo.create).mockResolvedValue({ id: "mock-feedback-id" } as any);
    vi.mocked(feedbackEventRepo.findByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(trainingExampleRepo.create).mockResolvedValue({ id: "mock-training-id" } as any);
    vi.mocked(viralPatternRepo.create).mockResolvedValue({ id: "mock-pattern-id" } as any);
    vi.mocked(scoreDraft).mockResolvedValue({ publishScore: 90 } as any);
    vi.mocked(extractPattern).mockResolvedValue({ confidence: 85, suggestedPatterns: ["New Pattern"] } as any);
    vi.mocked(patternExtractionToViralPatternInput).mockReturnValue({ patternName: "New Pattern" } as any);
  });

  it("successfully processes approved feedback event and scoreDraft", async () => {
    const input = {
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "approved",
      originalContent: "Original content for AI news"
    };

    const response = await processFeedback(input);

    expect(response.success).toBe(true);
    expect(response.feedbackEventId).toBe("mock-feedback-id");
    expect(response.trainingExampleId).toBe("mock-training-id");
    expect(response.draftScore).toBeDefined();
    expect(response.warnings).toBeUndefined();

    expect(feedbackEventRepo.create).toHaveBeenCalled();
    expect(scoreDraft).toHaveBeenCalledWith({
      content: "Original content for AI news",
      accountHandle: "grafikcem",
      modeId: undefined,
      sourceContent: undefined
    });
    expect(trainingExampleRepo.create).toHaveBeenCalled();
  });

  it("successfully processes rejected feedback without draft scoring", async () => {
    const input = {
      accountId: "acc-123",
      accountHandle: "maskulenkod",
      feedbackType: "rejected",
      originalContent: "Rejected content"
    };

    const response = await processFeedback(input);
    expect(response.success).toBe(true);
    expect(response.draftScore).toBeUndefined();
    expect(response.trainingExampleId).toBe("mock-training-id");
    expect(scoreDraft).not.toHaveBeenCalled();
  });

  it("handles edited feedback type with editedContent", async () => {
    const input = {
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "edited",
      originalContent: "Bad content",
      editedContent: "Much better content for the match"
    };

    const response = await processFeedback(input);
    expect(response.success).toBe(true);
    expect(response.trainingExampleId).toBe("mock-training-id");
    expect(scoreDraft).toHaveBeenCalledWith(expect.objectContaining({
      content: "Much better content for the match"
    }));
  });

  it("extracts and saves viral pattern for saved_as_pattern feedback type", async () => {
    const input = {
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "saved_as_pattern",
      originalContent: "Viral content hooks"
    };

    const response = await processFeedback(input);
    expect(response.success).toBe(true);
    expect(response.viralPatternId).toBe("mock-pattern-id");
    expect(response.patternExtraction).toBeDefined();
    expect(extractPattern).toHaveBeenCalled();
    expect(patternExtractionToViralPatternInput).toHaveBeenCalled();
  });

  it("extracts and saves viral pattern if saveAsPattern is true explicitly", async () => {
    const input = {
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "approved",
      originalContent: "Explicit pattern saving",
      saveAsPattern: true
    };

    const response = await processFeedback(input);
    expect(response.success).toBe(true);
    expect(response.viralPatternId).toBe("mock-pattern-id");
  });

  it("only creates feedback event if saveTrainingExample is false", async () => {
    const input = {
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "approved",
      originalContent: "Content that wont be saved as example",
      saveTrainingExample: false
    };

    const response = await processFeedback(input);
    expect(response.success).toBe(true);
    expect(response.feedbackEventId).toBe("mock-feedback-id");
    expect(response.trainingExampleId).toBeUndefined();
    expect(trainingExampleRepo.create).not.toHaveBeenCalled();
  });

  it("does not extract pattern if saveAsPattern is false explicitly", async () => {
    const input = {
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "approved",
      originalContent: "Normal approved post",
      saveAsPattern: false
    };

    const response = await processFeedback(input);
    expect(response.success).toBe(true);
    expect(response.viralPatternId).toBeUndefined();
    expect(extractPattern).not.toHaveBeenCalled();
  });

  it("records warning and continues if scoreDraft fails", async () => {
    vi.mocked(scoreDraft).mockRejectedValue(new Error("Scoring service unavailable"));

    const input = {
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "approved",
      originalContent: "Testing resilient scoring"
    };

    const response = await processFeedback(input);
    expect(response.success).toBe(true);
    expect(response.feedbackEventId).toBe("mock-feedback-id");
    expect(response.trainingExampleId).toBe("mock-training-id"); // Still saves example!
    expect(response.warnings).toContain("Scoring failed: Scoring service unavailable");
  });

  it("records warning and continues if extractPattern fails", async () => {
    vi.mocked(extractPattern).mockRejectedValue(new Error("AI extraction failed"));

    const input = {
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "saved_as_pattern",
      originalContent: "Resilient pattern extraction test"
    };

    const response = await processFeedback(input);
    expect(response.success).toBe(true);
    expect(response.feedbackEventId).toBe("mock-feedback-id");
    expect(response.viralPatternId).toBeUndefined();
    expect(response.warnings).toContain("Pattern extraction failed: AI extraction failed");
  });

  it("throws validation error for invalid accountHandle", async () => {
    const input = {
      accountId: "acc-123",
      accountHandle: "invalid_handle",
      feedbackType: "approved",
      originalContent: "Content"
    };

    await expect(processFeedback(input)).rejects.toThrow();
  });

  it("throws validation error when all content fields are empty", async () => {
    const input = {
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "approved",
      originalContent: "   ", // spaces
    };

    await expect(processFeedback(input)).rejects.toThrow();
  });

  it("accepts plain string queueItemId and sourcePostId", async () => {
    const input = {
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "approved",
      originalContent: "Post content",
      queueItemId: "any-plain-string-id-123",
      sourcePostId: "any-plain-string-post-555"
    };

    const response = await processFeedback(input);
    expect(response.success).toBe(true);
    expect(vi.mocked(feedbackEventRepo.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        queueItemId: "any-plain-string-id-123",
        sourcePostId: "any-plain-string-post-555"
      })
    );
  });

  // ── Phase 5A (ADR-044): açık geri bildirim idempotency ────────────────────
  it("returns idempotent replay and skips ALL side-effects when idempotencyKey already exists", async () => {
    vi.mocked(feedbackEventRepo.findByIdempotencyKey).mockResolvedValue({ id: "existing-fb" } as any);

    const response = await processFeedback({
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "approved",
      originalContent: "Second identical click",
      idempotencyKey: "q-1:approved",
    });

    expect(response.success).toBe(true);
    expect(response.feedbackEventId).toBe("existing-fb");
    expect(response.warnings).toContain("idempotent_replay");
    // Hiçbir yan etki: yeni event / training example / scoreDraft ÇAĞRILMAZ.
    expect(feedbackEventRepo.create).not.toHaveBeenCalled();
    expect(trainingExampleRepo.create).not.toHaveBeenCalled();
    expect(scoreDraft).not.toHaveBeenCalled();
  });

  it("creates exactly once across a double-submit with the same idempotencyKey", async () => {
    // 1. gönderim: prior yok → oluştur. 2. gönderim: prior DB'de var → replay.
    vi.mocked(feedbackEventRepo.findByIdempotencyKey)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "mock-feedback-id" } as any);

    const input = {
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "hook_weak",
      originalContent: "Aynı chip iki kez",
      idempotencyKey: "q-1:hook_weak",
    };

    const first = await processFeedback(input);
    const second = await processFeedback(input);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.warnings).toContain("idempotent_replay");
    // create YALNIZ bir kez — çift-tık duplicate ÜRETMEZ.
    expect(feedbackEventRepo.create).toHaveBeenCalledTimes(1);
  });

  it("P2002 race backstop: create unique violation returns existing without re-running side-effects", async () => {
    // Pre-check null (yarış), create P2002 fırlatır, catch içindeki lookup mevcut döner.
    vi.mocked(feedbackEventRepo.findByIdempotencyKey)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "raced-fb" } as any);
    vi.mocked(feedbackEventRepo.create).mockRejectedValueOnce({ code: "P2002" } as any);

    const response = await processFeedback({
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "approved",
      originalContent: "Concurrent submit",
      idempotencyKey: "q-1:approved",
    });

    expect(response.success).toBe(true);
    expect(response.feedbackEventId).toBe("raced-fb");
    expect(response.warnings).toContain("idempotent_replay");
    expect(trainingExampleRepo.create).not.toHaveBeenCalled();
  });

  it("derives a server-side idempotency key when the client omits one (double-submit safe)", async () => {
    vi.mocked(feedbackEventRepo.findByIdempotencyKey).mockResolvedValue(null);
    const response = await processFeedback({
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "approved",
      originalContent: "No key legacy call",
    });
    expect(response.success).toBe(true);
    // The gate ALWAYS engages now: a deterministic "auto:" key is derived and
    // pre-checked, so a double-submit / retry can't duplicate the side-effects.
    expect(feedbackEventRepo.findByIdempotencyKey).toHaveBeenCalled();
    const key = vi.mocked(feedbackEventRepo.findByIdempotencyKey).mock.calls.at(-1)?.[0];
    expect(key).toMatch(/^auto:/);
    expect(feedbackEventRepo.create).toHaveBeenCalledTimes(1);
    const created = vi.mocked(feedbackEventRepo.create).mock.calls[0][0];
    expect(created.idempotencyKey).toMatch(/^auto:/);
  });

  it("dedupes an identical no-key double-submit via the derived key", async () => {
    vi.mocked(feedbackEventRepo.findByIdempotencyKey)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "fb-first" } as any);
    const input = {
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "approved" as const,
      originalContent: "same content",
      reason: "same reason",
    };
    const first = await processFeedback(input);
    const second = await processFeedback(input);
    expect(first.success).toBe(true);
    expect(second.warnings).toContain("idempotent_replay");
    // Both derived the SAME key → the second short-circuits; the side-effecting
    // create runs exactly once.
    expect(feedbackEventRepo.create).toHaveBeenCalledTimes(1);
  });
});

// ── PR-B: extraction resume semantics ──────────────────────────────────────────
describe("reason JSON viralPatternId bağı (helpers)", () => {
  it("merges the pattern id while preserving existing JSON fields", () => {
    const merged = mergeViralPatternIdIntoReason(
      JSON.stringify({ text: "iyi", editDistance: 0.12 }),
      "vp-1",
    );
    expect(JSON.parse(merged)).toEqual({ text: "iyi", editDistance: 0.12, viralPatternId: "vp-1" });
  });

  it("wraps a plain-string reason", () => {
    expect(JSON.parse(mergeViralPatternIdIntoReason("düz metin", "vp-2"))).toEqual({
      text: "düz metin",
      viralPatternId: "vp-2",
    });
  });

  it("extract reads back what merge wrote; plain/absent → null", () => {
    expect(extractViralPatternIdFromReason(mergeViralPatternIdIntoReason("x", "vp-3"))).toBe("vp-3");
    expect(extractViralPatternIdFromReason("düz metin")).toBeNull();
    expect(extractViralPatternIdFromReason(JSON.stringify({ text: "y" }))).toBeNull();
    expect(extractViralPatternIdFromReason(null)).toBeNull();
  });
});

describe("processFeedback — extraction resume (PR-B)", () => {
  const saveInput = {
    accountId: "acc-123",
    accountHandle: "grafikcem",
    feedbackType: "saved_as_pattern" as const,
    originalContent: "Viral içerik",
    idempotencyKey: "sp-1:saved_as_pattern",
  };

  let txFeedbackFindUnique: ReturnType<typeof vi.fn>;
  let txFeedbackUpdate: ReturnType<typeof vi.fn>;
  let txSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(accountRepo.findByHandle).mockResolvedValue({ id: "acc-123", handle: "grafikcem" } as any);
    vi.mocked(feedbackEventRepo.create).mockResolvedValue({ id: "fb-1", createdAt: new Date(), reason: "" } as any);
    vi.mocked(feedbackEventRepo.findByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(feedbackEventRepo.updateReason).mockResolvedValue({ id: "fb-1" } as any);
    vi.mocked(trainingExampleRepo.create).mockResolvedValue({ id: "te-1" } as any);
    vi.mocked(viralPatternRepo.create).mockResolvedValue({ id: "vp-new" } as any);
    vi.mocked(extractPattern).mockResolvedValue({ confidence: 85 } as any);
    vi.mocked(patternExtractionToViralPatternInput).mockReturnValue({ patternName: "P" } as any);
    // prisma.$transaction → sahte tx istemcisiyle callback'i çalıştır (gerçek DB yok).
    txFeedbackFindUnique = vi.fn();
    txFeedbackUpdate = vi.fn().mockResolvedValue({});
    txSpy = vi.spyOn(prisma, "$transaction").mockImplementation((async (fn: any) =>
      fn({
        $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
        feedbackEvent: { findUnique: txFeedbackFindUnique, update: txFeedbackUpdate },
      })) as any);
  });

  afterEach(() => {
    txSpy.mockRestore();
  });

  it("initial successful extraction LINKS the pattern id into reason (updateReason)", async () => {
    const response = await processFeedback(saveInput);
    expect(response.viralPatternId).toBe("vp-new");
    expect(feedbackEventRepo.updateReason).toHaveBeenCalledTimes(1);
    const [, reasonArg] = vi.mocked(feedbackEventRepo.updateReason).mock.calls[0];
    expect(extractViralPatternIdFromReason(reasonArg)).toBe("vp-new");
  });

  it("replay AFTER completion: returns the linked id, NO second paid extraction, NO tx", async () => {
    vi.mocked(feedbackEventRepo.findByIdempotencyKey).mockResolvedValue({
      id: "fb-1",
      reason: mergeViralPatternIdIntoReason("", "vp-done"),
    } as any);

    const response = await processFeedback(saveInput);
    expect(response.success).toBe(true);
    expect(response.feedbackEventId).toBe("fb-1");
    expect(response.viralPatternId).toBe("vp-done");
    expect(response.warnings).toContain("idempotent_replay");
    expect(extractPattern).not.toHaveBeenCalled(); // çifte ücret YOK
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(feedbackEventRepo.create).not.toHaveBeenCalled();
  });

  it("replay after a SWALLOWED extraction: resumes under the advisory lock and links the new pattern", async () => {
    vi.mocked(feedbackEventRepo.findByIdempotencyKey).mockResolvedValue({
      id: "fb-1",
      reason: "", // bağ yok = extraction yutulmuştu
    } as any);
    txFeedbackFindUnique.mockResolvedValue({ id: "fb-1", reason: "" });

    const response = await processFeedback(saveInput);
    expect(response.success).toBe(true);
    expect(response.viralPatternId).toBe("vp-new");
    expect(response.warnings).toEqual(expect.arrayContaining(["idempotent_replay", "extraction_resumed"]));
    expect(extractPattern).toHaveBeenCalledTimes(1); // extraction GERÇEKTEN sürdü
    expect(viralPatternRepo.create).toHaveBeenCalledTimes(1);
    // Bağ lock-tx İÇİNDE yazıldı.
    expect(txFeedbackUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "fb-1" },
        data: { reason: expect.stringContaining("vp-new") },
      }),
    );
    // Yeni FeedbackEvent YOK (duplicate yok).
    expect(feedbackEventRepo.create).not.toHaveBeenCalled();
  });

  it("concurrent resume loser: fresh in-lock read finds the winner's link → SKIPS extraction", async () => {
    vi.mocked(feedbackEventRepo.findByIdempotencyKey).mockResolvedValue({
      id: "fb-1",
      reason: "", // lock'a girmeden önce bağ görünmüyordu
    } as any);
    // Lock alındıktan sonraki taze okuma: kazanan bağı yazmış.
    txFeedbackFindUnique.mockResolvedValue({
      id: "fb-1",
      reason: mergeViralPatternIdIntoReason("", "vp-winner"),
    });

    const response = await processFeedback(saveInput);
    expect(response.viralPatternId).toBe("vp-winner");
    expect(extractPattern).not.toHaveBeenCalled(); // kaybeden İKİNCİ ücreti ödemez
    expect(viralPatternRepo.create).not.toHaveBeenCalled();
  });

  it("resume extraction fails AGAIN: honest no-pattern result, link NOT written → next retry can resume", async () => {
    vi.mocked(feedbackEventRepo.findByIdempotencyKey).mockResolvedValue({
      id: "fb-1",
      reason: "",
    } as any);
    txFeedbackFindUnique.mockResolvedValue({ id: "fb-1", reason: "" });
    vi.mocked(extractPattern).mockRejectedValue(new Error("AI extraction failed"));

    const response = await processFeedback(saveInput);
    expect(response.success).toBe(true);
    expect(response.viralPatternId).toBeUndefined();
    expect(response.warnings).toEqual(
      expect.arrayContaining(["extraction_resumed", "Pattern extraction failed: AI extraction failed"]),
    );
    expect(txFeedbackUpdate).not.toHaveBeenCalled(); // bağ yazılmadı → kalıcı kilit yok
  });

  it("plain replay WITHOUT saveAsPattern is unchanged (no resume machinery)", async () => {
    vi.mocked(feedbackEventRepo.findByIdempotencyKey).mockResolvedValue({ id: "fb-9", reason: "" } as any);
    const response = await processFeedback({
      accountId: "acc-123",
      accountHandle: "grafikcem",
      feedbackType: "approved",
      originalContent: "x",
      idempotencyKey: "k",
    });
    expect(response).toEqual({ success: true, feedbackEventId: "fb-9", warnings: ["idempotent_replay"] });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
