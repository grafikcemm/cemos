import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    viralPattern: { findMany: vi.fn() },
    queueItem: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/performanceRepo", () => ({
  performanceRepo: { latestScoreByDraftItem: vi.fn() },
}));

vi.mock("@/lib/db/viralPatternRepo", () => ({
  viralPatternRepo: { markValidated: vi.fn(() => Promise.resolve({ id: "vp" })) },
}));

import { prisma } from "@/lib/db/client";
import { performanceRepo } from "@/lib/db/performanceRepo";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
import { promoteValidatedPatterns } from "./patternPromotionService";

type ItemSpec = {
  id: string;
  patternIds: string[];
  content?: string;
  editedContent?: string | null;
  status?: string;
};

function makeItem(spec: ItemSpec) {
  return {
    id: spec.id,
    status: spec.status ?? "manual_published",
    content: spec.content ?? "aynı içerik",
    editedContent: spec.editedContent ?? null,
    scores: JSON.stringify({ groundingPatternIds: spec.patternIds }),
  };
}

function setup(items: ReturnType<typeof makeItem>[], perf: Record<string, number>, candidateIds = ["vpA"]) {
  vi.mocked(prisma.viralPattern.findMany).mockResolvedValue(
    candidateIds.map((id) => ({ id })) as never
  );
  vi.mocked(prisma.queueItem.findMany).mockResolvedValue(items as never);
  vi.mocked(performanceRepo.latestScoreByDraftItem).mockResolvedValue(new Map(Object.entries(perf)));
}

describe("patternPromotionService.promoteValidatedPatterns", () => {
  beforeEach(() => vi.clearAllMocks());

  it("promotes a candidate when its drafts significantly beat the control with no brand degradation", async () => {
    // 4 drafts carry vpA (high performance), 4 do not (low performance).
    const carrying = ["a1", "a2", "a3", "a4"].map((id) => makeItem({ id, patternIds: ["vpA"] }));
    const control = ["b1", "b2", "b3", "b4"].map((id) => makeItem({ id, patternIds: ["vpZ"] }));
    setup([...carrying, ...control], {
      a1: 10, a2: 11, a3: 12, a4: 13, // withLesson — clearly higher
      b1: 1, b2: 2, b3: 3, b4: 4, // without — clearly lower
    });

    const res = await promoteValidatedPatterns("acc-1", { now: new Date("2026-07-09") });

    expect(res.promoted).toBe(1);
    expect(res.verdicts[0]).toMatchObject({ lessonKey: "vpA", promoted: true, reason: "promoted" });
    expect(viralPatternRepo.markValidated).toHaveBeenCalledWith("vpA", 4);
  });

  it("does NOT promote below the repetition floor (insufficient support)", async () => {
    const carrying = ["a1", "a2"].map((id) => makeItem({ id, patternIds: ["vpA"] })); // only 2 < MIN_SUPPORT
    const control = ["b1", "b2", "b3", "b4"].map((id) => makeItem({ id, patternIds: ["vpZ"] }));
    setup([...carrying, ...control], { a1: 10, a2: 11, b1: 1, b2: 2, b3: 3, b4: 4 });

    const res = await promoteValidatedPatterns("acc-1");

    expect(res.promoted).toBe(0);
    expect(viralPatternRepo.markValidated).not.toHaveBeenCalled();
  });

  it("applies the brand veto when the winning group required much heavier operator edits", async () => {
    // Same strong performance win, but carrying drafts were rewritten far more
    // heavily (edit distance ~1) than the control (~0) → clickbait brake fires.
    const heavyEdit = { content: "kısa", editedContent: "bambaşka çok daha uzun ve tamamen farklı bir metin" };
    const carrying = ["a1", "a2", "a3", "a4"].map((id) => makeItem({ id, patternIds: ["vpA"], ...heavyEdit }));
    const control = ["b1", "b2", "b3", "b4"].map((id) => makeItem({ id, patternIds: ["vpZ"] }));
    setup([...carrying, ...control], { a1: 10, a2: 11, a3: 12, a4: 13, b1: 1, b2: 2, b3: 3, b4: 4 });

    const res = await promoteValidatedPatterns("acc-1");

    expect(res.promoted).toBe(0);
    expect(res.verdicts[0]).toMatchObject({ promoted: false, reason: "brand_veto_edit_distance" });
    expect(viralPatternRepo.markValidated).not.toHaveBeenCalled();
  });

  it("short-circuits when there are no candidate patterns", async () => {
    setup([], {}, []);
    const res = await promoteValidatedPatterns("acc-1");
    expect(res.reason).toBe("no_candidates");
    expect(prisma.queueItem.findMany).not.toHaveBeenCalled();
  });
});
