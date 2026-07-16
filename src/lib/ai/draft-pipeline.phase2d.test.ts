import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runDraftPipeline, bindJudgeCandidates } from "./draft-pipeline";
import { generateJsonGated } from "./generateGated";
import { accountProfiles } from "@/lib/accounts";
import type { DraftWithAngle, RankedCandidate } from "./prompts";

// Ağ/DB yok — gated katman tamamen mock (mevcut draft-pipeline.test.ts deseni).
vi.mock("./generateGated", () => ({
  generateJsonGated: vi.fn(),
}));

const profile = accountProfiles.grafikcem; // maxChars 1500 → segmentLimit 280

const SEGS = [
  { text: "Hook: bu aracı kimse konuşmuyor." },
  { text: "→ Adım 1: kurulum tek komut." },
  { text: "→ Adım 2: preset'i kilitle." },
  { text: "→ Adım 3: batch üret." },
  { text: "Payoff: kaydet, yarın lazım olacak." },
];

function writerDraft(over: Partial<DraftWithAngle> = {}): DraftWithAngle {
  return {
    content: "Tek tweet taslağı — somut araç + sayı.",
    mode: "tool_spotlight",
    angle: "angle_1",
    hookType: "statement",
    reason: "test",
    payoff: "save",
    threadSegments: null,
    ...over,
  };
}

function threadDraft(over: Partial<DraftWithAngle> = {}): DraftWithAngle {
  return writerDraft({
    content: SEGS.map((s) => s.text).join("\n\n"),
    mode: "thread",
    angle: "angle_3",
    threadSegments: SEGS,
    ...over,
  });
}

function writerRes(drafts: DraftWithAngle[]) {
  return { model: "w-model", data: { drafts }, estimatedCostUsd: 0.001, modelFallbackUsed: false };
}

function judgeCandidate(over: Partial<RankedCandidate> = {}): RankedCandidate {
  return {
    content: "judge'ın yeniden yazdığı metin (otorite DEĞİL)",
    mode: "tool_spotlight",
    angle: "angle_1",
    hookStrength: 85, viralPotential: 80, accountFit: 88, turkishNaturalness: 90,
    noveltyScore: 70, risk: 10, sourceFaithfulness: 92,
    verdict: "approve", reason: "iyi",
    payoff: "save",
    ...over,
  };
}

function judgeRes(rankedCandidates: RankedCandidate[]) {
  return {
    model: "j-model",
    data: { rankedCandidates, winnerIndex: 0, publishDecision: "queue" as const },
    estimatedCostUsd: 0.001,
    modelFallbackUsed: false,
  };
}

const originalEnv = { ...process.env };
beforeEach(() => {
  vi.restoreAllMocks();
  process.env.OPENROUTER_API_KEY = "mock-key";
  delete process.env.ENABLE_FINAL_EDITOR;
  delete process.env.ENABLE_JUDGE;
  delete process.env.JUDGE_MODE_GRAFIKCEM;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...originalEnv };
});

describe("bindJudgeCandidates — provenance (ADR-033)", () => {
  const drafts = [writerDraft(), threadDraft(), writerDraft({ content: "Üçüncü.", angle: "angle_2" })];

  it("sourceDraftIndex doğru adaya bağlanır; canonical içerik/segment writer'dan gelir", () => {
    const out = bindJudgeCandidates([judgeCandidate({ sourceDraftIndex: 1 })], drafts);
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe(drafts[1].content); // judge'ın rewrite'ı DEĞİL
    expect(out[0].threadSegments).toEqual(SEGS);
    expect(out[0].mode).toBe("thread");
    expect(out[0].hookStrength).toBe(85); // skorlar judge'dan
  });

  it("judge reorder etse de segmentler kaybolmaz", () => {
    const out = bindJudgeCandidates(
      [
        judgeCandidate({ sourceDraftIndex: 2 }),
        judgeCandidate({ sourceDraftIndex: 1 }),
        judgeCandidate({ sourceDraftIndex: 0 }),
      ],
      drafts
    );
    expect(out.map((c) => c.sourceDraftIndex)).toEqual([2, 1, 0]);
    expect(out[1].threadSegments).toEqual(SEGS);
  });

  it("geçersiz/aralık-dışı indeks: birebir content eşleşmesiyle deterministik fallback; çözülemeyen DÜŞER", () => {
    const out = bindJudgeCandidates(
      [
        judgeCandidate({ sourceDraftIndex: 99, content: drafts[2].content }), // content-match → 2
        judgeCandidate({ sourceDraftIndex: -1, content: "hiçbir taslağa uymaz" }), // düşer
      ],
      drafts
    );
    expect(out).toHaveLength(1);
    expect(out[0].sourceDraftIndex).toBe(2);
  });

  it("aynı taslak iki farklı indeksle DUPLICATE edilmez", () => {
    const out = bindJudgeCandidates(
      [judgeCandidate({ sourceDraftIndex: 1 }), judgeCandidate({ sourceDraftIndex: 1 })],
      drafts
    );
    expect(out).toHaveLength(1);
  });
});

describe("runDraftPipeline — Phase 2D thread akışları", () => {
  it("thread mode → kazanan geçerli 5-8 threadSegments taşır; judge rewrite'ı otorite değil", async () => {
    vi.mocked(generateJsonGated)
      .mockResolvedValueOnce(writerRes([threadDraft(), writerDraft()]) as never)
      .mockResolvedValueOnce(judgeRes([judgeCandidate({ sourceDraftIndex: 0, mode: "thread" })]) as never);

    const res = await runDraftPipeline(profile, "kaynak", {
      format: { intent: "thread", segmentLimit: 280 },
    });
    expect(res.threadRequestUnsatisfied).toBeUndefined();
    expect(res.winner.threadSegments).toEqual(SEGS);
    expect(res.winner.content).toBe(threadDraft().content);
  });

  it("explicit thread: writer segment üretmedi → BİR repair retry; hâlâ yoksa threadRequestUnsatisfied (judge'a harcama yok)", async () => {
    vi.mocked(generateJsonGated)
      .mockResolvedValueOnce(writerRes([writerDraft()]) as never)
      .mockResolvedValueOnce(writerRes([writerDraft()]) as never);

    const res = await runDraftPipeline(profile, "kaynak", {
      format: { intent: "thread", segmentLimit: 280 },
    });
    expect(res.threadRequestUnsatisfied).toBe(true);
    // 2 writer çağrısı (ilk + repair), judge ÇAĞRILMADI.
    expect(vi.mocked(generateJsonGated)).toHaveBeenCalledTimes(2);
  });

  it("explicit thread + OPENROUTER_API_KEY yok → mock'la SAHTE thread üretilmez (unsatisfied)", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const res = await runDraftPipeline(profile, "kaynak", {
      format: { intent: "thread", segmentLimit: 280 },
    });
    expect(res.usedMock).toBe(true);
    expect(res.threadRequestUnsatisfied).toBe(true);
    expect(vi.mocked(generateJsonGated)).not.toHaveBeenCalled();
  });

  it("fast path (risk_based, lint temiz) segmentleri KORUR", async () => {
    process.env.ENABLE_JUDGE = "risk_based";
    vi.mocked(generateJsonGated).mockResolvedValueOnce(writerRes([threadDraft()]) as never);

    const res = await runDraftPipeline(profile, "kaynak", {
      format: { intent: "thread", segmentLimit: 280 },
    });
    expect(res.modelUsed.judge).toBe("skipped");
    expect(res.winner.threadSegments).toEqual(SEGS);
    expect(res.rankedCandidates[0].threadSegments).toEqual(SEGS);
  });

  it("deadline path segmentleri KORUR", async () => {
    vi.mocked(generateJsonGated).mockResolvedValueOnce(writerRes([threadDraft()]) as never);
    const res = await runDraftPipeline(profile, "kaynak", {
      deadlineMs: Date.now() - 1, // writer sonrası süre bitmiş
      format: { intent: "auto", segmentLimit: 280 },
    });
    expect(res.modelUsed.judge).toBe("skipped:deadline");
    expect(res.winner.threadSegments).toEqual(SEGS);
  });

  it("judge boş dönerse fallback promote segmentleri KORUR", async () => {
    vi.mocked(generateJsonGated)
      .mockResolvedValueOnce(writerRes([threadDraft()]) as never)
      .mockResolvedValueOnce(judgeRes([]) as never);
    const res = await runDraftPipeline(profile, "kaynak", {
      format: { intent: "auto", segmentLimit: 280 },
    });
    expect(res.winner.threadSegments).toEqual(SEGS);
  });

  it("ENABLE_FINAL_EDITOR=true iken thread kazananda final editor AÇIKÇA atlanır (segment/content ayrışması imkânsız)", async () => {
    process.env.ENABLE_FINAL_EDITOR = "true";
    vi.mocked(generateJsonGated)
      .mockResolvedValueOnce(writerRes([threadDraft()]) as never)
      .mockResolvedValueOnce(judgeRes([judgeCandidate({ sourceDraftIndex: 0, mode: "thread" })]) as never);

    const res = await runDraftPipeline(profile, "kaynak", {
      format: { intent: "thread", segmentLimit: 280 },
    });
    expect(res.modelUsed.finalEditor).toBe("skipped:thread_segment_contract");
    expect(res.winner.content).toBe(threadDraft().content); // rewrite YOK
    // 2 çağrı: writer + judge — editor ÇAĞRILMADI.
    expect(vi.mocked(generateJsonGated)).toHaveBeenCalledTimes(2);
  });

  it("non-thread kazananda final editor davranışı DEĞİŞMEDİ (çağrılır)", async () => {
    process.env.ENABLE_FINAL_EDITOR = "true";
    vi.mocked(generateJsonGated)
      .mockResolvedValueOnce(writerRes([writerDraft()]) as never)
      .mockResolvedValueOnce(judgeRes([judgeCandidate({ sourceDraftIndex: 0 })]) as never)
      .mockResolvedValueOnce({ model: "e-model", data: { content: "cilalı" }, estimatedCostUsd: 0.001 } as never);

    const res = await runDraftPipeline(profile, "kaynak", {
      format: { intent: "auto", segmentLimit: 280 },
    });
    expect(res.modelUsed.finalEditor).toBe("e-model");
    expect(res.winner.content).toBe("cilalı");
  });

  it("writer'da geçersiz (tek/aşırı) segment normalize kurallarına takılır: boş text'ler atılır", async () => {
    const dirty = threadDraft({
      threadSegments: [{ text: "  " }, { text: "geçerli" }, { text: "" }],
    });
    vi.mocked(generateJsonGated)
      .mockResolvedValueOnce(writerRes([dirty]) as never)
      .mockResolvedValueOnce(writerRes([dirty]) as never);
    const res = await runDraftPipeline(profile, "kaynak", {
      format: { intent: "thread", segmentLimit: 280 },
    });
    // Normalize → tek segment kaldı → geçerli thread DEĞİL → unsatisfied.
    expect(res.threadRequestUnsatisfied).toBe(true);
  });
});
