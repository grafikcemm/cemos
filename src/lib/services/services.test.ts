 
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/accountRepo", () => ({
  accountRepo: { findByHandle: vi.fn(), findById: vi.fn() },
}));
vi.mock("@/lib/db/sourceRepo", () => ({
  sourceRepo: {
    listByAccount: vi.fn(),
    listEnabledByAccount: vi.fn(),
    findById: vi.fn(),
    findByAccountAndHandle: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
  },
}));
vi.mock("@/lib/db/sourcePostRepo", () => ({
  sourcePostRepo: { upsertByTweetId: vi.fn(), findById: vi.fn(), markUsed: vi.fn() },
}));
vi.mock("@/lib/db/scanRunRepo", () => ({
  scanRunRepo: { create: vi.fn(), finish: vi.fn() },
}));
vi.mock("@/lib/db/queueRepo", () => ({
  queueRepo: { create: vi.fn(), listByAccount: vi.fn(), findById: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/db/generationRunRepo", () => ({
  generationRunRepo: { create: vi.fn() },
}));
vi.mock("@/lib/services/usageService", () => ({
  usageService: {
    getRemainingDailyTweets: vi.fn(),
    recordScan: vi.fn(),
    recordGeneration: vi.fn(),
    getMonthlyCost: vi.fn().mockResolvedValue(0),
    getMonthlyOpenRouterCost: vi.fn().mockResolvedValue(0),
    getMonthlySpendByBudgetClass: vi.fn().mockResolvedValue(0),
    getTodayCost: vi.fn().mockResolvedValue(0),
  },
}));
vi.mock("@/lib/config/costGate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/costGate")>(
    "@/lib/config/costGate",
  );
  return {
    ...actual,
    getBudgetStatus: vi.fn(async () => ({
      allowed: true,
      spentUsd: 0,
      limitUsd: 10,
      remainingUsd: 10,
    })),
  };
});
vi.mock("@/lib/socialdata", () => ({
  fetchUserTweets: vi.fn(),
  meetsThreshold: vi.fn(),
  calculateCost: vi.fn(),
}));
vi.mock("@/lib/ai/draft-pipeline", () => ({
  runDraftPipeline: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    source: {
      update: vi.fn().mockResolvedValue({}),
    },
    sourcePost: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { sourceService } from "@/lib/services/sourceService";
import { scanService } from "@/lib/services/scanService";
import { draftService } from "@/lib/services/draftService";
import { accountRepo } from "@/lib/db/accountRepo";
import { sourceRepo } from "@/lib/db/sourceRepo";
import { sourcePostRepo } from "@/lib/db/sourcePostRepo";
import { scanRunRepo } from "@/lib/db/scanRunRepo";
import { queueRepo } from "@/lib/db/queueRepo";
import { generationRunRepo } from "@/lib/db/generationRunRepo";
import { usageService } from "@/lib/services/usageService";
import { fetchUserTweets, meetsThreshold, calculateCost } from "@/lib/socialdata";
import { runDraftPipeline } from "@/lib/ai/draft-pipeline";

// ── Fixtures ──────────────────────────────────────────────────────

const mockAccount = {
  id: "acc_001",
  handle: "grafikcem",
  xHandle: "@grafikcem",
  persona: "AI/tasarım içerik üreticisi",
  concept: "Türkçe AI içerikleri",
  maxChars: 280,
  platform: "x",
  createdAt: new Date("2024-01-01"),
};

const mockSource = {
  id: "src_001",
  accountId: "acc_001",
  handle: "testuser",
  displayName: null,
  enabled: true,
  mode: "TWEET",
  thresholdLikes: 50,
  thresholdRetweets: 5,
  archivedAt: null,
  createdAt: new Date("2024-01-01"),
  socialDataUserId: null,
  socialDataUserIdUpdatedAt: null,
};

const mockScanRun = {
  id: "sr_001",
  accountId: "acc_001",
  sourcesScanned: 0,
  tweetsFound: 0,
  postsInserted: 0,
  estimatedCostUsd: 0,
  errors: "[]",
  startedAt: new Date("2024-01-01"),
  finishedAt: null,
};

const mockQueueItem = {
  id: "qi_001",
  accountId: "acc_001",
  sourcePostId: null,
  content: "AI üretilmiş tweet içeriği",
  editedContent: null,
  draftType: "TWEET",
  mode: "default",
  status: "new",
  scheduledAt: null,
  publishedAt: null,
  estimatedCostUsd: 0.001,
  usedMock: false,
  scores: "{}",
  lintReport: null,
  candidatesJson: "[]",
  lastError: null,
  approvedAt: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
} as unknown as Awaited<ReturnType<typeof queueRepo.create>>;

const mockPipelineResult = {
  winner: { content: "AI üretilmiş tweet içeriği", scores: { quality: 8 } },
  estimatedCostUsd: 0.001,
  usedMock: false,
  modelUsed: "claude-haiku",
} as any;

const mockTweet = {
  id: "t_001",
  text: "Viral tweet içeriği",
  likeCount: 500,
  retweetCount: 100,
  viewCount: 10000,
  viralScore: 85,
  url: "https://x.com/testuser/status/t_001",
  createdAt: "2024-01-01T00:00:00Z",
};

beforeEach(() => { vi.clearAllMocks(); });

// ── sourceService ─────────────────────────────────────────────────

describe("sourceService.addSource", () => {
  it("throws INVALID_HANDLE for handles with spaces or special chars", async () => {
    await expect(
      sourceService.addSource({ accountHandle: "grafikcem", handle: "bad handle!" })
    ).rejects.toMatchObject({ code: "INVALID_HANDLE" });
    expect(accountRepo.findByHandle).not.toHaveBeenCalled();
  });

  it("throws INVALID_HANDLE for handles longer than 15 chars", async () => {
    await expect(
      sourceService.addSource({ accountHandle: "grafikcem", handle: "thisistoolongxxx" })
    ).rejects.toMatchObject({ code: "INVALID_HANDLE" });
  });

  it("throws ACCOUNT_NOT_FOUND when account does not exist", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(null);
    await expect(
      sourceService.addSource({ accountHandle: "nonexistent", handle: "validone" })
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
  });

  it("throws SELF_SOURCE when handle matches account xHandle", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(mockAccount);
    await expect(
      sourceService.addSource({ accountHandle: "grafikcem", handle: "grafikcem" })
    ).rejects.toMatchObject({ code: "SELF_SOURCE" });
  });

  it("throws DUPLICATE_SOURCE when source already registered", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(mockAccount);
    vi.mocked(sourceRepo.findByAccountAndHandle).mockResolvedValue(mockSource);
    await expect(
      sourceService.addSource({ accountHandle: "grafikcem", handle: "testuser" })
    ).rejects.toMatchObject({ code: "DUPLICATE_SOURCE" });
  });

  it("creates and returns source for valid new handle", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(mockAccount);
    vi.mocked(sourceRepo.findByAccountAndHandle).mockResolvedValue(null);
    vi.mocked(sourceRepo.create).mockResolvedValue(mockSource);

    const result = await sourceService.addSource({
      accountHandle: "grafikcem",
      handle: "newhandle",
      mode: "TWEET",
      thresholdLikes: 100,
    });

    expect(result).toEqual(mockSource);
    expect(sourceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ handle: "newhandle", accountId: "acc_001" })
    );
  });
});

describe("sourceService.listSources", () => {
  it("returns sources for a valid account", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(mockAccount);
    vi.mocked(sourceRepo.listByAccount).mockResolvedValue([mockSource]);

    const result = await sourceService.listSources("grafikcem");

    expect(result).toEqual([mockSource]);
    expect(sourceRepo.listByAccount).toHaveBeenCalledWith("acc_001");
  });
});

describe("sourceService.archiveSource", () => {
  it("throws NOT_FOUND when source does not exist", async () => {
    vi.mocked(sourceRepo.findById).mockResolvedValue(null);
    await expect(sourceService.archiveSource("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("delegates to sourceRepo.archive for an existing source", async () => {
    vi.mocked(sourceRepo.findById).mockResolvedValue(mockSource);
    vi.mocked(sourceRepo.archive).mockResolvedValue({ ...mockSource, archivedAt: new Date(), enabled: false });

    await sourceService.archiveSource("src_001");

    expect(sourceRepo.archive).toHaveBeenCalledWith("src_001");
  });
});

// ── scanService ───────────────────────────────────────────────────

describe("scanService.scanAccount", () => {
  it("returns early with error when daily tweet limit is exhausted", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(mockAccount);
    vi.mocked(scanRunRepo.create).mockResolvedValue(mockScanRun);
    vi.mocked(scanRunRepo.finish).mockResolvedValue({ ...mockScanRun, finishedAt: new Date() });
    vi.mocked(sourceRepo.listEnabledByAccount).mockResolvedValue([mockSource]);
    vi.mocked(usageService.getRemainingDailyTweets).mockResolvedValue(0);

    const result = await scanService.scanAccount("grafikcem");

    expect(result.sourcesScanned).toBe(0);
    expect(result.errors[0]).toMatch(/limit/i);
    expect(fetchUserTweets).not.toHaveBeenCalled();
  });

  it("skips posts that do not meet engagement threshold", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(mockAccount);
    vi.mocked(scanRunRepo.create).mockResolvedValue(mockScanRun);
    vi.mocked(scanRunRepo.finish).mockResolvedValue({ ...mockScanRun, finishedAt: new Date() });
    vi.mocked(sourceRepo.listEnabledByAccount).mockResolvedValue([mockSource]);
    vi.mocked(usageService.getRemainingDailyTweets).mockResolvedValue(500);
    vi.mocked(usageService.recordScan).mockResolvedValue(undefined as never);
    vi.mocked(fetchUserTweets).mockResolvedValue({ tweets: [mockTweet], twitterUserId: "t_001", lookupPerformed: false } as unknown as Awaited<ReturnType<typeof fetchUserTweets>>);
    vi.mocked(meetsThreshold).mockReturnValue(false);
    vi.mocked(calculateCost).mockReturnValue(0.0001);

    const result = await scanService.scanAccount("grafikcem");

    expect(result.postsInserted).toBe(0);
    expect(sourcePostRepo.upsertByTweetId).not.toHaveBeenCalled();
  });

  it("upserts posts that meet engagement threshold", async () => {
    const mockPost = { id: "sp_001", accountId: "acc_001", sourceId: "src_001", tweetId: "t_001", text: mockTweet.text, likeCount: 500, retweetCount: 100, viewCount: 10000, viralScore: 85, url: mockTweet.url, opportunityScore: 0.85, status: "new", publishedAt: null, scannedAt: new Date() } as unknown as Awaited<ReturnType<typeof sourcePostRepo.upsertByTweetId>>;
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(mockAccount);
    vi.mocked(scanRunRepo.create).mockResolvedValue(mockScanRun);
    vi.mocked(scanRunRepo.finish).mockResolvedValue({ ...mockScanRun, finishedAt: new Date() });
    vi.mocked(sourceRepo.listEnabledByAccount).mockResolvedValue([mockSource]);
    vi.mocked(usageService.getRemainingDailyTweets).mockResolvedValue(500);
    vi.mocked(usageService.recordScan).mockResolvedValue(undefined as never);
    vi.mocked(fetchUserTweets).mockResolvedValue({ tweets: [mockTweet], twitterUserId: "t_001", lookupPerformed: false } as unknown as Awaited<ReturnType<typeof fetchUserTweets>>);
    vi.mocked(meetsThreshold).mockReturnValue(true);
    vi.mocked(calculateCost).mockReturnValue(0.0001);
    vi.mocked(sourcePostRepo.upsertByTweetId).mockResolvedValue(mockPost);

    const result = await scanService.scanAccount("grafikcem");

    expect(result.postsInserted).toBe(1);
    expect(sourcePostRepo.upsertByTweetId).toHaveBeenCalledWith(
      expect.objectContaining({ tweetId: "t_001", accountId: "acc_001" })
    );
  });

  it("records ScanRun and UsageLog on scan completion", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(mockAccount);
    vi.mocked(scanRunRepo.create).mockResolvedValue(mockScanRun);
    vi.mocked(scanRunRepo.finish).mockResolvedValue({ ...mockScanRun, finishedAt: new Date() });
    vi.mocked(sourceRepo.listEnabledByAccount).mockResolvedValue([]);
    vi.mocked(usageService.getRemainingDailyTweets).mockResolvedValue(500);
    vi.mocked(usageService.recordScan).mockResolvedValue(undefined as never);

    await scanService.scanAccount("grafikcem");

    expect(scanRunRepo.finish).toHaveBeenCalledWith(
      "sr_001",
      expect.objectContaining({ sourcesScanned: 0, tweetsFound: 0 })
    );
    expect(usageService.recordScan).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acc_001" })
    );
  });
});

// ── draftService ──────────────────────────────────────────────────

describe("draftService.generateDraft", () => {
  beforeEach(() => {
    vi.mocked(generationRunRepo.create).mockResolvedValue({
      id: "gr_001", accountId: "acc_001", queueItemId: "qi_001",
      modelUsed: "claude-haiku", estimatedCostUsd: 0.001, usedMock: false, createdAt: new Date(),
    });
    vi.mocked(usageService.recordGeneration).mockResolvedValue(undefined as never);
    vi.mocked(runDraftPipeline).mockResolvedValue(mockPipelineResult);
  });

  it("creates QueueItem with pipeline content and correct accountId", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(mockAccount);
    vi.mocked(queueRepo.create).mockResolvedValue(mockQueueItem);

    const result = await draftService.generateDraft({
      accountHandle: "grafikcem",
      sourceTweet: "Test kaynak tweet",
      draftType: "TWEET",
    });

    expect(result.generated).toBe("AI üretilmiş tweet içeriği");
    expect(queueRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acc_001", draftType: "TWEET" })
    );
    expect(generationRunRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acc_001", queueItemId: "qi_001" })
    );
  });

  it("marks SourcePost as used when sourcePostId is provided", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(mockAccount);
    vi.mocked(sourcePostRepo.findById).mockResolvedValue({
      id: "sp_001", accountId: "acc_001", sourceId: "src_001", tweetId: "t_001",
      text: "kaynak metin", likeCount: 100, retweetCount: 20, viewCount: 1000,
      viralScore: 70, url: "https://x.com/t/1", opportunityScore: 0.7,
      status: "new", publishedAt: null, scannedAt: new Date(),
    } as unknown as Awaited<ReturnType<typeof sourcePostRepo.findById>>);
    vi.mocked(queueRepo.create).mockResolvedValue({ ...mockQueueItem, sourcePostId: "sp_001" });
    vi.mocked(sourcePostRepo.markUsed).mockResolvedValue({ id: "sp_001" } as never);

    await draftService.generateDraft({
      accountHandle: "grafikcem",
      sourcePostId: "sp_001",
      draftType: "TWEET",
    });

    expect(sourcePostRepo.markUsed).toHaveBeenCalledWith("sp_001");
  });

  it("does not call markUsed when no sourcePostId provided", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(mockAccount);
    vi.mocked(queueRepo.create).mockResolvedValue(mockQueueItem);

    await draftService.generateDraft({
      accountHandle: "grafikcem",
      sourceTweet: "Direkt kaynak tweet",
      draftType: "TWEET",
    });

    expect(sourcePostRepo.markUsed).not.toHaveBeenCalled();
  });
});
