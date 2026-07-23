import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { POST as POSTIgnore } from "./source-posts/[id]/ignore/route";
import { POST as POSTReviewed } from "./source-posts/[id]/mark-reviewed/route";
import { POST as POSTQueue } from "./source-posts/[id]/send-to-queue/route";
import { POST as POSTSavePattern } from "./source-posts/[id]/save-pattern/route";
import { prisma } from "@/lib/db/client";
import { processFeedback } from "@/lib/growth-engine/feedback-service";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: {
      findMany: vi.fn()
    },
    source: {
      findMany: vi.fn()
    },
    sourcePost: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn() // M9: save-pattern atomik claim
    }
  }
}));

vi.mock("@/lib/growth-engine/feedback-service", () => ({
  processFeedback: vi.fn()
}));

describe("Flow Radar API Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default accounts mocking
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: "acc-grafik", handle: "grafikcem", displayName: "GrafikCem" },
      { id: "acc-mask", handle: "maskulenkod", displayName: "MaskulenKod" }
    ] as any);

    vi.mocked(prisma.source.findMany).mockResolvedValue([]);
    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([]);
  });

  const createGetRequest = (query: Record<string, string>) => {
    const q = new URLSearchParams(query);
    return new NextRequest(`http://localhost:3000/api/growth/flow-radar?${q.toString()}`, {
      method: "GET"
    });
  };

  const createPostRequest = () => {
    return new NextRequest("http://localhost:3000/api/growth/flow-radar/source-posts/post-1", {
      method: "POST"
    });
  };

  // ==========================================
  // GET Endpoint Tests (15 Tests)
  // ==========================================

  it("1. calculates summary statistics correctly on empty database state", async () => {
    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.summary).toEqual({
      totalCandidates: 0,
      highOpportunity: 0,
      highRisk: 0,
      tweetCandidates: 0,
      quoteCandidates: 0,
      replyCandidates: 0,
      ignored: 0,
      averageOpportunityScore: 0
    });
    expect(json.candidates).toEqual([]);
  });

  it("2. computes summary counts correctly for high opportunity and risk posts", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", mode: "TWEET" }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "Figma ve midjourney v7 tasarim aracları ai yapay zeka", likeCount: 50, retweetCount: 15, opportunityScore: 0.85, status: "new", scannedAt: new Date() },
      { id: "post-2", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-2", text: "Hakaret içeren son derece riskli ve nefret dolu amk küfür içerik", likeCount: 5, retweetCount: 1, opportunityScore: 0.20, status: "new", scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.summary.totalCandidates).toBe(2);
    expect(json.summary.highOpportunity).toBe(1);
    expect(json.summary.highRisk).toBe(1);
    expect(json.summary.averageOpportunityScore).toBe(53); // (85 + 20) / 2
  });

  it("3. filters correctly by accountHandle", async () => {
    const req = createGetRequest({ account: "grafikcem" });
    await GET(req);

    expect(prisma.source.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: { in: ["acc-grafik"] }
        })
      })
    );
  });

  it("4. filters correctly by suggested action (tweet)", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", mode: "TWEET" }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "Figma ve midjourney v7 tasarim aracları ai yapay zeka", likeCount: 50, retweetCount: 15, opportunityScore: 85, status: "new", scannedAt: new Date() },
      { id: "post-2", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-2", text: "Hakaret içeren son derece riskli ve nefret dolu amk küfür içerik", likeCount: 5, retweetCount: 1, opportunityScore: 20, status: "new", scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({ action: "tweet" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.candidates.length).toBe(1);
    expect(json.candidates[0].id).toBe("post-1");
  });

  it("5. filters correctly by risk level (low)", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", mode: "TWEET" }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "Figma ve midjourney v7 tasarim aracları ai yapay zeka", likeCount: 50, retweetCount: 15, opportunityScore: 85, status: "new", scannedAt: new Date() },
      { id: "post-2", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-2", text: "Hakaret içeren amk küfür içerik", likeCount: 5, retweetCount: 1, opportunityScore: 20, status: "new", scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({ risk: "low" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.candidates.length).toBe(1);
    expect(json.candidates[0].id).toBe("post-1");
  });

  it("6. filters correctly by post status (reviewed)", async () => {
    const req = createGetRequest({ status: "reviewed" });
    await GET(req);

    expect(prisma.sourcePost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "reviewed"
        })
      })
    );
  });

  it("7. filters correctly by minOpportunity threshold", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", mode: "TWEET" }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "AI tech news design", likeCount: 10, retweetCount: 2, opportunityScore: 40, status: "new", scannedAt: new Date() },
      { id: "post-2", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-2", text: "Midjourney v7 yapay zeka", likeCount: 100, retweetCount: 25, opportunityScore: 90, status: "new", scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({ minOpportunity: "80" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.candidates.length).toBe(1);
    expect(json.candidates[0].id).toBe("post-2");
  });

  it("8. applies text search correctly", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", mode: "TWEET" }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "Midjourney v7", likeCount: 10, retweetCount: 2, opportunityScore: 50, status: "new", scannedAt: new Date() },
      { id: "post-2", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-2", text: "Stoic discipline", likeCount: 10, retweetCount: 2, opportunityScore: 50, status: "new", scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({ search: "midjourney" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.candidates.length).toBe(1);
    expect(json.candidates[0].content).toContain("Midjourney");
  });

  it("9. applies sorting correctly by opportunityScore desc", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", mode: "TWEET" }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "AI post", likeCount: 10, retweetCount: 2, opportunityScore: 60, status: "new", scannedAt: new Date() },
      { id: "post-2", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-2", text: "Figma design v7", likeCount: 10, retweetCount: 2, opportunityScore: 90, status: "new", scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({ sort: "opportunityScore" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.candidates[0].id).toBe("post-2");
  });

  it("10. applies sorting correctly by riskScore desc", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", mode: "TWEET" }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "Hakaret içeren son derece riskli amk küfür içerik", likeCount: 10, retweetCount: 2, opportunityScore: 20, status: "new", scannedAt: new Date() },
      { id: "post-2", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-2", text: "AI post design", likeCount: 10, retweetCount: 2, opportunityScore: 60, status: "new", scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({ sort: "riskScore" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.candidates[0].id).toBe("post-1");
  });

  it("11. applies sorting correctly by publishedAt desc", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", mode: "TWEET" }
    ] as any);

    const dateOld = new Date("2026-01-01");
    const dateNew = new Date("2026-05-28");

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "old post", likeCount: 10, retweetCount: 2, opportunityScore: 50, status: "new", publishedAt: dateOld, scannedAt: new Date() },
      { id: "post-2", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-2", text: "new post", likeCount: 10, retweetCount: 2, opportunityScore: 50, status: "new", publishedAt: dateNew, scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({ sort: "publishedAt" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.candidates[0].id).toBe("post-2");
  });

  it("12. applies sorting correctly by scannedAt desc", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", mode: "TWEET" }
    ] as any);

    const dateOld = new Date("2026-01-01");
    const dateNew = new Date("2026-05-28");

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "old scan", likeCount: 10, retweetCount: 2, opportunityScore: 50, status: "new", scannedAt: dateOld },
      { id: "post-2", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-2", text: "new scan", likeCount: 10, retweetCount: 2, opportunityScore: 50, status: "new", scannedAt: dateNew }
    ] as any);

    const req = createGetRequest({ sort: "scannedAt" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.candidates[0].id).toBe("post-2");
  });

  it("13. applies sorting correctly by viralScore desc", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", mode: "TWEET" }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "low engagement", likeCount: 5, retweetCount: 1, viralScore: 10, opportunityScore: 50, status: "new", scannedAt: new Date() },
      { id: "post-2", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-2", text: "high engagement", likeCount: 500, retweetCount: 100, viralScore: 999, opportunityScore: 50, status: "new", scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({ sort: "viralScore" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.candidates[0].id).toBe("post-2");
  });

  it("14. tolerates unknown accountId values gracefully without crashes", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "unknown-account-uuid", handle: "roguesource", enabled: true, thresholdLikes: 10, thresholdRetweets: 2, createdAt: new Date() }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "unknown-account-uuid", sourceId: "src-1", tweetId: "tw-1", text: "AI midjourney design", likeCount: 50, retweetCount: 15, opportunityScore: 85, status: "new", scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.candidates[0].accountHandle).toBe("unknown");
  });

  it("15. returns 500 error when database query crashes", async () => {
    vi.mocked(prisma.account.findMany).mockRejectedValue(new Error("Database crash"));

    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Database crash");
  });

  // ==========================================
  // POST Ignore Endpoint Tests (3 Tests)
  // ==========================================

  it("16. soft-ignores candidate successfully (updates status to ignored)", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue({ id: "post-1", status: "new" } as any);
    vi.mocked(prisma.sourcePost.update).mockResolvedValue({ id: "post-1", status: "ignored" } as any);

    const req = createPostRequest();
    const res = await POSTIgnore(req, { params: Promise.resolve({ id: "post-1" }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.post.status).toBe("ignored");
  });

  it("17. returns 404 if post to ignore is not found", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue(null);

    const req = createPostRequest();
    const res = await POSTIgnore(req, { params: Promise.resolve({ id: "non-existent" }) });
    expect(res.status).toBe(404);
  });

  it("18. returns 500 on database crash in ignore endpoint", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockRejectedValue(new Error("Disk full"));

    const req = createPostRequest();
    const res = await POSTIgnore(req, { params: Promise.resolve({ id: "post-1" }) });
    expect(res.status).toBe(500);
  });

  // ==========================================
  // POST Mark-Reviewed Endpoint Tests (2 Tests)
  // ==========================================

  it("19. marks candidate reviewed successfully (updates status to reviewed)", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue({ id: "post-1", status: "new" } as any);
    vi.mocked(prisma.sourcePost.update).mockResolvedValue({ id: "post-1", status: "reviewed" } as any);

    const req = createPostRequest();
    const res = await POSTReviewed(req, { params: Promise.resolve({ id: "post-1" }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.post.status).toBe("reviewed");
  });

  it("20. returns 404 if post to mark reviewed is not found", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue(null);

    const req = createPostRequest();
    const res = await POSTReviewed(req, { params: Promise.resolve({ id: "non-existent" }) });
    expect(res.status).toBe(404);
  });

  // ==========================================
  // POST Send-to-queue Endpoint Tests (1 Test)
  // ==========================================

  it("21. returns correct placeholder response for send-to-queue", async () => {
    const req = createPostRequest();
    const res = await POSTQueue(req, { params: Promise.resolve({ id: "post-1" }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.placeholder).toBe(true);
    expect(json.message).toContain("Sprint 10");
  });

  // ==========================================
  // POST Save-pattern Endpoint Tests (4 Tests)
  // ==========================================

  it("22. executes save-pattern and triggers Feedback API processFeedback successfully", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue({
      id: "post-1",
      accountId: "acc-grafik",
      text: "Figma yapay zeka güncellemesi tasarim",
      account: { id: "acc-grafik", handle: "grafikcem" }
    } as any);

    vi.mocked(prisma.sourcePost.updateMany).mockResolvedValue({ count: 1 } as any); // M9: claim kazanır
    // viralPatternId zorunlu: route artık desen gerçekten yazılmadan 200 dönmez (CODE-M1).
    vi.mocked(processFeedback).mockResolvedValue({
      success: true,
      feedbackEventId: "fb-event-1",
      viralPatternId: "vp-1",
    });

    const req = createPostRequest();
    const res = await POSTSavePattern(req, { params: Promise.resolve({ id: "post-1" }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.feedbackResult.success).toBe(true);

    expect(processFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        accountHandle: "grafikcem",
        feedbackType: "saved_as_pattern",
        saveAsPattern: true
      })
    );
  });

  it("23. updates source post status to used upon successful save-pattern feedback loop", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue({
      id: "post-1",
      accountId: "acc-grafik",
      text: "Figma yapay zeka güncellemesi tasarim",
      account: { id: "acc-grafik", handle: "grafikcem" }
    } as any);

    vi.mocked(prisma.sourcePost.updateMany).mockResolvedValue({ count: 1 } as any); // M9: claim kazanır
    vi.mocked(processFeedback).mockResolvedValue({ success: true });

    const req = createPostRequest();
    await POSTSavePattern(req, { params: Promise.resolve({ id: "post-1" }) });

    expect(prisma.sourcePost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "post-1", status: { not: "used" } }, // atomik claim (ücretli çağrıdan ÖNCE)
        data: { status: "used" }
      })
    );
  });

  it("24. returns 404 if post to save pattern is not found", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue(null);

    const req = createPostRequest();
    const res = await POSTSavePattern(req, { params: Promise.resolve({ id: "non-existent" }) });
    expect(res.status).toBe(404);
  });

  it("25. returns 500 on database crash in save-pattern endpoint", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockRejectedValue(new Error("Database disconnected"));

    const req = createPostRequest();
    const res = await POSTSavePattern(req, { params: Promise.resolve({ id: "post-1" }) });
    expect(res.status).toBe(500);
  });
});
