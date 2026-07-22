import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/ai/generateGated", () => ({
  generateJsonGated: vi.fn(),
}));

import { generateJsonGated } from "@/lib/ai/generateGated";
import { isEval14Enabled, runBatchedJudge14 } from "./batchedJudge";
import { accountProfiles } from "@/lib/accounts";

const J_SCORES = {
  ilgi: 80, hesapUyumu: 85, sesUyumu: 70, ozgunluk: 75, bilgiDegeri: 82,
  kancaGucu: 78, tutma: 72, kaydetme: 65, paylasim: 90, tartisma: 88,
  evidence: "Somut rakam + net vaat; kanca güçlü.",
};

function mockRun(data: Record<string, unknown> = J_SCORES) {
  vi.mocked(generateJsonGated).mockResolvedValue({
    data,
    model: "openai/gpt-5.5",
    estimatedCostUsd: 0.004,
    actualCostUsd: 0.0031,
  } as never);
}

const DET = {
  sourceTier: "known" as const,
  corroborations: 1,
  sourcePublishedAtMs: Date.now() - 2 * 3_600_000, // 2h önce
  charCount: 240,
  maxChars: 280,
  usedMock: false,
  highLeakCount: 0,
  lintErrorCount: 0,
};

describe("batchedJudge (Sprint 9)", () => {
  const originalFlag = process.env.EVAL14_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EVAL14_ENABLED;
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.EVAL14_ENABLED;
    else process.env.EVAL14_ENABLED = originalFlag;
  });

  it("EVAL14_ENABLED bayrağı default KAPALI", () => {
    expect(isEval14Enabled()).toBe(false);
    process.env.EVAL14_ENABLED = "true";
    expect(isEval14Enabled()).toBe(true);
  });

  it("tek batched çağrı: [J] judge'dan, [D] koddan, 14 anahtar eksiksiz", async () => {
    mockRun();
    const res = await runBatchedJudge14({
      profile: accountProfiles.grafikcem,
      sourceText: "Kaynak metin",
      draftContent: "Taslak içerik",
      deterministic: DET,
    });

    expect(generateJsonGated).toHaveBeenCalledTimes(1);
    expect(generateJsonGated).toHaveBeenCalledWith(
      expect.objectContaining({ preset: "cemos-final-judge", purpose: "judge_x_subscores14" })
    );
    // 14 anahtar daima var (UI sözleşmesi).
    expect(Object.keys(res.subscores)).toHaveLength(14);
    // [J] geçti:
    expect(res.subscores.kancaGucu).toBe(78);
    // [D] koddan: leak 0 + lint 0 + format valid → yayinaHazir 100 (veto yok).
    expect(res.subscores.yayinaHazir).toBe(100);
    expect(res.composite.vetoed).toBe(false);
    expect(res.composite.composite).toBeGreaterThan(0);
    expect(res.costUsd).toBe(0.0031); // actual > estimate tercih edilir
  });

  it("#14 veto: yüksek-şiddet leak composite'i 0'lar", async () => {
    mockRun();
    const res = await runBatchedJudge14({
      profile: accountProfiles.grafikcem,
      sourceText: "Kaynak",
      draftContent: "Taslak",
      deterministic: { ...DET, highLeakCount: 1 },
    });

    expect(res.subscores.yayinaHazir).toBe(0);
    expect(res.composite.vetoed).toBe(true);
    expect(res.composite.composite).toBe(0);
  });

  it("#11/#12 CAP: paylasim/tartisma 70 üstü kompozite kırpılır (bait freni)", async () => {
    mockRun({ ...J_SCORES, paylasim: 100, tartisma: 100 });
    const res = await runBatchedJudge14({
      profile: accountProfiles.grafikcem,
      sourceText: "Kaynak",
      draftContent: "Taslak",
      deterministic: DET,
    });

    expect(res.composite.cappedInputs.paylasim).toBe(70);
    expect(res.composite.cappedInputs.tartisma).toBe(70);
  });

  it("judge şema-dışı dönerse Zod hatası fırlar (çağıran fail-open yutar)", async () => {
    mockRun({ ilgi: "yüksek" }); // sayı değil → parse hatası
    await expect(
      runBatchedJudge14({
        profile: accountProfiles.grafikcem,
        sourceText: "Kaynak",
        draftContent: "Taslak",
        deterministic: DET,
      })
    ).rejects.toThrow();
  });
});
