import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/db/client";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: {
      findMany: vi.fn()
    },
    viralPattern: {
      findMany: vi.fn()
    }
  }
}));

describe("Pattern Library API GET Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: "acc-grafik", handle: "grafikcem", displayName: "GrafikCem" },
      { id: "acc-mask", handle: "maskulenkod", displayName: "MaskulenKod" }
    ] as any);

    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue([]);
  });

  const createGetRequest = (query: Record<string, string>) => {
    const q = new URLSearchParams(query);
    return new NextRequest(`http://localhost:3000/api/growth/pattern-library?${q.toString()}`, {
      method: "GET"
    });
  };

  it("calculates summary statistics correctly on empty data", async () => {
    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.summary).toEqual({
      totalPatterns: 0,
      activePatterns: 0,
      inactivePatterns: 0,
      averageSuccessScore: 0,
      topPatternName: "N/A",
      totalUsageCount: 0
    });
    expect(json.patterns).toEqual([]);
  });

  it("calculates summary statistics correctly on active/inactive patterns and parses JSON structure", async () => {
    const mockPatterns = [
      {
        id: "pat-1",
        accountId: "acc-grafik",
        patternName: "Sessiz Değişim",
        category: "AI News",
        hookType: "hook",
        structureJson: '{"hook":"Tasarım dünyası sarsılıyor"}',
        emotion: "wonder",
        viralityTrigger: "high value info",
        exampleGood: "Herkes bunu konuşuyor",
        exampleBad: "Bad text",
        usageCount: 15,
        successScore: 90,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "pat-2",
        accountId: "acc-mask",
        patternName: "Ayna Tutan Gerçek",
        category: "Mindset",
        hookType: "mirror",
        structureJson: '{"hook":"Hâlâ buna inanıyorsan"}',
        emotion: "confrontation",
        viralityTrigger: "confrontational truth",
        exampleGood: "Hâlâ bekliyorsan kaybetmişsin",
        exampleBad: "Bad text",
        usageCount: 30,
        successScore: 60,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue(mockPatterns as any);

    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.summary).toEqual({
      totalPatterns: 2,
      activePatterns: 1,
      inactivePatterns: 1,
      averageSuccessScore: 75, // (90+60)/2
      topPatternName: "Sessiz Değişim",
      totalUsageCount: 45, // 15+30
    });

    expect(json.patterns[0].accountHandle).toBe("grafikcem");
    expect(json.patterns[0].structureJson).toEqual({ hook: "Tasarım dünyası sarsılıyor" });
    expect(json.patterns[1].accountHandle).toBe("maskulenkod");
  });

  it("handles unknown accountId gracefully without throwing", async () => {
    const mockPatterns = [
      {
        id: "pat-1",
        accountId: "unknown-account-id-777",
        patternName: "Unknown Pattern",
        isActive: true,
        successScore: 50,
        usageCount: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue(mockPatterns as any);

    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.patterns[0].accountHandle).toBe("unknown");
  });

  it("handles malformed structureJson safely returning empty record", async () => {
    const mockPatterns = [
      {
        id: "pat-1",
        accountId: "acc-grafik",
        patternName: "Malformed Json Pattern",
        structureJson: "invalid-json-structure-syntax",
        isActive: true,
        successScore: 50,
        usageCount: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue(mockPatterns as any);

    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.patterns[0].structureJson).toEqual({});
  });

  it("filters correctly by accountHandle", async () => {
    const req = createGetRequest({ accountHandle: "grafikcem" });
    await GET(req);

    const expectedAccountId = "acc-grafik";
    expect(prisma.viralPattern.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountId: expectedAccountId }) })
    );
  });

  it("returns immediately with empty pattern list for invalid accountHandle", async () => {
    const req = createGetRequest({ accountHandle: "invalid_handle" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.patterns).toEqual([]);
    expect(prisma.viralPattern.findMany).not.toHaveBeenCalled();
  });

  it("filters correctly by active status", async () => {
    const req = createGetRequest({ active: "active" });
    await GET(req);

    expect(prisma.viralPattern.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true }) })
    );
  });

  it("filters correctly by inactive status", async () => {
    const req = createGetRequest({ active: "inactive" });
    await GET(req);

    expect(prisma.viralPattern.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: false }) })
    );
  });

  it("filters correctly by category", async () => {
    const req = createGetRequest({ category: "AI News" });
    await GET(req);

    expect(prisma.viralPattern.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: "AI News" }) })
    );
  });

  it("filters correctly by hookType", async () => {
    const req = createGetRequest({ hookType: "mirror" });
    await GET(req);

    expect(prisma.viralPattern.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ hookType: "mirror" }) })
    );
  });

  it("applies search query on OR constraints for patternName and exampleGood", async () => {
    const req = createGetRequest({ search: "workflow" });
    await GET(req);

    expect(prisma.viralPattern.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { patternName: { contains: "workflow" } },
            { exampleGood: { contains: "workflow" } }
          ])
        })
      })
    );
  });

  it("applies sorting order correctly by successScore desc", async () => {
    const req = createGetRequest({ sort: "successScore" });
    await GET(req);

    expect(prisma.viralPattern.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.objectContaining({ successScore: "desc" })
      })
    );
  });

  it("applies sorting order correctly by usageCount desc", async () => {
    const req = createGetRequest({ sort: "usageCount" });
    await GET(req);

    expect(prisma.viralPattern.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.objectContaining({ usageCount: "desc" })
      })
    );
  });

  it("returns 500 error on database crashes", async () => {
    vi.mocked(prisma.account.findMany).mockRejectedValue(new Error("Database offline"));

    const req = createGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Database offline");
  });
});
