import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { prisma } from "@/lib/db/client";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    newsItem: {
      findMany: vi.fn(() => Promise.resolve([])),
    },
  },
}));

function makeReq(query = "") {
  // Same-origin header so the operator-auth guard treats it like a UI fetch.
  return new NextRequest(`http://localhost:3000/api/news-pool${query}`, {
    headers: { "sec-fetch-site": "same-origin" },
  });
}

type FindManyArgs = {
  where: { processingStatus?: unknown };
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
};

function lastFindManyArgs(): FindManyArgs {
  const calls = vi.mocked(prisma.newsItem.findMany).mock.calls;
  return calls[calls.length - 1][0] as FindManyArgs;
}

describe("GET /api/news-pool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.newsItem.findMany).mockResolvedValue([] as never);
  });

  it("hides low_score and quarantined items by default", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);

    const args = lastFindManyArgs();
    expect(args.where.processingStatus).toEqual({ notIn: ["low_score", "quarantined"] });
  });

  it("passes an explicit status filter through (low_score reachable)", async () => {
    await GET(makeReq("?status=low_score"));
    expect(lastFindManyArgs().where.processingStatus).toBe("low_score");
  });

  it("passes an explicit quarantined filter through", async () => {
    await GET(makeReq("?status=quarantined"));
    expect(lastFindManyArgs().where.processingStatus).toBe("quarantined");
  });

  it("uses include (full payload) when compact is not requested", async () => {
    await GET(makeReq());
    const args = lastFindManyArgs();
    expect(args.include).toBeDefined();
    expect(args.select).toBeUndefined();
  });

  it("uses a trimmed select in compact mode (no heavy fields)", async () => {
    await GET(makeReq("?compact=true"));
    const args = lastFindManyArgs();
    expect(args.select).toBeDefined();
    expect(args.include).toBeUndefined();

    const select = args.select as Record<string, unknown>;
    // card fields stay
    expect(select.trTitle).toBe(true);
    expect(select.tweetAngle).toBe(true);
    expect(select.sourceVerification).toBe(true);
    expect(select.newsSource).toBeDefined();
    // heavy/debug fields dropped
    expect(select.originalSummary).toBeUndefined();
    expect(select.whyPeopleCare).toBeUndefined();
    expect(select.errorMessage).toBeUndefined();
    expect(select.canonicalUrl).toBeUndefined();
    expect(select.tags).toBeUndefined();
  });

  it("responds 500 with a message when the query fails", async () => {
    vi.mocked(prisma.newsItem.findMany).mockRejectedValueOnce(new Error("db down"));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("rejects a non-same-origin (header-less) request with 403", async () => {
    const res = await GET(new NextRequest("http://localhost:3000/api/news-pool"));
    expect(res.status).toBe(403);
  });
});
