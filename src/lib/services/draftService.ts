import { accountRepo } from "@/lib/db/accountRepo";
import { sourcePostRepo } from "@/lib/db/sourcePostRepo";
import { queueRepo } from "@/lib/db/queueRepo";
import { generationRunRepo } from "@/lib/db/generationRunRepo";
import { usageService } from "@/lib/services/usageService";
import { resolveFormatTier, effectiveMaxChars, selectMode, isKnownMode } from "@/lib/accounts";
import { getRuntimeProfile } from "@/lib/accounts/profileRepository";
import { runDraftPipeline, rankedToScore } from "@/lib/ai/draft-pipeline";
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
import { runDeterministicHeuristics } from "@/lib/safety/heuristics";
import {
  canonicalThreadPayload,
  effectiveThreadSegmentLimit,
  serializeThreadSegments,
  validateThreadSegments,
  type ThreadSegment,
} from "@/lib/growth-engine/threadSegments";
import type { BenchmarkResult, DraftVoice, RankedCandidate } from "@/lib/ai/prompts";
import type { LintReport } from "@/lib/services/qualityLintService";
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

/** Aday thread doğasında mı (mod veya yapısal segment)? */
function isThreadCandidate(c: { mode?: string; threadSegments?: { text: string }[] | null }): boolean {
  if ((c.mode ?? "").toLowerCase() === "thread") return true;
  return Array.isArray(c.threadSegments) && c.threadSegments.length > 0;
}

/** Aday, segment sınırında GEÇERLİ yapısal thread taşıyor mu? */
function hasValidThreadSegments(
  c: { threadSegments?: { text: string }[] | null },
  segmentLimit: number
): boolean {
  if (!c.threadSegments || c.threadSegments.length === 0) return false;
  return validateThreadSegments(c.threadSegments, segmentLimit).ok;
}

/**
 * Phase 2D thread lint (ADR-033): deterministik safety kontrolleri SEGMENT
 * BAZINDA koşar (char limit = effectiveThreadSegmentLimit; birleşik metin tek
 * account-maxChars sınırıyla kesilmez/bloklanmaz). Segment başına ayrı ücretli
 * LLM lint çağrısı YAPILMAZ (maliyet invariant'ı) — LLM mikro-pass thread'de
 * bilinçli atlanır. `half_sentence_end` segmentlerde uygulanmaz: thread hook'u
 * ':' ile bitip listeye bağlanabilir; segment tek başına tweet değildir.
 */
function lintThreadSegments(
  segments: ThreadSegment[],
  segmentLimit: number,
  accountHandle: string,
  sourceText?: string
): LintReport {
  const issues: LintReport["issues"] = [];
  segments.forEach((seg, i) => {
    const res = runDeterministicHeuristics(seg.text, "TWEET", segmentLimit, accountHandle, sourceText);
    for (const issue of res.issues) {
      if (issue.code === "half_sentence_end" || issue.code === "below_min_chars") continue;
      issues.push({ ...issue, message: `Segment ${i + 1}: ${issue.message}` });
    }
  });
  const blockers = issues.filter((i) => i.severity === "blocker").map((i) => i.message);
  const warnings = issues.filter((i) => i.severity === "warning").map((i) => i.message);
  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
    issues,
    cleanedText: null,
    checkedAt: new Date().toISOString(),
    source: { deterministic: true, llm: false },
  };
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

    // ADR-031: profil otoritesi DB — bilinmeyen/draft/inaktif hesap fail-closed.
    const profile = await getRuntimeProfile(input.accountHandle, { requireGenerationReady: true });

    let sourceText = input.sourceTweet ?? "";
    let sourceType: string | undefined;
    let sourceModeIsThread = false;
    const sourcePostId = input.sourcePostId;

    if (sourcePostId) {
      const sp = await sourcePostRepo.findByIdWithSourceMode(sourcePostId);
      if (sp) {
        if (!sourceText) sourceText = sp.text;
        sourceType = sp.sourceType;
        // Phase 2D: Source.mode=thread kaynak → gerçek thread isteği (caller'ın
        // körlemesine geçirdiği draftType:"TWEET" thread niyetini ezemez).
        sourceModeIsThread = (sp.source?.mode ?? "").toLowerCase() === "thread";
      }
    }

    if (!sourceText) throw new Error("sourceTweet veya sourcePostId gerekli");

    // ── Phase 2D format niyeti (ADR-033) ────────────────────────────────────
    //  thread: draftType=THREAD / mode=thread / kaynak modu thread → thread ZORUNLU.
    //  tweet : çağıran bilinen NON-thread bir modu açıkça sabitledi → thread'e
    //          yükseltme YASAK (thread kazanan uzun içerik TWEET diye persist edilmez).
    //  auto  : körlemesine "TWEET" default'u dahil geri kalan her şey — kazanan
    //          geçerli thread ise draftType=THREAD olarak persist edilir.
    const wantsThread =
      (input.draftType ?? "").toUpperCase() === "THREAD" ||
      (input.mode ?? "").toLowerCase() === "thread" ||
      sourceModeIsThread;
    const explicitTweetLock =
      !wantsThread && Boolean(input.mode) && isKnownMode(profile, input.mode);
    const formatIntent: "thread" | "tweet" | "auto" = wantsThread
      ? "thread"
      : explicitTweetLock
        ? "tweet"
        : "auto";
    const segmentLimit = effectiveThreadSegmentLimit(profile.maxChars);

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
      () => ({ block: "", patternIds: [] as string[], sourcePostIds: [] as string[], memoryFactIds: [] as string[] })
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
        // Phase 2D: istenen format writer'a AÇIKÇA gider (thread'de yapısal
        // threadSegments zorunlu; tweet'te yasak; auto'da thread açısında dolu).
        format: { intent: formatIntent, segmentLimit },
      });
    } catch (err) {
      pipelineError = err instanceof Error ? err.message : String(err);
      // Raw provider text stays in stderr only; the DB stores a category (DH-014).
      console.warn("[draftService] pipeline failed, degrading to mock:", pipelineError);
      pipelineResult = { ...createMockBenchmark(profile), sourceInput, rankedCandidates: [] };
    }
    const blockedResult = (reason: string): GenerateDraftResult => ({
      blocked: true,
      reason,
      generated: "",
      estimatedCostUsd: pipelineResult.estimatedCostUsd ?? 0,
      usedMock: pipelineResult.usedMock ?? false,
      candidates: pipelineResult.rankedCandidates ?? [],
      timings: {
        writerMs: pipelineResult.timings?.writerMs ?? 0,
        judgeMs: pipelineResult.timings?.judgeMs ?? 0,
        lintMs: 0,
        totalMs: Date.now() - totalStart,
      },
    });

    // ── Phase 2D aday seçimi (ADR-033): canonical içerik provenance'lı writer
    //    adayından gelir; sahte tek-segment/mock thread ASLA yazılmaz. ──
    if (formatIntent === "thread" && (pipelineResult.threadRequestUnsatisfied || pipelineResult.usedMock)) {
      return blockedResult("thread_generation_invalid");
    }

    const ranked: RankedCandidate[] = pipelineResult.rankedCandidates ?? [];
    let chosen: RankedCandidate | null = ranked[0] ?? null;
    let threadSelection: string | undefined;

    if (formatIntent === "thread") {
      chosen = ranked.find((c) => hasValidThreadSegments(c, segmentLimit)) ?? null;
      if (!chosen) return blockedResult("thread_generation_invalid");
      if (chosen !== ranked[0]) threadSelection = "thread_candidate_not_winner";
    } else if (formatIntent === "tweet") {
      if (ranked.length > 0) {
        chosen = ranked.find((c) => !isThreadCandidate(c)) ?? null;
        // Explicit TWEET kilidi: thread kazanan uzun içerik TWEET diye persist
        // EDİLMEZ; thread dışı aday yoksa dürüst blocked.
        if (!chosen) return blockedResult("no_non_thread_candidate");
        if (chosen !== ranked[0]) threadSelection = "tweet_intent_skipped_thread_winner";
      }
    } else if (chosen && isThreadCandidate(chosen)) {
      if (hasValidThreadSegments(chosen, segmentLimit)) {
        // Auto üretimde thread kazandı → draftType THREAD olarak persist edilir.
        threadSelection = "auto_thread_winner";
      } else {
        // Geçersiz thread adayı: sessiz truncation/sahte thread yerine geçerli
        // non-thread adaya düş (trace'te görünür); o da yoksa dürüst blocked.
        const alt = ranked.find((c) => !isThreadCandidate(c)) ?? null;
        if (!alt) return blockedResult("thread_generation_invalid");
        chosen = alt;
        threadSelection = "invalid_thread_winner_used_non_thread";
      }
    }

    // Kazanan skor kaydı = seçilen aday (mock yolunda ranked boş → pipeline winner).
    const winnerScore = chosen ? rankedToScore(chosen) : pipelineResult.winner;
    const isThreadFinal =
      formatIntent === "thread" || threadSelection === "auto_thread_winner";

    // ── Single source of truth for format/length: honor the CHOSEN draft's own
    //    mode. An explicit caller `input.mode` wins; else the validated chosen
    //    mode; else a deliberate source-aware selection. NEVER the accidental
    //    `micro`(140) tier that silently truncated every draft (DH-002). ──
    // Stable per-source seed so the fallback rotation actually varies by source.
    const modeSeed = (input.sourcePostId ?? sourceText)
      .split("")
      .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0);

    let selectedMode: string;
    let generated: string;
    let threadPayload: { segments: ThreadSegment[]; content: string } | null = null;
    if (isThreadFinal) {
      // Canonical content DOĞRULANMIŞ segmentlerden türetilir; birleşik metin
      // fitToMaxChars ile KESİLMEZ (sessiz truncation yasak — segment sınırı
      // zaten doğrulandı).
      threadPayload = canonicalThreadPayload(chosen!.threadSegments!);
      generated = threadPayload.content;
      selectedMode = isKnownMode(profile, "thread")
        ? "thread"
        : (isKnownMode(profile, input.mode) ? input.mode! : "thread");
    } else {
      selectedMode =
        (isKnownMode(profile, input.mode) ? input.mode! : undefined) ??
        (isKnownMode(profile, winnerScore?.mode) ? winnerScore.mode : undefined) ??
        selectMode(profile, { sourceType, seed: modeSeed }).id;
      generated = ""; // fitToMaxChars tier hesaplandıktan sonra (aşağıda).
    }
    const tier = resolveFormatTier(profile, selectedMode);
    const tierMaxChars = effectiveMaxChars(profile, tier);
    if (!isThreadFinal) {
      generated = fitToMaxChars(winnerScore.content, tierMaxChars);
    }

    // mode=thread + draftType=TWEET tarihî uyumsuzluğu burada kapanır: thread
    // sonucu HER ZAMAN draftType=THREAD; tweet sonucu asla "thread" etiketi almaz.
    // (thread niyeti ya THREAD üretti ya yukarıda blocked döndü — burada
    //  isThreadFinal=false iken input.draftType THREAD olamaz.)
    const draftType = isThreadFinal ? "THREAD" : (input.draftType ?? "TWEET");
    const lintStart = Date.now();
    const lintReport: LintReport = isThreadFinal
      ? lintThreadSegments(threadPayload!.segments, segmentLimit, input.accountHandle, sourceText)
      : await qualityLintService.lint(generated, draftType, tierMaxChars, {
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
    const payoff = winnerScore.payoff;
    const judgeModel = pipelineResult.modelUsed?.judge;
    const judged =
      typeof judgeModel === "string" && judgeModel !== "off" && judgeModel !== "skipped";
    const leaks = detectLeaks({
      content: generated,
      mode: draftMode,
      payoff,
      hookStrength: judged ? winnerScore.hookStrength : undefined,
      knownPillars: profile.modes.map((m) => m.id),
      conceptKeywords: conceptKeywordsFrom(profile.concept),
      requireConcreteAnchor: input.accountHandle === "grafikcem",
    });

    // ── Sprint 1 ayrışık alt-sinyaller: 8 anahtar + leaks[] HER ZAMAN dolu. ──
    const subSignals = extractSubSignals(winnerScore, leaks);

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

    // scores JSON'a segment dizisi KOPYALANMAZ — canonical yer QueueItem.threadSegments.
    const { threadSegments: _winnerSegments, ...winnerForScores } = winnerScore;

    const queueItem = await queueRepo.create({
      accountId: account.id,
      sourcePostId: sourcePostId,
      newsItemId: input.newsItemId,
      imageUrl: input.imageUrl,
      content: generated,
      draftType,
      mode: draftMode,
      // Phase 2D: thread'in canonical publication payload'ı TEK create içinde.
      threadSegments: threadPayload ? serializeThreadSegments(threadPayload.segments) : undefined,
      status: qualityGate.status === "needs_edit" ? "needs_edit" : undefined,
      estimatedCostUsd: (pipelineResult.estimatedCostUsd ?? 0) + (eval14?.costUsd ?? 0),
      usedMock: pipelineResult.usedMock ?? false,
      scores: JSON.stringify({
        ...winnerForScores,
        // Ayrışık alt-sinyal sözleşmesi: 8 anahtar + payoff + leaks garanti.
        ...subSignals,
        modelUsed: pipelineResult.modelUsed,
        // Engagement learning loop re-weights exactly these patterns later.
        groundingPatternIds: groundingCtx.patternIds,
        groundingSourcePostIds: groundingCtx.sourcePostIds,
        // Faz 2B (ADR-030, additive): taslağı GERÇEKTEN etkileyen aktif
        // MemoryFact id'leri — "bu taslakta şu onaylı kuralları kullandım".
        // Yalnız active id girer (retrieval yalnız active okur); grounding
        // düştüyse boş dizi; dedupe grounding'de. Eski scores JSON'ları bu
        // alan olmadan okunmaya devam eder.
        groundingMemoryFactIds: groundingCtx.memoryFactIds ?? [],
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
          // Phase 2D (ADR-033): format niyeti + thread seçim izi görünürdür —
          // thread fallback'i sessiz olamaz.
          formatIntent,
          ...(threadSelection ? { threadSelection } : {}),
          ...(threadPayload
            ? {
                segmentCount: threadPayload.segments.length,
                segmentCharsMin: Math.min(...threadPayload.segments.map((s) => s.text.length)),
                segmentCharsMax: Math.max(...threadPayload.segments.map((s) => s.text.length)),
                segmentLimit,
                totalChars: threadPayload.content.length,
              }
            : {}),
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
      winnerScore.viralPotential >= ATOMIZE_VIRAL_THRESHOLD
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
