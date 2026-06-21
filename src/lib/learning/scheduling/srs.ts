/**
 * CemOS Learn — aralıklı tekrar (spaced repetition) saf matematiği. I/O YOK,
 * Date.now YOK (now param ile deterministik test). FSRS-lite: interval ladder +
 * ease çarpanı. youtube/outlier.ts deseni: saf, unit-test'li.
 */

import { REVIEW_LADDER_DAYS } from "@/lib/learning/learnConfig";

/** 0=again (yanlış), 1=hard, 2=good, 3=easy. */
export type ReviewGrade = 0 | 1 | 2 | 3;

export interface ScheduleState {
  ladderStep: number;
  intervalDays: number;
  ease: number;
  lapses: number;
}

const EASE_MIN = 1.3;
const EASE_MAX = 3.0;

function clampEase(e: number): number {
  return Math.min(EASE_MAX, Math.max(EASE_MIN, e));
}

/**
 * Bir cevaba göre yeni zamanlama. ladderStep ilerler/sıfırlanır; ease cevabın
 * zorluğuna göre kayar; intervalDays = ladder[step] * ease.
 */
export function nextSchedule(
  prev: ScheduleState,
  grade: ReviewGrade,
  ladder: readonly number[] = REVIEW_LADDER_DAYS
): ScheduleState {
  const lastIdx = ladder.length - 1;
  let { ladderStep, ease, lapses } = prev;

  switch (grade) {
    case 0: // again — başa dön, lapse say, ease düşür
      ladderStep = 0;
      lapses += 1;
      ease = clampEase(ease - 0.2);
      break;
    case 1: // hard — aynı adım, ease hafif düşür
      ease = clampEase(ease - 0.15);
      break;
    case 2: // good — bir adım ilerle
      ladderStep = Math.min(ladderStep + 1, lastIdx);
      break;
    case 3: // easy — ilerle + ease artır
      ladderStep = Math.min(ladderStep + 1, lastIdx);
      ease = clampEase(ease + 0.15);
      break;
  }

  const baseDays = ladder[Math.min(ladderStep, lastIdx)] ?? 1;
  const intervalDays = Math.max(1, Math.round(baseDays * ease));
  return { ladderStep, intervalDays, ease, lapses };
}

/** Bir sonraki due tarihi (now + intervalDays). Saf: now dışarıdan verilir. */
export function computeDueAt(now: Date, intervalDays: number): Date {
  return new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
}

/**
 * Kavram mastery'si (0..100): son denemelerin doğruluğu (%70) + tutulan interval
 * stabilitesi (%30). Hem isabeti hem uzun aralığı hayatta kalmayı ödüllendirir.
 */
export function masteryFromReviews(
  recentCorrect: readonly boolean[],
  currentIntervalDays: number,
  maxIntervalDays = 14
): number {
  if (recentCorrect.length === 0) return 0;
  const window = recentCorrect.slice(-5);
  const correctRate = window.filter(Boolean).length / window.length;
  const intervalFactor = Math.min(1, currentIntervalDays / maxIntervalDays);
  const score = correctRate * 70 + intervalFactor * 30;
  return Math.round(Math.min(100, Math.max(0, score)));
}

/** Pack mastery = kavram mastery'lerinin importance-ağırlıklı ortalaması. */
export function rollupPackMastery(
  concepts: readonly { masteryScore: number; importance: number }[]
): number {
  if (concepts.length === 0) return 0;
  let weighted = 0;
  let weightTotal = 0;
  for (const c of concepts) {
    const w = Math.max(1, c.importance);
    weighted += c.masteryScore * w;
    weightTotal += w;
  }
  return weightTotal === 0 ? 0 : Math.round(weighted / weightTotal);
}
