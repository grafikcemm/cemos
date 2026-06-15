import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/db/client";
import { cronRunRepo } from "@/lib/db/cronRunRepo";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    viralPattern: { count: vi.fn(), findMany: vi.fn() },
    feedbackEvent: { count: vi.fn() },
  },
}));

vi.mock("@/lib/db/cronRunRepo", () => ({
  cronRunRepo: { latestByKind: vi.fn() },
}));

describe("/api/growth/learning-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zeros/nulls on an empty database", async () => {
    vi.mocked(cronRunRepo.latestByKind).mockResolvedValue(null);
    vi.mocked(prisma.viralPattern.count).mockResolvedValue(0);
    vi.mocked(prisma.feedbackEvent.count).mockResolvedValue(0);
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue([] as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      success: true,
      lastDaily: null,
      lastLearn: null,
      patternsMinedLast7d: 0,
      engagementEventsLast7d: 0,
      topPatterns: [],
    });
  });

  it("serializes cron runs and reports weekly learning counts", async () => {
    const startedAt = new Date("2026-06-09T06:00:00.000Z");
    vi.mocked(cronRunRepo.latestByKind).mockImplementation((kind: string) =>
      Promise.resolve({
        id: "cr-1",
        kind,
        startedAt,
        finishedAt: new Date("2026-06-09T06:01:30.000Z"),
        ok: true,
        partial: false,
        resultJson: "{}",
        error: null,
      } as never)
    );
    vi.mocked(prisma.viralPattern.count).mockResolvedValue(9);
    vi.mocked(prisma.feedbackEvent.count).mockResolvedValue(4);
    vi.mocked(prisma.viralPattern.findMany).mockResolvedValue([
      { patternName: "Workflow Değişimi", successScore: 82, usageCount: 6 },
    ] as never);

    const res = await GET();
    const json = await res.json();

    expect(json.lastDaily).toMatchObject({ kind: "daily", ok: true, startedAt: startedAt.toISOString() });
    expect(json.lastLearn).toMatchObject({ kind: "learn", ok: true });
    expect(json.patternsMinedLast7d).toBe(9);
    expect(json.engagementEventsLast7d).toBe(4);
    expect(json.topPatterns[0].patternName).toBe("Workflow Değişimi");
  });

  it("returns 500 with the error message on DB failure", async () => {
    vi.mocked(cronRunRepo.latestByKind).mockRejectedValue(new Error("db down"));

    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("db down");
  });
});
