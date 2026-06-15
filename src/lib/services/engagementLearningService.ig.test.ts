import { describe, it, expect, vi, beforeEach } from "vitest";

// IG engagement arm uses the REAL igEngagement formula + REAL textSimilarity so
// scoring and grounding are exercised end to end; only IO is mocked.
vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: { findUnique: vi.fn() },
    feedbackEvent: { findMany: vi.fn() },
    viralPattern: { findMany: vi.fn() },
    queueItem: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/igInsightSnapshotRepo", () => ({
  igInsightSnapshotRepo: { listRecent: vi.fn() },
}));

vi.mock("@/lib/db/feedbackEventRepo", () => ({
  feedbackEventRepo: { create: vi.fn(() => Promise.resolve({ id: "fe-1" })) },
}));

vi.mock("@/lib/db/trainingExampleRepo", () => ({
  trainingExampleRepo: { create: vi.fn(() => Promise.resolve({ id: "te-1" })) },
}));

vi.mock("@/lib/db/viralPatternRepo", () => ({
  viralPatternRepo: { adjustSuccessScore: vi.fn(() => Promise.resolve({ id: "vp-ig" })) },
}));

vi.mock("@/lib/socialdata", () => ({
  fetchUserTweets: vi.fn(),
  calculateCost: (n: number) => n * 0.0002,
}));

vi.mock("@/lib/services/usageService", () => ({
  usageService: { recordScan: vi.fn(() => Promise.resolve()) },
}));

vi.mock("@/lib/growth-engine/vector-memory", () => ({
  embedTrainingExample: vi.fn(() => Promise.resolve([])),
}));

import { prisma } from "@/lib/db/client";
import { igInsightSnapshotRepo } from "@/lib/db/igInsightSnapshotRepo";
import { feedbackEventRepo } from "@/lib/db/feedbackEventRepo";
import { trainingExampleRepo } from "@/lib/db/trainingExampleRepo";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
import { embedTrainingExample } from "@/lib/growth-engine/vector-memory";
import { engagementLearningService } from "./engagementLearningService";

const CAPTION = "Yapay zeka ile logo tasarımı: 3 adımda profesyonel sonuç çıkardım, adımlar yorumda.";

function makeMedia(overrides: Record<string, unknown> = {}) {
  return {
    mediaId: "ig-1",
    caption: CAPTION,
    permalink: "https://instagram.com/p/abc",
    mediaType: "IMAGE",
    reach: 2000,
    likes: 200,
    saves: 10,
    shares: 5,
    comments: 20,
    ...overrides,
  };
}

function snapshotWith(media: Record<string, unknown>[]) {
  return [{ date: "2026-06-12", topMediaJson: JSON.stringify(media) }];
}

describe("engagementLearningService.syncInstagram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ id: "acc-ig", handle: "grafikcem" } as never);
    vi.mocked(prisma.feedbackEvent.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue([
      { id: "vp-ig", exampleGood: CAPTION },
    ] as never);
    delete process.env.IG_ENGAGEMENT_HIGH;
    delete process.env.IG_ENGAGEMENT_LOW;
  });

  it("scores a high media → IG feedback + pattern boost(+3) + training example", async () => {
    vi.mocked(igInsightSnapshotRepo.listRecent).mockResolvedValue(snapshotWith([makeMedia()]) as never);

    const s = await engagementLearningService.syncInstagram();

    expect(s.highs).toBe(1);
    expect(feedbackEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "instagram", feedbackType: "engagement_high" })
    );
    expect(viralPatternRepo.adjustSuccessScore).toHaveBeenCalledWith("vp-ig", 3);
    expect(s.patternsAdjusted).toBe(1);
    expect(trainingExampleRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "instagram", inputType: "ig_engagement", label: "good" })
    );
    expect(embedTrainingExample).toHaveBeenCalledWith("te-1");
  });

  it("scores a flop media → engagement_low(-2), no training example", async () => {
    vi.mocked(igInsightSnapshotRepo.listRecent).mockResolvedValue(
      snapshotWith([makeMedia({ likes: 8, saves: 0, shares: 0, comments: 0 })]) as never
    );

    const s = await engagementLearningService.syncInstagram();

    expect(s.lows).toBe(1);
    expect(feedbackEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ feedbackType: "engagement_low" })
    );
    expect(viralPatternRepo.adjustSuccessScore).toHaveBeenCalledWith("vp-ig", -2);
    expect(trainingExampleRepo.create).not.toHaveBeenCalled();
  });

  it("gives no verdict to mid-range engagement", async () => {
    vi.mocked(igInsightSnapshotRepo.listRecent).mockResolvedValue(
      snapshotWith([makeMedia({ likes: 40, saves: 0, shares: 0, comments: 0 })]) as never // score 20
    );

    const s = await engagementLearningService.syncInstagram();

    expect(s.highs).toBe(0);
    expect(s.lows).toBe(0);
    expect(feedbackEventRepo.create).not.toHaveBeenCalled();
  });

  it("does not reweight a pattern whose exemplar is dissimilar (below 0.7)", async () => {
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue([
      { id: "vp-ig", exampleGood: "Bambaşka bir konu: kahve demleme teknikleri ve sabah rutini." },
    ] as never);
    vi.mocked(igInsightSnapshotRepo.listRecent).mockResolvedValue(snapshotWith([makeMedia()]) as never);

    const s = await engagementLearningService.syncInstagram();

    expect(s.highs).toBe(1);
    expect(viralPatternRepo.adjustSuccessScore).not.toHaveBeenCalled();
    expect(s.patternsAdjusted).toBe(0);
  });

  it("is idempotent: media with an existing engagement event is skipped", async () => {
    vi.mocked(prisma.feedbackEvent.findMany).mockResolvedValue([
      { reason: JSON.stringify({ mediaId: "ig-1" }) },
    ] as never);
    vi.mocked(igInsightSnapshotRepo.listRecent).mockResolvedValue(snapshotWith([makeMedia()]) as never);

    const s = await engagementLearningService.syncInstagram();

    expect(s.skippedExisting).toBe(1);
    expect(feedbackEventRepo.create).not.toHaveBeenCalled();
  });

  it("fails open when there is no snapshot", async () => {
    vi.mocked(igInsightSnapshotRepo.listRecent).mockResolvedValue([] as never);

    const s = await engagementLearningService.syncInstagram();

    expect(s.reason).toBe("no_snapshot");
    expect(feedbackEventRepo.create).not.toHaveBeenCalled();
  });

  it("fails open when the IG account is missing", async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null as never);

    const s = await engagementLearningService.syncInstagram();

    expect(s.reason).toBe("ig_account_not_found");
  });
});
