import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/queueRepo", () => ({
  queueRepo: { create: vi.fn(), update: vi.fn() },
}));

import { atomizeService } from "./atomizeService";
import { queueRepo } from "@/lib/db/queueRepo";
import type { RankedCandidate } from "@/lib/ai/prompts";
import type { QueueItem } from "@/generated/prisma/client";

const mainItem = {
  id: "qi_main",
  accountId: "acc_001",
  sourcePostId: "sp_1",
  content: "Kazanan tweet içeriği.",
  draftType: "TWEET",
  mode: "tool_spotlight",
  scores: "{}",
} as unknown as QueueItem;

function cand(over: Partial<RankedCandidate> = {}): RankedCandidate {
  return {
    content: "Aday içerik.",
    mode: "hot_take",
    angle: "a",
    hookStrength: 80, viralPotential: 78, accountFit: 85, turkishNaturalness: 88,
    noveltyScore: 60, risk: 12, sourceFaithfulness: 90,
    verdict: "approve", reason: "r", payoff: "reply",
    threadSegments: null,
    ...over,
  };
}

const T_SEGS = [
  { text: "Hook segmenti." },
  { text: "Orta segment somut adım." },
  { text: "Kapanış payoff." },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(queueRepo.update).mockResolvedValue({} as never);
  vi.mocked(queueRepo.create).mockImplementation(async (d) => ({ id: "qi_sib", ...d }) as never);
});

describe("atomizeService — Phase 2D thread package rolü (ADR-033)", () => {
  it("GEÇERLİ thread adayı → draftType=THREAD + threadSegments + packageRole=thread; content segmentlerden", async () => {
    const threadSib = cand({ content: "eski birleşik", mode: "thread", threadSegments: T_SEGS });
    await atomizeService.atomizePackage({
      accountHandle: "grafikcem",
      mainQueueItem: mainItem,
      candidates: [cand({ content: mainItem.content }), threadSib],
      judged: true,
    });
    const created = vi.mocked(queueRepo.create).mock.calls[0][0];
    expect(created.draftType).toBe("THREAD");
    expect(JSON.parse(created.threadSegments!)).toEqual(T_SEGS);
    expect(created.content).toBe(T_SEGS.map((s) => s.text).join("\n\n"));
    expect(JSON.parse(created.scores!).packageRole).toBe("thread");
    expect(created.estimatedCostUsd).toBe(0); // reused candidate — ek LLM maliyeti YOK
  });

  it("segmentsiz aday ASLA 'thread' rolü almaz; TWEET olarak yaratılır", async () => {
    await atomizeService.atomizePackage({
      accountHandle: "grafikcem",
      mainQueueItem: mainItem,
      candidates: [cand({ content: mainItem.content }), cand({ content: "Farklı içerik." })],
      judged: true,
    });
    const created = vi.mocked(queueRepo.create).mock.calls[0][0];
    expect(created.draftType).toBe("TWEET");
    expect(created.threadSegments).toBeUndefined();
    expect(JSON.parse(created.scores!).packageRole).not.toBe("thread");
  });

  it("GEÇERSİZ segmentli (oversized) thread adayı thread rolü alamaz", async () => {
    const bad = cand({
      content: "Farklı içerik 2.",
      mode: "thread",
      threadSegments: [{ text: "z".repeat(300) }, { text: "b" }],
    });
    await atomizeService.atomizePackage({
      accountHandle: "grafikcem",
      mainQueueItem: mainItem,
      candidates: [cand({ content: mainItem.content }), bad],
      judged: true,
    });
    const created = vi.mocked(queueRepo.create).mock.calls[0][0];
    expect(created.draftType).toBe("TWEET");
    expect(JSON.parse(created.scores!).packageRole).not.toBe("thread");
  });
});
