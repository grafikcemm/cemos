import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Phase 2D (ADR-033) — draftService thread persistence sözleşmesi.
 * Pipeline mock'lu (ağ yok); seçim/persist kuralları GERÇEK draftService kodu.
 */

vi.mock("@/lib/accounts/profileRepository", () =>
  import("@/lib/accounts/profileRepository.testDouble").then((m) =>
    m.createProfileRepositoryTestDouble()
  )
);
vi.mock("@/lib/db/accountRepo", () => ({
  accountRepo: { findByHandle: vi.fn(), findById: vi.fn() },
}));
vi.mock("@/lib/db/sourcePostRepo", () => ({
  sourcePostRepo: {
    findById: vi.fn(),
    findByIdWithSourceMode: vi.fn(),
    markUsed: vi.fn(),
    markBlocked: vi.fn(),
  },
}));
vi.mock("@/lib/db/queueRepo", () => ({
  queueRepo: { create: vi.fn(), update: vi.fn(), findById: vi.fn() },
}));
vi.mock("@/lib/db/generationRunRepo", () => ({
  generationRunRepo: { create: vi.fn() },
}));
vi.mock("@/lib/services/usageService", () => ({
  usageService: { recordGeneration: vi.fn() },
}));
vi.mock("@/lib/config/costGate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/costGate")>("@/lib/config/costGate");
  return {
    ...actual,
    getBudgetStatus: vi.fn(async () => ({ allowed: true, spentUsd: 0, limitUsd: 10, remainingUsd: 10 })),
  };
});
vi.mock("@/lib/ai/grounding", () => ({
  buildGroundingContext: vi.fn(async () => ({ block: "", patternIds: [], sourcePostIds: [], memoryFactIds: [] })),
}));
vi.mock("@/lib/ai/draft-pipeline", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/draft-pipeline")>()),
  runDraftPipeline: vi.fn(),
}));

import { draftService } from "./draftService";
import { runDraftPipeline } from "@/lib/ai/draft-pipeline";
import { accountRepo } from "@/lib/db/accountRepo";
import { sourcePostRepo } from "@/lib/db/sourcePostRepo";
import { queueRepo } from "@/lib/db/queueRepo";
import { generationRunRepo } from "@/lib/db/generationRunRepo";
import type { RankedCandidate } from "@/lib/ai/prompts";

const mockAccount = { id: "acc_001", handle: "grafikcem", maxChars: 1500 } as never;

const SEGS = [
  { text: "Hook: bu aracı kimse konuşmuyor." },
  { text: "→ Adım 1: kurulum tek komut." },
  { text: "→ Adım 2: preset'i kilitle." },
  { text: "→ Adım 3: batch üret." },
  { text: "Payoff: kaydet, yarın lazım olacak." },
];
const JOINED = SEGS.map((s) => s.text).join("\n\n");

function candidate(over: Partial<RankedCandidate> = {}): RankedCandidate {
  return {
    content: "Tek tweet adayı — somut araç ve net kapanış anlatıyorum.",
    mode: "tool_spotlight",
    angle: "angle_1",
    hookStrength: 85, viralPotential: 80, accountFit: 88, turkishNaturalness: 90,
    noveltyScore: 70, risk: 10, sourceFaithfulness: 92,
    verdict: "approve", reason: "iyi", payoff: "save",
    threadSegments: null,
    ...over,
  };
}

const threadCand = () =>
  candidate({ content: JOINED, mode: "thread", threadSegments: SEGS, sourceDraftIndex: 0 });

function pipelineResult(candidates: RankedCandidate[], over: Record<string, unknown> = {}) {
  const winner = candidates[0]
    ? {
        content: candidates[0].content,
        mode: candidates[0].mode,
        personaMatch: 88, turkishNaturalness: 90, hookStrength: 85, clarity: 87,
        novelty: 70, viralPotential: 80, risk: 10, sourceFaithfulness: 92,
        verdict: "approve" as const, reason: "iyi", payoff: candidates[0].payoff,
        threadSegments: candidates[0].threadSegments ?? null,
      }
    : {
        content: "mock", mode: "tool_spotlight", personaMatch: 0, turkishNaturalness: 0,
        hookStrength: 0, clarity: 0, novelty: 0, viralPotential: 0, risk: 0,
        sourceFaithfulness: 0, verdict: "approve" as const, reason: "mock",
      };
  return {
    account: "grafikcem",
    modelUsed: { writer: "w", judge: "j-model" },
    sourceInput: "kaynak",
    drafts: [winner],
    rankedCandidates: candidates,
    winner,
    publishDecision: "queue" as const,
    estimatedCostUsd: 0.002,
    usedMock: false,
    timings: { writerMs: 1, judgeMs: 1 },
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(accountRepo.findByHandle).mockResolvedValue(mockAccount);
  vi.mocked(generationRunRepo.create).mockResolvedValue({ id: "gr" } as never);
  vi.mocked(queueRepo.create).mockImplementation(async (data) => ({ id: "qi_new", ...data }) as never);
});

describe("draftService — Phase 2D thread persistence", () => {
  it("mode=thread isteği: TEK create ile draftType=THREAD + mode=thread + canonical content + threadSegments + telemetry", async () => {
    vi.mocked(runDraftPipeline).mockResolvedValue(pipelineResult([threadCand()]));

    const res = await draftService.generateDraft({
      accountHandle: "grafikcem",
      sourceTweet: "Kaynak metin",
      draftType: "TWEET", // körlemesine TWEET bile olsa mode=thread kazanır
      mode: "thread",
    });

    expect(res.blocked).toBeUndefined();
    expect(queueRepo.create).toHaveBeenCalledTimes(1);
    const args = vi.mocked(queueRepo.create).mock.calls[0][0];
    expect(args.draftType).toBe("THREAD");
    expect(args.mode).toBe("thread");
    expect(args.content).toBe(JOINED); // canonical: segmentlerden türetildi
    expect(JSON.parse(args.threadSegments!)).toEqual(SEGS);
    const scores = JSON.parse(args.scores!);
    expect(scores.telemetry.formatIntent).toBe("thread");
    expect(scores.telemetry.segmentCount).toBe(5);
    expect(scores.threadSegments).toBeUndefined(); // scores'a segment kopyalanmaz
    // Pipeline'a format açıkça geçti (segmentLimit = min(280, 1500)).
    expect(vi.mocked(runDraftPipeline).mock.calls[0][2]?.format).toEqual({
      intent: "thread",
      segmentLimit: 280,
    });
  });

  it("explicit thread: pipeline threadRequestUnsatisfied → QueueItem YOK, typed blocked", async () => {
    vi.mocked(runDraftPipeline).mockResolvedValue(
      pipelineResult([candidate()], { threadRequestUnsatisfied: true })
    );
    const res = await draftService.generateDraft({
      accountHandle: "grafikcem",
      sourceTweet: "Kaynak",
      draftType: "THREAD",
    });
    expect(res.blocked).toBe(true);
    expect(res.reason).toBe("thread_generation_invalid");
    expect(queueRepo.create).not.toHaveBeenCalled();
  });

  it("explicit thread + usedMock → SAHTE mock thread yazılmaz (blocked)", async () => {
    vi.mocked(runDraftPipeline).mockResolvedValue(
      pipelineResult([], { usedMock: true, rankedCandidates: [] })
    );
    const res = await draftService.generateDraft({
      accountHandle: "grafikcem",
      sourceTweet: "Kaynak",
      mode: "thread",
    });
    expect(res.blocked).toBe(true);
    expect(res.reason).toBe("thread_generation_invalid");
    expect(queueRepo.create).not.toHaveBeenCalled();
  });

  it("auto üretimde thread kazandı (geçerli segmentler) → persisted draftType=THREAD", async () => {
    vi.mocked(runDraftPipeline).mockResolvedValue(
      pipelineResult([threadCand(), candidate()])
    );
    await draftService.generateDraft({
      accountHandle: "grafikcem",
      sourceTweet: "Kaynak",
      draftType: "TWEET", // körlemesine default — thread'e yükseltilir
    });
    const args = vi.mocked(queueRepo.create).mock.calls[0][0];
    expect(args.draftType).toBe("THREAD");
    expect(JSON.parse(args.scores!).telemetry.threadSelection).toBe("auto_thread_winner");
  });

  it("auto: thread kazanan GEÇERSİZ (oversized segment) → geçerli non-thread adaya görünür fallback", async () => {
    const badThread = candidate({
      content: "uzun", mode: "thread",
      threadSegments: [{ text: "y".repeat(300) }, { text: "kapanış" }],
    });
    vi.mocked(runDraftPipeline).mockResolvedValue(pipelineResult([badThread, candidate()]));
    await draftService.generateDraft({ accountHandle: "grafikcem", sourceTweet: "Kaynak" });
    const args = vi.mocked(queueRepo.create).mock.calls[0][0];
    expect(args.draftType).toBe("TWEET");
    expect(args.threadSegments).toBeUndefined();
    expect(JSON.parse(args.scores!).telemetry.threadSelection).toBe("invalid_thread_winner_used_non_thread");
  });

  it("explicit TWEET kilidi (bilinen non-thread mode): thread kazanan atlanır, THREAD persist EDİLMEZ", async () => {
    vi.mocked(runDraftPipeline).mockResolvedValue(pipelineResult([threadCand(), candidate()]));
    await draftService.generateDraft({
      accountHandle: "grafikcem",
      sourceTweet: "Kaynak",
      mode: "hot_take",
    });
    const args = vi.mocked(queueRepo.create).mock.calls[0][0];
    expect(args.draftType).toBe("TWEET");
    expect(args.threadSegments).toBeUndefined();
    expect(args.content).not.toBe(JOINED);
    expect(JSON.parse(args.scores!).telemetry.threadSelection).toBe("tweet_intent_skipped_thread_winner");
  });

  it("explicit TWEET kilidi: TÜM adaylar thread ise dürüst blocked (uzun içerik TWEET diye yazılmaz)", async () => {
    vi.mocked(runDraftPipeline).mockResolvedValue(pipelineResult([threadCand()]));
    const res = await draftService.generateDraft({
      accountHandle: "grafikcem",
      sourceTweet: "Kaynak",
      mode: "hot_take",
    });
    expect(res.blocked).toBe(true);
    expect(res.reason).toBe("no_non_thread_candidate");
    expect(queueRepo.create).not.toHaveBeenCalled();
  });

  it("Source.mode=THREAD kaynak → pipeline'a thread niyeti gider (günlük pipeline parity)", async () => {
    vi.mocked(sourcePostRepo.findByIdWithSourceMode).mockResolvedValue({
      id: "sp_1", text: "kaynak post", sourceType: "x",
      source: { mode: "THREAD" },
    } as never);
    vi.mocked(runDraftPipeline).mockResolvedValue(pipelineResult([threadCand()]));

    await draftService.generateDraft({
      accountHandle: "grafikcem",
      sourcePostId: "sp_1",
      draftType: "TWEET", // caller körlemesine TWEET geçse de kaynak thread ister
    });
    expect(vi.mocked(runDraftPipeline).mock.calls[0][2]?.format?.intent).toBe("thread");
    const args = vi.mocked(queueRepo.create).mock.calls[0][0];
    expect(args.draftType).toBe("THREAD");
  });

  it("non-thread davranış korunur: TWEET adayı fitToMaxChars + threadSegments undefined", async () => {
    vi.mocked(runDraftPipeline).mockResolvedValue(pipelineResult([candidate()]));
    const res = await draftService.generateDraft({
      accountHandle: "grafikcem",
      sourceTweet: "Kaynak",
      draftType: "TWEET",
    });
    expect(res.blocked).toBeUndefined();
    const args = vi.mocked(queueRepo.create).mock.calls[0][0];
    expect(args.draftType).toBe("TWEET");
    expect(args.threadSegments).toBeUndefined();
  });
});
