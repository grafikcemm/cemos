import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { publishService } from "./publishService";
import { prisma } from "@/lib/db/client";
import { qualityLintService } from "@/lib/services/qualityLintService";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    queueItem: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    publishLog: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    usageLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/services/qualityLintService", () => ({
  qualityLintService: {
    lint: vi.fn(),
  },
}));

vi.mock("@/lib/db/performanceRepo", () => ({
  performanceRepo: { createPublished: vi.fn(() => Promise.resolve({ id: "pp-1" })) },
}));

vi.mock("@/lib/growth-engine/feedback-service", () => ({
  processFeedback: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/services/imageService", () => ({
  imageService: { generateForQueueItem: vi.fn(() => Promise.resolve(null)) },
}));

import { performanceRepo } from "@/lib/db/performanceRepo";
import { processFeedback } from "@/lib/growth-engine/feedback-service";

describe("publishService", () => {
  const mockQueueItem = {
    id: "qi_1",
    accountId: "acc_1",
    content: "Clean content tweet.",
    editedContent: null,
    draftType: "TWEET",
    status: "scheduled",
    scheduledAt: new Date(Date.now() + 10 * 60 * 1000),
    account: {
      id: "acc_1",
      handle: "grafikcem",
      maxChars: 280,
      schedule: {
        dailyMaxPosts: 3,
        quietStartHour: 23,
        quietEndHour: 8,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Saati öğlene sabitle (12:00 UTC) — quiet hours (23-08) dışında
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should fail validation if item is not found", async () => {
    vi.mocked(prisma.queueItem.findUnique).mockResolvedValue(null);
    await expect(publishService.validatePublishable("qi_missing")).rejects.toThrow("queue_item_not_found");
  });

  it("should fail validation if status is already published", async () => {
    vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
      ...mockQueueItem,
      status: "published",
    } as unknown as Awaited<ReturnType<typeof prisma.queueItem.findUnique>>);

    await expect(publishService.validatePublishable("qi_1")).rejects.toThrow("invalid_status");
  });

  it("should fail validation if lint fails", async () => {
    vi.mocked(prisma.queueItem.findUnique).mockResolvedValue(mockQueueItem as unknown as Awaited<ReturnType<typeof prisma.queueItem.findUnique>>);
    vi.mocked(qualityLintService.lint).mockResolvedValue({ passed: false, issues: [], blockers: ["fail"], warnings: [] } as unknown as Awaited<ReturnType<typeof qualityLintService.lint>>);

    await expect(publishService.validatePublishable("qi_1")).rejects.toThrow("lint_blocked");
  });

  it("should fail validation if daily max posts cap is reached", async () => {
    vi.mocked(prisma.queueItem.findUnique).mockResolvedValue(mockQueueItem as unknown as Awaited<ReturnType<typeof prisma.queueItem.findUnique>>);
    vi.mocked(qualityLintService.lint).mockResolvedValue({ passed: true, issues: [], blockers: [], warnings: [] } as unknown as Awaited<ReturnType<typeof qualityLintService.lint>>);
    vi.mocked(prisma.publishLog.count).mockResolvedValue(3); // daily cap reached

    await expect(publishService.validatePublishable("qi_1")).rejects.toThrow("daily_cap_reached");
  });

  it("should fail validation with empty content", async () => {
    vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
      ...mockQueueItem,
      content: "",
      editedContent: null,
    } as unknown as Awaited<ReturnType<typeof prisma.queueItem.findUnique>>);

    await expect(publishService.validatePublishable("qi_1")).rejects.toThrow("empty_content");
  });

  describe("markManualPublished (yayın-anı readiness — düzeltilmiş sözleşme)", () => {
    // Ready = judged + TR doğallık ≥55 + risk düşük + sızıntı yok + sınır içi.
    const readyScores = JSON.stringify({
      telemetry: { judged: true },
      turkishNaturalness: 82,
      riskScore: 15,
      sourceFaithfulness: 88,
      leaks: [],
    });
    const readyItem = {
      ...mockQueueItem,
      status: "scheduled",
      content: "Temiz taslak — sahada test ettigim araci anlattim.",
      editedContent: null,
      mode: "default",
      draftType: "TWEET",
      scores: readyScores,
      lintReport: null,
      threadSegments: null,
      sourcePostId: null,
      newsItemId: null,
      account: { id: "acc_1", handle: "grafikcem", maxChars: 280 },
    };

    function mockPublishWrites() {
      vi.mocked(prisma.publishLog.create).mockResolvedValue({ id: "log_1" } as never);
      vi.mocked(prisma.queueItem.update).mockResolvedValue({ id: "qi_1", generatedImageUrl: null } as never);
      vi.mocked(prisma.usageLog.create).mockResolvedValue({} as never);
    }

    it("needs_edit taslak (judged=false) → edit_required, yayın YOK", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
        ...readyItem,
        scores: "{}", // judged=false → fail-closed needs_edit
      } as unknown as Awaited<ReturnType<typeof prisma.queueItem.findUnique>>);

      await expect(publishService.markManualPublished("qi_1")).rejects.toThrow("edit_required");
      expect(performanceRepo.createPublished).not.toHaveBeenCalled();
    });

    it("blocked taslak (karakter sınırı aşımı) → readiness_blocked, yayın YOK", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
        ...readyItem,
        content: "x".repeat(300), // 300 > 280 → over_char_limit block
        editedContent: null,
      } as unknown as Awaited<ReturnType<typeof prisma.queueItem.findUnique>>);

      await expect(publishService.markManualPublished("qi_1")).rejects.toThrow("readiness_blocked");
      expect(performanceRepo.createPublished).not.toHaveBeenCalled();
    });

    it("ready taslak DÜZENLEME OLMADAN yayınlanır (kozmetik edit-gate kalktı)", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue(
        readyItem as unknown as Awaited<ReturnType<typeof prisma.queueItem.findUnique>>
      );
      mockPublishWrites();

      const res = await publishService.markManualPublished("qi_1");
      expect(res.log.id).toBe("log_1");
      // Düzenlenmemiş ready çıktı → sahte "edited" öğrenme sinyali ÜRETİLMEZ.
      expect(processFeedback).not.toHaveBeenCalled();
    });

    it("düzenlenmiş ready taslak → PublishedPost provenance + 'edited' öğrenme sinyali", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
        ...readyItem,
        editedContent: "Temiz taslak — kendi sesimle yeniden yazdim, araci sahada test ettim.",
      } as unknown as Awaited<ReturnType<typeof prisma.queueItem.findUnique>>);
      mockPublishWrites();

      await publishService.markManualPublished("qi_1");

      expect(performanceRepo.createPublished).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "acc_1", platform: "x", draftQueueItemId: "qi_1" })
      );
      expect(processFeedback).toHaveBeenCalledWith(expect.objectContaining({ feedbackType: "edited" }));
    });
  });
});
