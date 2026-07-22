import type { AccountProfile } from "@/lib/accounts";
import { resolveModel } from "@/lib/ai/model-config";
import type { BenchmarkResult, DraftScore } from "@/lib/ai/prompts";

const mockTweets: Record<string, DraftScore[]> = {
  grafikcem: [
    {
      content:
        "OpenAI'ın yeni görsel modelini bir gün test ettim. Asıl fark çıktı şuymuş: artık tek promptta stil referansını kilitleyip sadece sahneyi değiştirebiliyorsun.\n\nAjans iş akışında 3 revizyon turunu 1'e düşürüyor. Pahalı stok aboneliğine gerek kalmadı.",
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
      reason: "Somut çıktı, araç + iş sürecine kattığı net, soru-CTA yok.",
    },
  ],
  maskulenkod: [
    {
      content:
        "Şunu fark ettim: birinin seni seçmesini bekliyorsan,\nkendi hayatında zaten ikinci plana düşmüşsündür.\n\nMesele kadın değil, kendi yönünü kurmamış olman.",
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
      reason: "Güç dinamiği gözlemi; sert ama dengeli, kişiyi hedef almıyor.",
    },
    {
      content:
        "Çoğu erkek güçlü olamıyor çünkü disiplini bir hisse bağlıyor, sisteme değil.\n\nHis biter, sistem kalır. Önce sistemi kur.",
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
      reason: "Sistem teşhisi; davranışı mekaniğe bağlıyor, net.",
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
