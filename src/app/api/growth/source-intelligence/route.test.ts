import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { POST as POSTScore } from "./source-posts/[id]/score/route";
import { prisma } from "@/lib/db/client";
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
      update: vi.fn()
    }
  }
}));

describe("Source Intelligence API Suite", () => {
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
    return new NextRequest(`http://localhost:3000/api/growth/source-intelligence?${q.toString()}`, {
      method: "GET"
    });
  };

  const createPostRequest = (body: any = {}) => {
    return new NextRequest("http://localhost:3000/api/growth/source-intelligence/source-posts/post-1/score", {
      method: "POST",
      body: JSON.stringify(body)
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
      totalSources: 0,
      activeSources: 0,
      inactiveSources: 0,
      totalSourcePosts: 0,
      highOpportunityPosts: 0,
      highRiskPosts: 0,
      averageOpportunityScore: 0,
      topSourceHandle: ""
    });
    expect(json.sources).toEqual([]);
    expect(json.sourcePosts).toEqual([]);
  });

  it("2. computes summary cards counts correctly for active/inactive sources", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", enabled: true, thresholdLikes: 10, thresholdRetweets: 2, createdAt: new Date() },
      { id: "src-2", accountId: "acc-mask", handle: "stoicsource", enabled: false, thresholdLikes: 20, thresholdRetweets: 5, createdAt: new Date() }
    ] as any);

    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.summary.totalSources).toBe(2);
    expect(json.summary.activeSources).toBe(1);
    expect(json.summary.inactiveSources).toBe(1);
  });

  it("3. filters correctly by accountHandle", async () => {
    const req = createGetRequest({ account: "grafikcem" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    // Should only query for account: acc-grafik
    expect(prisma.source.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: { in: ["acc-grafik"] }
        })
      })
    );
  });

  it("4. filters correctly by active status (enabled = true)", async () => {
    const req = createGetRequest({ status: "active" });
    await GET(req);

    expect(prisma.source.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enabled: true
        })
      })
    );
  });

  it("5. filters correctly by inactive status (enabled = false)", async () => {
    const req = createGetRequest({ status: "inactive" });
    await GET(req);

    expect(prisma.source.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enabled: false
        })
      })
    );
  });

  it("6. filters correctly by sourceType (mode = TWEET)", async () => {
    const req = createGetRequest({ sourceType: "tweet" });
    await GET(req);

    expect(prisma.source.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mode: "TWEET"
        })
      })
    );
  });

  it("7. computes dynamic scores and filters correctly by action (tweet)", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", enabled: true, thresholdLikes: 10, thresholdRetweets: 2, createdAt: new Date() }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      {
        id: "post-1",
        accountId: "acc-grafik",
        sourceId: "src-1",
        tweetId: "tw-1",
        text: "Yeni Midjourney v7 güncellemesi yayınlandı, harika tasarım araçları içeriyor! ai yapay zeka tasarım",
        likeCount: 50,
        retweetCount: 15,
        opportunityScore: 85,
        status: "new",
        scannedAt: new Date()
      },
      {
        id: "post-2",
        accountId: "acc-grafik",
        sourceId: "src-1",
        tweetId: "tw-2",
        text: "Hakaret içeren son derece riskli ve nefret dolu amk küfür içerik",
        likeCount: 5,
        retweetCount: 1,
        opportunityScore: 20,
        status: "new",
        scannedAt: new Date()
      }
    ] as any);

    const req = createGetRequest({ action: "tweet" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    // High relevance post should be recommended for tweet or reply, not ignored. The risk post should be ignore
    expect(json.sourcePosts.length).toBeGreaterThanOrEqual(1);
    expect(json.sourcePosts[0].id).toBe("post-1");
  });

  it("8. filters correctly by high risk score", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", enabled: true, thresholdLikes: 10, thresholdRetweets: 2, createdAt: new Date() }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      {
        id: "post-1",
        accountId: "acc-grafik",
        sourceId: "src-1",
        tweetId: "tw-1",
        text: "Hakaret içeren son derece riskli ve nefret dolu amk küfür içerik",
        likeCount: 5,
        retweetCount: 1,
        opportunityScore: 20,
        status: "new",
        scannedAt: new Date()
      }
    ] as any);

    const req = createGetRequest({ risk: "high" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.sourcePosts.length).toBe(1);
    expect(json.summary.highRiskPosts).toBe(1);
  });

  it("9. applies text search in post text content", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", enabled: true, thresholdLikes: 10, thresholdRetweets: 2, createdAt: new Date() }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "Midjourney v7", likeCount: 50, retweetCount: 15, opportunityScore: 85, status: "new", scannedAt: new Date() },
      { id: "post-2", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-2", text: "Stoic discipline", likeCount: 50, retweetCount: 15, opportunityScore: 85, status: "new", scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({ search: "midjourney" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.sourcePosts.length).toBe(1);
    expect(json.sourcePosts[0].text).toContain("Midjourney");
  });

  it("10. applies sorting correctly by opportunityScore", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", enabled: true, thresholdLikes: 10, thresholdRetweets: 2, createdAt: new Date() }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "AI news article", likeCount: 10, retweetCount: 2, opportunityScore: 50, status: "new", scannedAt: new Date() },
      { id: "post-2", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-2", text: "Huge viral shift AI", likeCount: 999, retweetCount: 200, opportunityScore: 95, status: "new", scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({ sort: "opportunityScore" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.sourcePosts[0].id).toBe("post-2"); // highest opportunity score first
  });

  it("11. applies sorting correctly by riskScore", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", enabled: true, thresholdLikes: 10, thresholdRetweets: 2, createdAt: new Date() }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "Hakaret içeren son derece riskli ve nefret dolu amk küfür içerik", likeCount: 5, retweetCount: 1, opportunityScore: 20, status: "new", scannedAt: new Date() },
      { id: "post-2", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-2", text: "Midjourney v7 yapay zeka", likeCount: 50, retweetCount: 15, opportunityScore: 85, status: "new", scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({ sort: "riskScore" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.sourcePosts[0].id).toBe("post-1"); // highest riskScore first
  });

  it("12. applies sorting correctly by sourceWeight (thresholdLikes)", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", enabled: true, thresholdLikes: 10, thresholdRetweets: 2, createdAt: new Date() },
      { id: "src-2", accountId: "acc-grafik", handle: "vipsource", enabled: true, thresholdLikes: 250, thresholdRetweets: 50, createdAt: new Date() }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "AI text", likeCount: 50, retweetCount: 15, opportunityScore: 80, status: "new", scannedAt: new Date() },
      { id: "post-2", accountId: "acc-grafik", sourceId: "src-2", tweetId: "tw-2", text: "VIP text", likeCount: 50, retweetCount: 15, opportunityScore: 80, status: "new", scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({ sort: "sourceWeight" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.sourcePosts[0].id).toBe("post-2"); // belongs to VIP source (thresholdLikes = 250) first
  });

  it("13. tolerates unknown accountId values gracefully without crashes", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "unknown-account-uuid", handle: "roguesource", enabled: true, thresholdLikes: 10, thresholdRetweets: 2, createdAt: new Date() }
    ] as any);

    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.sources[0].accountHandle).toBe("unknown");
  });

  it("14. loads aggregate summaries correctly", async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      { id: "src-1", accountId: "acc-grafik", handle: "aisource", enabled: true, thresholdLikes: 10, thresholdRetweets: 2, createdAt: new Date() }
    ] as any);

    vi.mocked(prisma.sourcePost.findMany).mockResolvedValue([
      { id: "post-1", accountId: "acc-grafik", sourceId: "src-1", tweetId: "tw-1", text: "AI midjourney news", likeCount: 99, retweetCount: 15, opportunityScore: 90, status: "new", scannedAt: new Date() }
    ] as any);

    const req = createGetRequest({});
    const res = await GET(req);
    const json = await res.json();

    expect(json.summary.averageOpportunityScore).toBeGreaterThan(0);
    expect(json.summary.topSourceHandle).toBe("aisource");
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
  // POST [id]/score Endpoint Tests (5 Tests)
  // ==========================================

  it("16. returns 404 error if post is not found", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue(null);

    const req = createPostRequest();
    const res = await POSTScore(req, { params: Promise.resolve({ id: "non-existent" }) });
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Source post not found");
  });

  it("17. returns dynamic scored results in preview mode", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue({
      id: "post-1",
      accountId: "acc-grafik",
      sourceId: "src-1",
      tweetId: "tw-1",
      text: "Yeni figma midjourney yapay zeka güncellemesi!",
      likeCount: 50,
      retweetCount: 10,
      publishedAt: new Date(),
      scannedAt: new Date(),
      source: { handle: "aisource" },
      account: { handle: "grafikcem" }
    } as any);

    const req = createPostRequest();
    const res = await POSTScore(req, { params: Promise.resolve({ id: "post-1" }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.score).toBeDefined();
    expect(json.score.relevanceScore).toBeDefined();
    expect(json.score.riskScore).toBeDefined();
    expect(json.score.suggestedAction).toBeDefined();
    expect(json.score.opportunityScore).toBeGreaterThan(0);
  });

  it("18. guarantees scoring does NOT update or save the score in the database", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue({
      id: "post-1",
      accountId: "acc-grafik",
      sourceId: "src-1",
      tweetId: "tw-1",
      text: "Yeni figma midjourney yapay zeka güncellemesi!",
      likeCount: 50,
      retweetCount: 10,
      publishedAt: new Date(),
      scannedAt: new Date(),
      source: { handle: "aisource" },
      account: { handle: "grafikcem" }
    } as any);

    const req = createPostRequest();
    await POSTScore(req, { params: Promise.resolve({ id: "post-1" }) });

    expect(prisma.sourcePost.update).not.toHaveBeenCalled();
  });

  it("19. returns 500 error on database crashes in scoring endpoint", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockRejectedValue(new Error("Disk error"));

    const req = createPostRequest();
    const res = await POSTScore(req, { params: Promise.resolve({ id: "post-1" }) });
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Disk error");
  });

  it("20. handles scoring missing publishedAt gracefully using scannedAt as fallback", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue({
      id: "post-1",
      accountId: "acc-grafik",
      sourceId: "src-1",
      tweetId: "tw-1",
      text: "Figma yapay zeka güncellemesi",
      likeCount: 10,
      retweetCount: 2,
      publishedAt: null,
      scannedAt: new Date(),
      source: { handle: "aisource" },
      account: { handle: "grafikcem" }
    } as any);

    const req = createPostRequest();
    const res = await POSTScore(req, { params: Promise.resolve({ id: "post-1" }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.score.opportunityScore).toBeGreaterThan(0);
  });
});
