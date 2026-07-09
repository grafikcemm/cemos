import { describe, it, expect, vi, beforeEach } from "vitest";

const DRAFT_TEXT =
  "Midjourney v8 testi: 4 saatlik moodboard işini 12 dakikaya indirdim. Kurulum adımları thread'de.";
const OTHER_TEXT = "Bugün hava çok güzel, sahilde yürüyüş yaptık ve kahve içtik.";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: { findUnique: vi.fn() },
    queueItem: { findMany: vi.fn() },
    feedbackEvent: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/socialdata", () => ({
  fetchUserTweets: vi.fn(),
  calculateCost: (n: number) => n * 0.0002,
}));

vi.mock("@/lib/db/feedbackEventRepo", () => ({
  feedbackEventRepo: { create: vi.fn(() => Promise.resolve({ id: "fe-1" })) },
}));

vi.mock("@/lib/db/trainingExampleRepo", () => ({
  trainingExampleRepo: { create: vi.fn(() => Promise.resolve({ id: "te-1" })) },
}));

vi.mock("@/lib/db/viralPatternRepo", () => ({
  viralPatternRepo: { adjustSuccessScore: vi.fn(() => Promise.resolve({ id: "vp-1" })) },
}));

vi.mock("@/lib/db/performanceRepo", () => ({
  performanceRepo: {
    // Default: no draft has a PublishedPost → snapshot path is a no-op, so the
    // pre-existing engagement cases are unaffected.
    findByDraftQueueItemIds: vi.fn(() => Promise.resolve(new Map())),
    upsertSnapshot: vi.fn(() => Promise.resolve({ id: "ps-1" })),
  },
}));

vi.mock("@/lib/services/usageService", () => ({
  usageService: { recordScan: vi.fn(() => Promise.resolve()) },
}));

vi.mock("@/lib/growth-engine/vector-memory", () => ({
  embedTrainingExample: vi.fn(() => Promise.resolve([])),
}));

import { prisma } from "@/lib/db/client";
import { fetchUserTweets } from "@/lib/socialdata";
import { feedbackEventRepo } from "@/lib/db/feedbackEventRepo";
import { trainingExampleRepo } from "@/lib/db/trainingExampleRepo";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
import { performanceRepo } from "@/lib/db/performanceRepo";
import { usageService } from "@/lib/services/usageService";
import { embedTrainingExample } from "@/lib/growth-engine/vector-memory";
import { engagementLearningService } from "./engagementLearningService";

const mockAccount = { id: "acc-1", handle: "grafikcem" };

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "qi-1",
    content: DRAFT_TEXT,
    editedContent: null,
    scores: JSON.stringify({ publishScore: 88, groundingPatternIds: ["vp-1", "vp-2"] }),
    ...overrides,
  };
}

function makeTweet(overrides: Record<string, unknown> = {}) {
  return {
    id: "tw-1",
    handle: "grafikcem",
    text: DRAFT_TEXT,
    createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(), // 3 days old
    likeCount: 20,
    retweetCount: 4,
    replyCount: 3,
    quoteCount: 0,
    viewCount: 2200,
    url: "https://x.com/grafikcem/status/tw-1",
    viralScore: 0,
    ...overrides,
  };
}

describe("engagementLearningService.syncForAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.account.findUnique).mockResolvedValue(mockAccount as never);
    vi.mocked(prisma.feedbackEvent.findMany).mockResolvedValue([] as never);
    vi.mocked(fetchUserTweets).mockResolvedValue({
      tweets: [makeTweet()],
      twitterUserId: "123",
      lookupPerformed: false,
      retweetsFiltered: 0,
    } as never);
    delete process.env.ENGAGEMENT_HIGH_MIN;
    delete process.env.ENGAGEMENT_LOW_MAX;
  });

  it("exits without any SocialData call when there are no candidates", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([] as never);

    const summary = await engagementLearningService.syncForAccount("grafikcem");

    expect(summary.reason).toBe("no_candidates");
    expect(fetchUserTweets).not.toHaveBeenCalled();
  });

  it("records engagement_high, boosts grounded patterns and creates a training example", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([makeItem()] as never);

    const summary = await engagementLearningService.syncForAccount("grafikcem");

    expect(summary.matched).toBe(1);
    expect(summary.highs).toBe(1);
    expect(feedbackEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ queueItemId: "qi-1", feedbackType: "engagement_high" })
    );
    expect(viralPatternRepo.adjustSuccessScore).toHaveBeenCalledWith("vp-1", 3);
    expect(viralPatternRepo.adjustSuccessScore).toHaveBeenCalledWith("vp-2", 3);
    expect(summary.patternsAdjusted).toBe(2);
    expect(trainingExampleRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ label: "good", inputType: "engagement_metric" })
    );
    expect(embedTrainingExample).toHaveBeenCalledWith("te-1");
    expect(usageService.recordScan).toHaveBeenCalled();
  });

  it("records a windowed PerformanceSnapshot for a matched draft that was published", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([makeItem()] as never);
    // This draft WAS recorded in the publication ledger (manual publish).
    vi.mocked(performanceRepo.findByDraftQueueItemIds).mockResolvedValue(
      new Map([["qi-1", { id: "pp-1" }]]) as never
    );

    const summary = await engagementLearningService.syncForAccount("grafikcem");

    expect(summary.snapshots).toBe(1);
    // 72h-old tweet → "3d" maturity window; normalizedScore = raw engagement.
    expect(performanceRepo.upsertSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ publishedPostId: "pp-1", window: "3d" })
    );
  });

  it("records a snapshot even for a mid-range matched tweet that earns NO verdict", async () => {
    // score 5 sits between lowMax(2) and highMin(15) → no HIGH/LOW verdict, but
    // its real performance must still reach the lessonGate population.
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([makeItem()] as never);
    vi.mocked(performanceRepo.findByDraftQueueItemIds).mockResolvedValue(
      new Map([["qi-1", { id: "pp-1" }]]) as never
    );
    vi.mocked(fetchUserTweets).mockResolvedValue({
      tweets: [makeTweet({ likeCount: 5, retweetCount: 0, replyCount: 0 })],
      twitterUserId: "123",
      lookupPerformed: false,
      retweetsFiltered: 0,
    } as never);

    const summary = await engagementLearningService.syncForAccount("grafikcem");

    expect(summary.matched).toBe(1);
    expect(summary.highs).toBe(0);
    expect(summary.lows).toBe(0);
    expect(summary.snapshots).toBe(1); // measured despite no verdict
    expect(performanceRepo.upsertSnapshot).toHaveBeenCalled();
    expect(feedbackEventRepo.create).not.toHaveBeenCalled();
  });

  it("records engagement_low with -2 pattern delta for matured flops", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([makeItem()] as never);
    vi.mocked(fetchUserTweets).mockResolvedValue({
      tweets: [makeTweet({ likeCount: 1, retweetCount: 0, replyCount: 0 })],
      twitterUserId: "123",
      lookupPerformed: false,
      retweetsFiltered: 0,
    } as never);

    const summary = await engagementLearningService.syncForAccount("grafikcem");

    expect(summary.lows).toBe(1);
    expect(feedbackEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ feedbackType: "engagement_low" })
    );
    expect(viralPatternRepo.adjustSuccessScore).toHaveBeenCalledWith("vp-1", -2);
    expect(trainingExampleRepo.create).not.toHaveBeenCalled();
  });

  it("gives NO verdict to a fresh low-engagement tweet (still maturing)", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([makeItem()] as never);
    vi.mocked(fetchUserTweets).mockResolvedValue({
      tweets: [
        makeTweet({
          likeCount: 1,
          retweetCount: 0,
          replyCount: 0,
          createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6h old
        }),
      ],
      twitterUserId: "123",
      lookupPerformed: false,
      retweetsFiltered: 0,
    } as never);

    const summary = await engagementLearningService.syncForAccount("grafikcem");

    expect(summary.matched).toBe(1);
    expect(summary.highs).toBe(0);
    expect(summary.lows).toBe(0);
    expect(feedbackEventRepo.create).not.toHaveBeenCalled();
  });

  it("is idempotent: items with an existing engagement event are skipped", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([makeItem()] as never);
    vi.mocked(prisma.feedbackEvent.findMany).mockResolvedValue([
      { queueItemId: "qi-1" },
    ] as never);

    const summary = await engagementLearningService.syncForAccount("grafikcem");

    expect(summary.skippedExisting).toBe(1);
    expect(summary.reason).toBe("all_already_judged");
    expect(fetchUserTweets).not.toHaveBeenCalled();
  });

  it("does not match unrelated tweets", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([makeItem()] as never);
    vi.mocked(fetchUserTweets).mockResolvedValue({
      tweets: [makeTweet({ text: OTHER_TEXT })],
      twitterUserId: "123",
      lookupPerformed: false,
      retweetsFiltered: 0,
    } as never);

    const summary = await engagementLearningService.syncForAccount("grafikcem");

    expect(summary.matched).toBe(0);
    expect(summary.reason).toBe("no_matches");
    expect(feedbackEventRepo.create).not.toHaveBeenCalled();
  });

  it("survives a SocialData failure without throwing", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([makeItem()] as never);
    vi.mocked(fetchUserTweets).mockRejectedValue(new Error("rate limited"));

    const summary = await engagementLearningService.syncForAccount("grafikcem");

    expect(summary.errors).toBe(1);
    expect(summary.reason).toBe("timeline_fetch_failed");
  });
});
