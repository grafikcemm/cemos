import type { AccountProfile } from "@/lib/accounts";
import { resolveModel } from "@/lib/ai/model-config";
import type { BenchmarkResult, DraftScore } from "@/lib/ai/prompts";

const mockTweets: Record<string, DraftScore[]> = {
  grafikcem: [
    {
      content:
        "OpenAI'in yeni gorsel modelini bir gun test ettim. Asil fark cikti suymus: artik tek promptta stil referansini kilitleyip sadece sahneyi degistirebiliyorsun.\n\nAjans is akisinda 3 revizyon turunu 1'e dusuruyor. Pahali stok aboneligine gerek kalmadi.",
      mode: "tool_spotlight",
      personaMatch: 91,
      turkishNaturalness: 88,
      hookStrength: 84,
      clarity: 92,
      novelty: 70,
      viralPotential: 82,
      risk: 14,
      sourceFaithfulness: 90,
      verdict: "approve",
      reason: "Somut cikti, arac + is surecine kattigi net, soru-CTA yok.",
    },
  ],
  maskulenkod: [
    {
      content:
        "Sunu fark ettim: birinin seni secmesini bekliyorsan,\nkendi hayatinda zaten ikinci plana dusmussundur.\n\nMesele kadin degil, kendi yonunu kurmamis olman.",
      mode: "sosyal_gozlem",
      personaMatch: 89,
      turkishNaturalness: 86,
      hookStrength: 87,
      clarity: 90,
      novelty: 70,
      viralPotential: 84,
      risk: 28,
      sourceFaithfulness: 82,
      verdict: "approve",
      reason: "Guc dinamigi gozlemi; sert ama dengeli, kisiyi hedef almiyor.",
    },
    {
      content:
        "Cogu erkek guclu olamiyor cunku disiplini bir hisse bagliyor, sisteme degil.\n\nHis biter, sistem kalir. Once sistemi kur.",
      mode: "sistem_analizi",
      personaMatch: 92,
      turkishNaturalness: 88,
      hookStrength: 85,
      clarity: 86,
      novelty: 70,
      viralPotential: 86,
      risk: 22,
      sourceFaithfulness: 80,
      verdict: "approve",
      reason: "Sistem teshisi; davranisi mekanige bagliyor, net.",
    },
  ],

};

export function createMockBenchmark(profile: AccountProfile): BenchmarkResult {
  const drafts = mockTweets[profile.handle] ?? mockTweets.grafikcem;
  const winner = drafts.reduce((best, item) =>
    item.personaMatch + item.viralPotential - item.risk >
    best.personaMatch + best.viralPotential - best.risk
      ? item
      : best,
  );

  return {
    account: profile.handle,
    modelUsed: {
      writer: resolveModel("cheapWriter"),
      judge: resolveModel("qualityJudge"),
    },
    sourceInput: profile.benchmarkInput,
    drafts,
    winner,
    publishDecision: winner.verdict === "approve" ? "queue" : winner.verdict,
    estimatedCostUsd: 0,
    usedMock: true,
    rankedCandidates: [],
  };
}
