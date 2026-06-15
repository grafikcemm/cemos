import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/db/client";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: {
      findMany: vi.fn()
    },
    feedbackEvent: {
      findMany: vi.fn()
    },
    trainingExample: {
      findMany: vi.fn()
    },
    viralPattern: {
      findMany: vi.fn()
    }
  }
}));

describe("Training Center API GET Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock accounts
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: "acc-grafik", handle: "grafikcem", displayName: "GrafikCem" },
      { id: "acc-mask", handle: "maskulenkod", displayName: "MaskulenKod" }
    ] as any);

    // Default mock empty results
    vi.mocked(prisma.feedbackEvent.findMany).mockResolvedValue([]);
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue([]);
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue([]);
  });

  const createGetRequest = (query: Record<string, string>) => {
    const q = new URLSearchParams(query);
    return new NextRequest(`http://localhost:3000/api/growth/training-center?${q.toString()}`, {
      method: "GET"
    });
  };

  it("calculates summary stats correctly on empty data without throwing", async () => {
    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.summary).toEqual({
      totalFeedbackEvents: 0,
      totalTrainingExamples: 0,
      goodExamples: 0,
      badExamples: 0,
      editedExamples: 0,
      savedPatterns: 0
    });
  });

  it("returns mapped account handles and parsed JSON columns", async () => {
    const mockFeedbacks = [
      {
        id: "evt-1",
        accountId: "acc-grafik",
        feedbackType: "approved",
        originalContent: "Original content details",
        editedContent: "",
        reason: "Nice",
        createdAt: new Date(),
        queueItemId: null,
        sourcePostId: null
      }
    ];

    const mockTraining = [
      {
        id: "te-1",
        accountId: "acc-mask",
        inputType: "tweet_draft",
        sourceContent: "Source context text",
        outputContent: "Output test details",
        label: "good",
        reason: "",
        metricsJson: '{"draftScore":{"publishScore":88}}',
        createdAt: new Date()
      }
    ];

    const mockPatterns = [
      {
        id: "pat-1",
        accountId: "acc-grafik",
        patternName: "Soccer Strategy",
        category: "Sport Theme",
        hookType: "hook",
        structureJson: '{"hook":"Check this"}',
        emotion: "anger",
        viralityTrigger: "high controversy",
        exampleGood: "Hook text",
        exampleBad: "Bad text",
        usageCount: 5,
        successScore: 92,
        isActive: true,
        createdAt: new Date()
      }
    ];

    vi.mocked(prisma.feedbackEvent.findMany).mockResolvedValue(mockFeedbacks as any);
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue(mockTraining as any);
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue(mockPatterns as any);

    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.summary.totalFeedbackEvents).toBe(1);
    expect(json.summary.totalTrainingExamples).toBe(1);
    expect(json.summary.savedPatterns).toBe(1);

    expect(json.feedbackEvents[0].accountHandle).toBe("grafikcem");
    expect(json.trainingExamples[0].accountHandle).toBe("maskulenkod");
    expect(json.trainingExamples[0].metricsJson).toEqual({ draftScore: { publishScore: 88 } });
    expect(json.recentPatterns[0].accountHandle).toBe("grafikcem");
    expect(json.recentPatterns[0].structureJson).toEqual({ hook: "Check this" });
  });

  it("handles unknown accountId gracefully without throwing", async () => {
    const mockFeedbacks = [
      {
        id: "evt-1",
        accountId: "unknown-account-id-555",
        feedbackType: "approved",
        originalContent: "Content",
        editedContent: "",
        reason: "",
        createdAt: new Date(),
        queueItemId: null,
        sourcePostId: null
      }
    ];
    vi.mocked(prisma.feedbackEvent.findMany).mockResolvedValue(mockFeedbacks as any);

    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.feedbackEvents[0].accountHandle).toBe("unknown");
  });

  it("handles malformed metricsJson and structureJson safely", async () => {
    const mockTraining = [
      {
        id: "te-1",
        accountId: "acc-grafik",
        inputType: "draft",
        outputContent: "Content",
        label: "good",
        metricsJson: "invalid-json-string-123",
        createdAt: new Date()
      }
    ];
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue(mockTraining as any);

    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.trainingExamples[0].metricsJson).toEqual({});
  });

  it("filters correctly by accountHandle", async () => {
    const req = createGetRequest({ accountHandle: "grafikcem" });
    await GET(req);

    const expectedAccountId = "acc-grafik";
    expect(prisma.feedbackEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountId: expectedAccountId }) })
    );
    expect(prisma.trainingExample.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountId: expectedAccountId }) })
    );
    expect(prisma.viralPattern.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountId: expectedAccountId }) })
    );
  });

  it("returns immediately with empty lists for invalid accountHandle", async () => {
    const req = createGetRequest({ accountHandle: "invalid_handle" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.feedbackEvents).toEqual([]);
    expect(prisma.feedbackEvent.findMany).not.toHaveBeenCalled();
  });

  it("filters correctly by feedbackType", async () => {
    const req = createGetRequest({ feedbackType: "rejected" });
    await GET(req);

    expect(prisma.feedbackEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ feedbackType: "rejected" }) })
    );
  });

  it("filters correctly by label", async () => {
    const req = createGetRequest({ label: "bad" });
    await GET(req);

    expect(prisma.trainingExample.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ label: "bad" }) })
    );
  });

  it("applies today date range filter correctly", async () => {
    const req = createGetRequest({ dateRange: "today" });
    await GET(req);

    expect(prisma.feedbackEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({ gte: expect.any(Date) })
        })
      })
    );
  });

  it("applies last_7_days date range filter correctly", async () => {
    const req = createGetRequest({ dateRange: "last_7_days" });
    await GET(req);

    expect(prisma.feedbackEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({ gte: expect.any(Date) })
        })
      })
    );
  });

  it("applies last_30_days date range filter correctly", async () => {
    const req = createGetRequest({ dateRange: "last_30_days" });
    await GET(req);

    expect(prisma.feedbackEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({ gte: expect.any(Date) })
        })
      })
    );
  });

  it("applies search text query to OR criteria for feedbackEvents", async () => {
    const req = createGetRequest({ search: "gpt" });
    await GET(req);

    expect(prisma.feedbackEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { originalContent: { contains: "gpt" } },
            { editedContent: { contains: "gpt" } },
            { reason: { contains: "gpt" } }
          ])
        })
      })
    );
  });

  it("applies search text query to OR criteria for trainingExamples", async () => {
    const req = createGetRequest({ search: "gpt" });
    await GET(req);

    expect(prisma.trainingExample.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { sourceContent: { contains: "gpt" } },
            { outputContent: { contains: "gpt" } },
            { reason: { contains: "gpt" } }
          ])
        })
      })
    );
  });

  it("recentPatterns filter isActive: true is always enforced", async () => {
    const req = createGetRequest({});
    await GET(req);

    expect(prisma.viralPattern.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true
        })
      })
    );
  });

  it("returns 500 error on unexpected database crashes", async () => {
    vi.mocked(prisma.account.findMany).mockRejectedValue(new Error("Disk failure"));

    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Disk failure");
  });
});
