import { accountRepo } from "@/lib/db/accountRepo";
import { sourcePostRepo } from "@/lib/db/sourcePostRepo";
import { queueRepo } from "@/lib/db/queueRepo";
import { generationRunRepo } from "@/lib/db/generationRunRepo";
import { usageService } from "@/lib/services/usageService";
import { accountProfiles, resolveFormatTier, effectiveMaxChars } from "@/lib/accounts";
import { runDraftPipeline } from "@/lib/ai/draft-pipeline";
import { buildGroundingContext } from "@/lib/ai/grounding";
import { createMockBenchmark } from "@/lib/ai/mock-benchmark";
import { qualityLintService } from "@/lib/services/qualityLintService";
import { getBudgetStatus } from "@/lib/config/costGate";
import type { BenchmarkResult } from "@/lib/ai/prompts";
import type { QueueItem } from "@/generated/prisma/client";

function fitToMaxChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, Math.max(0, maxChars - 3));
  const sentenceEnd = Math.max(
    clipped.lastIndexOf("."),
    clipped.lastIndexOf("?"),
    clipped.lastIndexOf("!")
  );
  if (sentenceEnd > 80) return clipped.slice(0, sentenceEnd + 1);
  return `${clipped.trimEnd()}...`;
}

export type GenerateDraftInput = {
  accountHandle: string;
  sourcePostId?: string;
  sourceTweet?: string;
  sourceHandle?: string;
  draftType?: string;
  mode?: string;
  // News→draft bridge: grounding NewsItem id + carried-over source image.
  newsItemId?: string;
  imageUrl?: string;
};

export type GenerateDraftResult = {
  blocked?: boolean;
  reason?: string;
   
  lintReport?: any;
  queueItem?: QueueItem;
  generated: string;
  estimatedCostUsd: number;
  usedMock: boolean;
  candidates: import("@/lib/ai/prompts").RankedCandidate[];
  timings: {
    writerMs: number;
    judgeMs: number;
    lintMs: number;
    totalMs: number;
  };
};

export const draftService = {
  async generateDraft(input: GenerateDraftInput): Promise<GenerateDraftResult> {
    const totalStart = Date.now();

    const account = await accountRepo.findByHandle(input.accountHandle);
    if (!account) throw new Error(`Account not found: ${input.accountHandle}`);

    const profile = accountProfiles[input.accountHandle as keyof typeof accountProfiles];
    if (!profile) throw new Error(`Profile not found: ${input.accountHandle}`);

    let sourceText = input.sourceTweet ?? "";
    let sourceType: string | undefined;
    const sourcePostId = input.sourcePostId;

    if (sourcePostId) {
      const sp = await sourcePostRepo.findById(sourcePostId);
      if (sp) {
        if (!sourceText) sourceText = sp.text;
        sourceType = sp.sourceType;
      }
    }

    if (!sourceText) throw new Error("sourceTweet veya sourcePostId gerekli");

    const compactSource =
      sourceText.length > 900 ? `${sourceText.slice(0, 900)}...` : sourceText;

    const sourceInput = [
      `Kaynak hesap: @${String(input.sourceHandle ?? "unknown").replace("@", "")}`,
      `Draft tipi: ${input.draftType ?? "TWEET"}`,
      `Kaynak tweet: ${compactSource}`,
    ].join("\n");

    // ── Hard budget gate: stop before any LLM spend if the month is exhausted ──
    const budget = await getBudgetStatus();
    if (!budget.allowed) {
      return {
        blocked: true,
        reason: "budget",
        generated: "",
        estimatedCostUsd: 0,
        usedMock: false,
        candidates: [],
        timings: { writerMs: 0, judgeMs: 0, lintMs: 0, totalMs: Date.now() - totalStart },
      };
    }

    // ── Phase 3 grounding: prepend mined viral patterns + semantic memory +
    //    brand-voice discipline so the writer is grounded, not generic. Fail-soft. ──
    const groundingCtx = await buildGroundingContext(profile, account.id, sourceText, sourceType).catch(
      () => ({ block: "", patternIds: [] as string[] })
    );
    const grounding = groundingCtx.block;
    const groundedInput = grounding ? `${grounding}\n\n--- KAYNAK ---\n${sourceInput}` : sourceInput;

    // ── Transparent fallback: a single failing LLM call must never crash the
    //    batch. On error we degrade to a mock draft, flagged usedMock + lastError. ──
    let pipelineResult: BenchmarkResult;
    let pipelineError: string | undefined;
    try {
      pipelineResult = await runDraftPipeline(profile, groundedInput);
    } catch (err) {
      pipelineError = err instanceof Error ? err.message : String(err);
      pipelineResult = { ...createMockBenchmark(profile), sourceInput, rankedCandidates: [] };
    }
    // ── Format tier: derive the target length band from the chosen mode so the
    //    char-cap and lint match the intended tier (e.g. punch ≤280, thread variable). ──
    const tier = resolveFormatTier(profile, input.mode);
    const tierMaxChars = effectiveMaxChars(profile, tier);
    let generated = fitToMaxChars(pipelineResult.winner.content, tierMaxChars);

    const draftType = input.draftType ?? "TWEET";
    const lintStart = Date.now();
    const lintReport = await qualityLintService.lint(generated, draftType, tierMaxChars, {
      accountHandle: input.accountHandle,
      sourceText,
      minChars: tier.minChars,
    });
    const lintMs = Date.now() - lintStart;

    if (lintReport.cleanedText && lintReport.passed) {
      generated = lintReport.cleanedText;
    }

    if (!lintReport.passed) {
      if (sourcePostId) {
        // Mark as blocked to prevent re-processing later and indicate failure reason
        await sourcePostRepo.markBlocked(sourcePostId);
      }
      
      // Mark as blocked, do not create a QueueItem, just return early
      return {
        blocked: true,
        reason: "Lint failed or mojibake detected",
        lintReport,
        generated,
        estimatedCostUsd: pipelineResult.estimatedCostUsd ?? 0,
        usedMock: pipelineResult.usedMock ?? false,
        candidates: pipelineResult.rankedCandidates ?? [],
        timings: {
          writerMs: pipelineResult.timings?.writerMs ?? 0,
          judgeMs: pipelineResult.timings?.judgeMs ?? 0,
          lintMs,
          totalMs: Date.now() - totalStart,
        },
      };
    }

    const queueItem = await queueRepo.create({
      accountId: account.id,
      sourcePostId: sourcePostId,
      newsItemId: input.newsItemId,
      imageUrl: input.imageUrl,
      content: generated,
      draftType,
      mode: input.mode ?? profile.modes[0]?.id ?? "default",
      estimatedCostUsd: pipelineResult.estimatedCostUsd ?? 0,
      usedMock: pipelineResult.usedMock ?? false,
      scores: JSON.stringify({
        ...pipelineResult.winner,
        modelUsed: pipelineResult.modelUsed,
        // Engagement learning loop re-weights exactly these patterns later.
        groundingPatternIds: groundingCtx.patternIds,
      }),
      lintReport: JSON.stringify(lintReport),
      candidatesJson: JSON.stringify(pipelineResult.rankedCandidates ?? []),
      lastError: pipelineError,
    });

    await generationRunRepo.create({
      accountId: account.id,
      queueItemId: queueItem.id,
      modelUsed: typeof pipelineResult.modelUsed === "string" ? pipelineResult.modelUsed : JSON.stringify(pipelineResult.modelUsed),
      estimatedCostUsd: pipelineResult.estimatedCostUsd ?? 0,
      usedMock: pipelineResult.usedMock ?? false,
    });

    await usageService.recordGeneration({
      accountId: account.id,
      estimatedCostUsd: pipelineResult.estimatedCostUsd ?? 0,
    });

    if (sourcePostId) {
      await sourcePostRepo.markUsed(sourcePostId);
    }

    return {
      queueItem,
      generated,
      estimatedCostUsd: pipelineResult.estimatedCostUsd ?? 0,
      usedMock: pipelineResult.usedMock ?? false,
      candidates: pipelineResult.rankedCandidates ?? [],
      timings: {
        writerMs: pipelineResult.timings?.writerMs ?? 0,
        judgeMs: pipelineResult.timings?.judgeMs ?? 0,
        lintMs,
        totalMs: Date.now() - totalStart,
      },
    };
  },
};
