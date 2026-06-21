import type { AccountProfile } from "@/lib/accounts";
import { createMockBenchmark } from "@/lib/ai/mock-benchmark";
import {
  buildDraftSystemPrompt,
  buildDraftUserPrompt,
  buildJudgeSystemPrompt,
  buildJudgeUserPrompt,
  type BenchmarkResult,
  type DraftWithAngle,
  type DraftScore,
  type RankedCandidate,
} from "@/lib/ai/prompts";
import { generateJson } from "@/lib/ai/openrouter";
import { runDeterministicHeuristics } from "@/lib/safety/heuristics";
import { getJudgeMode } from "@/lib/ai/model-config";

type DraftResponse = {
  drafts: DraftWithAngle[];
};

type JudgeResponse = {
  rankedCandidates: RankedCandidate[];
  winnerIndex: number;
  publishDecision: "queue" | "hold" | "reject";
};

function rankedToScore(rc: RankedCandidate): DraftScore {
  return {
    content: rc.content,
    mode: rc.mode,
    personaMatch: rc.accountFit,
    turkishNaturalness: rc.turkishNaturalness,
    hookStrength: rc.hookStrength,
    clarity: Math.round((rc.hookStrength + rc.turkishNaturalness) / 2),
    viralPotential: rc.viralPotential,
    risk: rc.risk,
    sourceFaithfulness: rc.sourceFaithfulness,
    verdict: rc.verdict,
    reason: rc.reason,
    payoff: rc.payoff,
  };
}

export async function runDraftPipeline(profile: AccountProfile, sourceInput: string): Promise<BenchmarkResult> {
  const totalStart = Date.now();
  if (!process.env.OPENROUTER_API_KEY) {
    const mock = createMockBenchmark(profile);
    return { ...mock, sourceInput, rankedCandidates: [] };
  }

  const judgeMode = getJudgeMode(profile.handle);

  // Prefer the REAL OpenRouter request cost (usage.cost) over the token estimate.
  // `actualCostUsd` always falls back to the estimate inside generateJson, so this
  // is non-breaking and simply tightens cost accuracy when the provider reports it.
  const costOf = (run: { actualCostUsd?: number; estimatedCostUsd: number }) =>
    typeof run.actualCostUsd === "number" ? run.actualCostUsd : run.estimatedCostUsd;

  // ── Phase 1: Multi-angle writer ───────────────────────────────────────────
  const writerStart = Date.now();
  const draftRun = await generateJson<DraftResponse>({
    role: "creativeWriter",
    system: buildDraftSystemPrompt(profile),
    user: buildDraftUserPrompt(profile, sourceInput),
    temperature: 0.9,
  });
  const writerMs = Date.now() - writerStart;

  const draftsRaw: DraftWithAngle[] = Array.isArray(draftRun.data.drafts)
    ? draftRun.data.drafts.filter((d) => d?.content?.trim())
    : [];

  if (draftsRaw.length === 0) {
    const mock = createMockBenchmark(profile);
    return { ...mock, sourceInput, rankedCandidates: [], timings: { writerMs, judgeMs: 0 } };
  }

  // ── Risk-based fast path ──────────────────────────────────────────────────
  if (judgeMode === "off") {
    const best = draftsRaw[0];
    const fastWinner: DraftScore = {
      content: best.content,
      mode: best.mode,
      personaMatch: 0, turkishNaturalness: 0, hookStrength: 0,
      clarity: 0, viralPotential: 0, risk: 0, sourceFaithfulness: 0,
      verdict: "approve",
      reason: "judge-off: skip",
      payoff: best.payoff,
    };
    const fastCandidates: RankedCandidate[] = draftsRaw.slice(0, 3).map((d) => ({
      content: d.content, mode: d.mode, angle: d.angle ?? "",
      hookStrength: 0, viralPotential: 0, accountFit: 0,
      turkishNaturalness: 0, noveltyScore: 0, risk: 0, sourceFaithfulness: 0,
      verdict: "approve" as const, reason: "judge-off",
      payoff: d.payoff,
    }));
    return {
      account: profile.handle,
      modelUsed: {
        writer: draftRun.model,
        judge: "off",
        writerFallbackUsed: draftRun.modelFallbackUsed ?? false,
        writerFallbackReason: draftRun.modelFallbackReason,
      },
      sourceInput,
      drafts: [fastWinner],
      rankedCandidates: fastCandidates,
      winner: fastWinner,
      publishDecision: "queue",
      estimatedCostUsd: costOf(draftRun),
      usedMock: false,
      timings: { writerMs, judgeMs: 0 },
    };
  }

  if (judgeMode === "risk_based") {
    const firstContent = draftsRaw[0]?.content ?? "";
    const heuristic = runDeterministicHeuristics(firstContent, "TWEET", profile.maxChars, profile.handle);
    if (heuristic.issues.length === 0) {
      const fastWinner: DraftScore = {
        content: firstContent,
        mode: draftsRaw[0]?.mode ?? profile.modes[0]?.id ?? "default",
        personaMatch: 0, turkishNaturalness: 0, hookStrength: 0,
        clarity: 0, viralPotential: 0, risk: 0, sourceFaithfulness: 0,
        verdict: "approve",
        reason: "fast-path: deterministic lint passed",
        payoff: draftsRaw[0]?.payoff,
      };
      const fastCandidates: RankedCandidate[] = draftsRaw.slice(0, 3).map((d) => ({
        content: d.content, mode: d.mode, angle: d.angle ?? "",
        hookStrength: 0, viralPotential: 0, accountFit: 0,
        turkishNaturalness: 0, noveltyScore: 0, risk: 0, sourceFaithfulness: 0,
        verdict: "approve" as const, reason: "fast-path",
        payoff: d.payoff,
      }));
      return {
        account: profile.handle,
        modelUsed: {
          writer: draftRun.model,
          judge: "skipped",
          writerFallbackUsed: draftRun.modelFallbackUsed ?? false,
          writerFallbackReason: draftRun.modelFallbackReason,
        },
        sourceInput,
        drafts: [fastWinner],
        rankedCandidates: fastCandidates,
        winner: fastWinner,
        publishDecision: "queue",
        estimatedCostUsd: costOf(draftRun),
        usedMock: false,
        timings: { writerMs, judgeMs: 0 },
      };
    }
  }

  // ── Phase 2: Viral judge ──────────────────────────────────────────────────
  const judgeStart = Date.now();
  const judgeRun = await generateJson<JudgeResponse>({
    role: "viralJudge",
    system: buildJudgeSystemPrompt(profile),
    user: buildJudgeUserPrompt(profile, sourceInput, draftsRaw),
    temperature: 0.2,
  });
  const judgeMs = Date.now() - judgeStart;

  const rankedCandidates: RankedCandidate[] = Array.isArray(judgeRun.data.rankedCandidates)
    ? judgeRun.data.rankedCandidates.slice(0, 3)
    : [];

  // Fallback: if judge returns empty ranked, promote drafts directly
  const effectiveCandidates: RankedCandidate[] = rankedCandidates.length > 0
    ? rankedCandidates
    : draftsRaw.slice(0, 3).map((d) => ({
        content: d.content, mode: d.mode, angle: d.angle ?? "",
        hookStrength: 50, viralPotential: 50, accountFit: 50,
        turkishNaturalness: 50, noveltyScore: 50, risk: 20, sourceFaithfulness: 80,
        verdict: "hold" as const, reason: "judge döndürmedi",
        payoff: d.payoff,
      }));

  const winner = rankedToScore(effectiveCandidates[0]);
  const allDraftScores = effectiveCandidates.map(rankedToScore);

  // ── Phase 3: Final Editor (Optional cila step on the winner) ──────────────────
  const activeProfile = process.env.MODEL_PROFILE || "operator_quality";
  const enableFinalEditor = process.env.ENABLE_FINAL_EDITOR === "true" || (activeProfile === "operator_quality" && process.env.ENABLE_FINAL_EDITOR !== "false");
  let finalEditorMs = 0;
  let finalEditorCost = 0;
  let finalEditorModelUsed = "none";

  if (enableFinalEditor && winner && winner.content) {
    const editorStart = Date.now();
    try {
      const buildFinalEditorSystemPrompt = (prof: AccountProfile) => `
Sen profesyonel bir Türkçe Baş Editörsün. Görevin, sağlanan sosyal medya taslağını aşağıdaki kurallara göre en mükemmel, doğal ve dikkat çekici hale getirmektir.

YAYINCI PROFİLİ VE HESAP TONU:
- Kullanıcı Adı: @${prof.handle}
- Konsept: ${prof.concept}
- Maksimum Karakter Limiti: ${prof.maxChars} karakter. Kesinlikle bu limiti aşma.

DÜZELTME VE CİLALAMA TALİMATLARI:
1. Türkçe Doğallığı: Yapay zeka veya çeviri kokan yapıları temizle. Türkçe diline, mecazlarına ve kelime oyunlarına uygun, samimi, akıcı ve doğal bir dil kullan.
2. Soru Kalıplarını Temizle: Cümle sonlarındaki gereksiz ve klişe soru kalıplarını (örn. "Peki siz ne düşünüyorsunuz?", "Sizce bu doğru mu?") tamamen temizle. Okuyucuyla daha özgüvenli ve iddialı bir ton kur.
3. Güçlü Hook (Giriş): Giriş cümlesini daha merak uyandırıcı, çarpıcı ve güçlü hale getir.
4. Hesap Tonuna Uyum: Metni @${prof.handle} hesabının tarzına (teknik, samimi veya dinamik) kusursuzca uyarla.
5. Yapı: Linkleri, emojileri veya etiketleri (varsa) bozma, yerlerini koru.

Girdi olarak verilen metni düzenle ve sadece düzenlenmiş nihai JSON objesini döndür. Başka hiçbir açıklama yazma.
`;

      const buildFinalEditorUserPrompt = (originalContent: string) => `
Düzenlenecek Orijinal Taslak:
"""
${originalContent}
"""

Lütfen bu metni cila kurallarına göre düzenle ve aşağıdaki JSON formatında döndür:
{
  "content": "düzenlenmiş doğal türkçe metin"
}
`;

      const editorRun = await generateJson<{ content: string }>({
        role: "finalEditor",
        system: buildFinalEditorSystemPrompt(profile),
        user: buildFinalEditorUserPrompt(winner.content),
        temperature: 0.3,
      });

      if (editorRun.data?.content) {
        winner.content = editorRun.data.content;
        finalEditorModelUsed = editorRun.model;
        finalEditorCost = costOf(editorRun);
      }
    } catch (editorErr) {
      console.warn("[Draft Pipeline] Final Editor step failed:", editorErr);
    }
    finalEditorMs = Date.now() - editorStart;
  }

  return {
    account: profile.handle,
    modelUsed: {
      writer: draftRun.model,
      judge: judgeRun.model,
      finalEditor: finalEditorModelUsed,
      writerFallbackUsed: draftRun.modelFallbackUsed ?? false,
      writerFallbackReason: draftRun.modelFallbackReason,
      judgeFallbackUsed: judgeRun.modelFallbackUsed ?? false,
      judgeFallbackReason: judgeRun.modelFallbackReason,
    },
    sourceInput,
    drafts: allDraftScores,
    rankedCandidates: effectiveCandidates,
    winner,
    publishDecision: judgeRun.data.publishDecision ?? "hold",
    estimatedCostUsd: costOf(draftRun) + costOf(judgeRun) + finalEditorCost,
    usedMock: false,
    timings: { writerMs, judgeMs, finalEditorMs, totalMs: Date.now() - totalStart },
  };
}
