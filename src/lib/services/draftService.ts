import { accountRepo } from "@/lib/db/accountRepo";
import { sourcePostRepo } from "@/lib/db/sourcePostRepo";
import { queueRepo } from "@/lib/db/queueRepo";
import { generationRunRepo } from "@/lib/db/generationRunRepo";
import { usageService } from "@/lib/services/usageService";
import { accountProfiles, resolveFormatTier, effectiveMaxChars, selectMode, isKnownMode } from "@/lib/accounts";
import { runDraftPipeline } from "@/lib/ai/draft-pipeline";
import { classifyOpenRouterError } from "@/lib/ai/openrouter";
import { buildGroundingContext } from "@/lib/ai/grounding";
import { createMockBenchmark } from "@/lib/ai/mock-benchmark";
import { qualityLintService } from "@/lib/services/qualityLintService";
import { getBudgetStatus } from "@/lib/config/costGate";
import { detectLeaks, conceptKeywordsFrom } from "@/lib/growth-engine/leak-detector";
import { extractSubSignals, applyQualityGate } from "@/lib/services/scoreSignals";
import { isEval14Enabled, runBatchedJudge14, type Judge14Result } from "@/lib/eval/batchedJudge";
import { atomizeService } from "@/lib/services/atomizeService";
import { voiceProfileRepo } from "@/lib/db/voiceProfileRepo";
import type { BenchmarkResult, DraftVoice } from "@/lib/ai/prompts";
import type { QueueItem } from "@/generated/prisma/client";

/** Winner viralPotential at/above which a strong signal is worth atomizing. */
const ATOMIZE_VIRAL_THRESHOLD = 75;

/**
 * Aktif VoiceProfile'ı prompt'a giren DraftVoice yapısına çevirir (item 16).
 * JSON kolonları toleranslı parse edilir; hata/yokluk → undefined (fail-soft).
 */
export async function loadDraftVoice(accountId: string): Promise<DraftVoice | undefined> {
  try {
    const voice = await voiceProfileRepo.getActiveVoice(accountId);
    if (!voice) return undefined;
    const parseArr = (json: string | null | undefined): string[] => {
      if (!json) return [];
      try {
        const p = JSON.parse(json);
        return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
      } catch {
        return [];
      }
    };
    return {
      personality: voice.personality,
      toneTags: parseArr(voice.toneTagsJson),
      vocabulary: parseArr(voice.vocabularyJson).slice(0, 12),
      avoid: parseArr(voice.avoidJson),
      rhythm: voice.rhythm,
      mission: voice.mission,
      pointOfView: voice.pointOfView,
      audience: voice.audience,
    };
  } catch {
    return undefined;
  }
}

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
  // Faz C — opt-in: atomize a strong winner into a linked content package
  //   (reuses ranked candidates, no extra LLM spend). Default off.
  atomize?: boolean;
  /** Optional wall-clock deadline (epoch ms) propagated to each LLM call so a
   *  cron time budget bounds generation (morning cron). */
  deadlineMs?: number;
};

export type GenerateDraftResult = {
  blocked?: boolean;
  reason?: string;
   
  lintReport?: any;
  queueItem?: QueueItem;
  generated: string;
  estimatedCostUsd: number;
  usedMock: boolean;
  // Faz C — set when a content package was atomized from a strong winner.
  packageId?: string;
  packageSiblings?: number;
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
      () => ({ block: "", patternIds: [] as string[], sourcePostIds: [] as string[] })
    );
    const grounding = groundingCtx.block;
    const groundedInput = grounding ? `${grounding}\n\n--- KAYNAK ---\n${sourceInput}` : sourceInput;

    // ── Transparent fallback: a single failing LLM call must never crash the
    //    batch. On error we degrade to a mock draft, flagged usedMock + lastError. ──
    let pipelineResult: BenchmarkResult;
    let pipelineError: string | undefined;
    try {
      // Item 16: aktif VoiceProfile writer SYSTEM prompt'una girer (tek nokta).
      const voice = await loadDraftVoice(account.id);
      pipelineResult = await runDraftPipeline(profile, groundedInput, {
        deadlineMs: input.deadlineMs,
        accountId: account.id,
        voice,
      });
    } catch (err) {
      pipelineError = err instanceof Error ? err.message : String(err);
      // Raw provider text stays in stderr only; the DB stores a category (DH-014).
      console.warn("[draftService] pipeline failed, degrading to mock:", pipelineError);
      pipelineResult = { ...createMockBenchmark(profile), sourceInput, rankedCandidates: [] };
    }
    // ── Single source of truth for format/length: honor the WINNING draft's own
    //    mode — the multi-angle writer + judge already picked the strongest angle
    //    for this source. An explicit caller `input.mode` wins; else the validated
    //    winner mode; else a deliberate source-aware selection. NEVER the accidental
    //    `micro`(140) tier that silently truncated every draft (DH-002). ──
    // Stable per-source seed so the fallback rotation actually varies by source.
    const modeSeed = (input.sourcePostId ?? sourceText)
      .split("")
      .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0);
    const selectedMode =
      (isKnownMode(profile, input.mode) ? input.mode! : undefined) ??
      (isKnownMode(profile, pipelineResult.winner?.mode) ? pipelineResult.winner.mode : undefined) ??
      selectMode(profile, { sourceType, seed: modeSeed }).id;
    const tier = resolveFormatTier(profile, selectedMode);
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

    // ── Faz B: payoff (writer next-move) + content-quality leak detection. ──
    //    hookStrength is only trustworthy when the judge actually ran; the fast
    //    paths leave it at 0, so we pass undefined there to avoid false weak_hook.
    // Persisted mode == the mode the tier was derived from → label and length agree.
    const draftMode = selectedMode;
    const payoff = pipelineResult.winner.payoff;
    const judgeModel = pipelineResult.modelUsed?.judge;
    const judged =
      typeof judgeModel === "string" && judgeModel !== "off" && judgeModel !== "skipped";
    const leaks = detectLeaks({
      content: generated,
      mode: draftMode,
      payoff,
      hookStrength: judged ? pipelineResult.winner.hookStrength : undefined,
      knownPillars: profile.modes.map((m) => m.id),
      conceptKeywords: conceptKeywordsFrom(profile.concept),
      requireConcreteAnchor: input.accountHandle === "grafikcem",
    });

    // ── Sprint 1 ayrışık alt-sinyaller: 8 anahtar + leaks[] HER ZAMAN dolu. ──
    const subSignals = extractSubSignals(pipelineResult.winner, leaks);

    // ── Bloklayıcı kalite kapısı (item 8): yüksek-şiddet leak / cap-altı Türkçe
    //    doğallık / yasak-klişe → `active` OLAMAZ; needs_edit + Türkçe neden.
    //    Redirect, silme değil — taslak kuyrukta düzenlenmeyi bekler. ──
    const qualityGate = applyQualityGate({
      leaks,
      judged,
      turkishNaturalness: subSignals.turkishNaturalness,
      lintIssues: lintReport.issues,
    });
    if (qualityGate.notes.length > 0) {
      for (const note of qualityGate.notes) {
        lintReport.warnings.push(note);
        lintReport.issues.push({ code: "quality_gate", severity: "warning", message: note });
      }
    }

    // ── Sprint 9: batched 14-skor judge (EVAL14_ENABLED, kademeli). Kapalıyken
    //    sıfır çağrı/sıfır maliyet — davranış birebir eski. Açıkken tek batched
    //    cemos-final-judge çağrısı [J] skorlarını üretir, [D] skorlar koddan;
    //    fail-open: hata taslak üretimini asla bozmaz, alan boş kalır. ──
    let eval14: Judge14Result | null = null;
    if (isEval14Enabled() && !pipelineResult.usedMock) {
      try {
        eval14 = await runBatchedJudge14({
          profile,
          sourceText,
          draftContent: generated,
          accountId: account.id,
          deterministic: {
            sourceTier: input.newsItemId ? "known" : "unknown",
            corroborations: 0,
            sourcePublishedAtMs: null, // kaynak yayın zamanı threading'i: dalga-2
            charCount: generated.length,
            maxChars: tierMaxChars,
            usedMock: pipelineResult.usedMock ?? false,
            highLeakCount: leaks.filter((l) => l.severity === "high").length,
            lintErrorCount: lintReport.blockers.length,
          },
        });
      } catch (err) {
        console.warn("[draftService] eval14 batched judge atlandı (fail-open):", err instanceof Error ? err.message : err);
      }
    }

    const queueItem = await queueRepo.create({
      accountId: account.id,
      sourcePostId: sourcePostId,
      newsItemId: input.newsItemId,
      imageUrl: input.imageUrl,
      content: generated,
      draftType,
      mode: draftMode,
      status: qualityGate.status === "needs_edit" ? "needs_edit" : undefined,
      estimatedCostUsd: (pipelineResult.estimatedCostUsd ?? 0) + (eval14?.costUsd ?? 0),
      usedMock: pipelineResult.usedMock ?? false,
      scores: JSON.stringify({
        ...pipelineResult.winner,
        // Ayrışık alt-sinyal sözleşmesi: 8 anahtar + payoff + leaks garanti.
        ...subSignals,
        modelUsed: pipelineResult.modelUsed,
        // Engagement learning loop re-weights exactly these patterns later.
        groundingPatternIds: groundingCtx.patternIds,
        groundingSourcePostIds: groundingCtx.sourcePostIds,
        // Sprint 9 — 14 alt-skor (EVAL14_ENABLED açıkken dolu; UI sözleşmesi:
        // alan yoksa eski 8-sinyal görünümü aynen sürer).
        ...(eval14
          ? {
              subscores14: eval14.subscores,
              composite14: eval14.composite.composite,
              vetoed14: eval14.composite.vetoed,
              judge14Model: eval14.judgeModel,
              judge14Evidence: eval14.evidence,
            }
          : {}),
        // Phase 2 quality telemetry (DH-015): explains WHY a draft is the length
        // it is — surfaces the mode/tier/charCount so a too-short draft is visible.
        telemetry: {
          selectedMode,
          tier: tier.id,
          charCount: generated.length,
          minChars: tier.minChars,
          maxChars: tierMaxChars,
          candidateCount: (pipelineResult.rankedCandidates ?? []).length,
          judged,
          writerFallback: pipelineResult.modelUsed?.writerFallbackUsed ?? false,
        },
      }),
      lintReport: JSON.stringify(lintReport),
      candidatesJson: JSON.stringify(pipelineResult.rankedCandidates ?? []),
      lastError: pipelineError ? classifyOpenRouterError(pipelineError) : undefined,
    });

    await generationRunRepo.create({
      accountId: account.id,
      queueItemId: queueItem.id,
      modelUsed: typeof pipelineResult.modelUsed === "string" ? pipelineResult.modelUsed : JSON.stringify(pipelineResult.modelUsed),
      estimatedCostUsd: pipelineResult.estimatedCostUsd ?? 0,
      usedMock: pipelineResult.usedMock ?? false,
    });

    // Dalga-1 migration sonrası writer/judge/editor çağrıları generateJsonGated
    // içinden GERÇEK maliyetiyle birer UsageLog satırı yazar (purpose: writer_/judge_).
    // Burada pipeline toplamını tekrar yazmak maliyeti ÇİFT sayardı; bu satır artık
    // yalnız "üretim olayı" sayacıdır (0 maliyet). Mock yolunda da maliyet 0'dır.
    await usageService.recordGeneration({
      accountId: account.id,
      estimatedCostUsd: 0,
    });

    if (sourcePostId) {
      await sourcePostRepo.markUsed(sourcePostId);
    }

    // ── Faz C: opt-in atomization. A strong signal (high viralPotential) is
    //    worth more than one post — spawn linked sibling assets from the
    //    already-ranked candidates. Reused candidates → no extra LLM spend.
    //    Fail-soft: a packaging error must never lose the main draft. ──
    let packageId: string | undefined;
    let packageSiblings = 0;
    const candidates = pipelineResult.rankedCandidates ?? [];
    if (
      input.atomize &&
      judged &&
      candidates.length >= 2 &&
      pipelineResult.winner.viralPotential >= ATOMIZE_VIRAL_THRESHOLD
    ) {
      try {
        const pkg = await atomizeService.atomizePackage({
          accountHandle: input.accountHandle,
          mainQueueItem: queueItem,
          candidates,
          judged,
        });
        packageId = pkg.packageId;
        packageSiblings = pkg.created;
      } catch (atomizeErr) {
        console.warn("[draftService] atomize failed (keeping main draft):", atomizeErr);
      }
    }

    return {
      queueItem,
      generated,
      estimatedCostUsd: pipelineResult.estimatedCostUsd ?? 0,
      usedMock: pipelineResult.usedMock ?? false,
      packageId,
      packageSiblings,
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
