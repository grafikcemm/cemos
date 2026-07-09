import { prisma } from "@/lib/db/client";
import { safeJsonParse } from "@/lib/growth-engine/types";
import { computeNormalizedEditDistance } from "@/lib/growth-engine/feedback-service";
import { performanceRepo } from "@/lib/db/performanceRepo";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
import { evaluateLesson, MIN_SUPPORT, type CandidateLesson, type LessonVerdict } from "@/lib/eval/lessonGate";

// patternPromotionService (Sprint 9 — EVALUATION-SPEC §4 binding).
//
// Closes the orphaned loop: PublishedPost → PerformanceSnapshot → lessonGate.
// A mined ViralPattern starts as a CANDIDATE (validatedAt = null). It only
// becomes VALIDATED when the drafts grounded on it BEAT the control group with
// statistical significance AND without degrading brand signals (edit-distance /
// reject-rate) — the structural brake on "one lucky post becomes a rule".
//
// Pure orchestration over deterministic pieces: NO LLM, NO cost. Safe to run on
// sparse data — evaluateLesson returns insufficient_support until real
// repetition exists, so nothing is promoted before the evidence is there.

const DEFAULT_WINDOW_DAYS = 90;

export type PromotionSummary = {
  accountId: string;
  candidatesConsidered: number;
  evaluated: number;
  promoted: number;
  verdicts: LessonVerdict[];
  reason?: string;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function groundingPatternIds(scores: string | null): string[] {
  const parsed = safeJsonParse<Record<string, unknown>>(scores, {});
  const raw = parsed.groundingPatternIds;
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Evaluate every CANDIDATE pattern for an account against the two-gate lesson
 * verifier and promote the ones that clear it. Idempotent, fail-soft. `now` is
 * injectable for deterministic tests.
 */
export async function promoteValidatedPatterns(
  accountId: string,
  opts: { windowDays?: number; platform?: string; now?: Date } = {}
): Promise<PromotionSummary> {
  const summary: PromotionSummary = {
    accountId,
    candidatesConsidered: 0,
    evaluated: 0,
    promoted: 0,
    verdicts: [],
  };

  const platform = opts.platform ?? "x";
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - (opts.windowDays ?? DEFAULT_WINDOW_DAYS) * 24 * 60 * 60 * 1000);

  // Only candidates (not-yet-validated, active) are eligible for promotion.
  const candidates = await prisma.viralPattern.findMany({
    where: { accountId, platform, isActive: true, validatedAt: null },
    select: { id: true },
  });
  summary.candidatesConsidered = candidates.length;
  if (candidates.length === 0) {
    summary.reason = "no_candidates";
    return summary;
  }

  // The draft population in the window: status + grounding + operator edit signal.
  const items = await prisma.queueItem.findMany({
    where: { accountId, createdAt: { gte: cutoff } },
    select: { id: true, status: true, content: true, editedContent: true, scores: true },
  });
  if (items.length === 0) {
    summary.reason = "no_drafts";
    return summary;
  }

  // Measured performance (latest snapshot) per published draft.
  const perfByItem = await performanceRepo.latestScoreByDraftItem(accountId, { platform, since: cutoff });

  const enriched = items.map((it) => ({
    id: it.id,
    rejected: it.status === "rejected",
    editDistance: computeNormalizedEditDistance(it.content, it.editedContent),
    patternIds: groundingPatternIds(it.scores),
  }));

  for (const candidate of candidates) {
    const carrying = enriched.filter((e) => e.patternIds.includes(candidate.id));
    const notCarrying = enriched.filter((e) => !e.patternIds.includes(candidate.id));

    const withLesson = carrying.map((e) => perfByItem.get(e.id)).filter((v): v is number => v !== undefined);
    // Cheap early skip: no chance of promotion below the repetition floor.
    if (withLesson.length < MIN_SUPPORT) continue;

    const without = notCarrying.map((e) => perfByItem.get(e.id)).filter((v): v is number => v !== undefined);

    const editWith = carrying.map((e) => e.editDistance).filter((v): v is number => v !== null);
    const editWithout = notCarrying.map((e) => e.editDistance).filter((v): v is number => v !== null);

    const rejectRate = (group: typeof enriched) =>
      group.length === 0 ? 0 : group.filter((e) => e.rejected).length / group.length;

    const lesson: CandidateLesson = {
      lessonKey: candidate.id,
      withLesson,
      without,
      brand: {
        medianEditDistanceWith: median(editWith),
        medianEditDistanceWithout: median(editWithout),
        rejectRateWith: rejectRate(carrying),
        rejectRateWithout: rejectRate(notCarrying),
      },
    };

    const verdict = evaluateLesson(lesson);
    summary.evaluated++;
    summary.verdicts.push(verdict);

    if (verdict.promoted) {
      const marked = await viralPatternRepo.markValidated(candidate.id, verdict.supportCount);
      if (marked) summary.promoted++;
    }
  }

  summary.reason = summary.evaluated === 0 ? "no_pattern_reached_support" : "evaluated";
  return summary;
}
