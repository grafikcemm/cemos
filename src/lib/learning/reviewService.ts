/**
 * CemOS Learn — tekrar oturumu + notlama + mastery. Due item seçimi performansa
 * dayalı (en zayıf kavram önce). Notlamada srs.ts ile yeniden zamanlama + kavram/pack
 * mastery yeniden hesaplanır. Saf srs matematiği reviewService'i ince tutar.
 */

import { safeJsonParse } from "@/lib/growth-engine/types";
import { learnReviewRepo } from "@/lib/db/learnReviewRepo";
import { learnPackRepo } from "@/lib/db/learnPackRepo";
import {
  nextSchedule,
  computeDueAt,
  masteryFromReviews,
  rollupPackMastery,
  type ReviewGrade,
  type ScheduleState,
} from "./scheduling/srs";

const NO_CONCEPT_MASTERY = 50; // kavramsız item nötr sırada

export type SessionItem = {
  itemId: string;
  kind: string;
  front: string;
  back: string;
  options: string[];
  correctIdx: number | null;
  difficulty: number;
  conceptLabel: string | null;
  chunkIdx: number | null;
};

export type GradeResult = {
  nextDueAt: string;
  intervalDays: number;
  conceptMastery: number | null;
  packMastery: number;
};

export const reviewService = {
  /** Due item'lar, en zayıf kavram → en zor → en eski due sırasıyla. */
  async getSession(limit = 10): Promise<SessionItem[]> {
    const now = new Date();
    const due = await learnReviewRepo.listDue(now, 200);
    const ranked = due
      .map((d) => ({
        d,
        mastery: d.item.concept?.masteryScore ?? NO_CONCEPT_MASTERY,
      }))
      .sort((a, b) => {
        if (a.mastery !== b.mastery) return a.mastery - b.mastery; // zayıf önce
        if (a.d.item.difficulty !== b.d.item.difficulty)
          return b.d.item.difficulty - a.d.item.difficulty; // zor önce
        return a.d.dueAt.getTime() - b.d.dueAt.getTime(); // eski due önce
      })
      .slice(0, Math.min(Math.max(limit, 1), 50));

    return ranked.map(({ d }) => {
      const grounding = safeJsonParse<{ chunkIdx: number }[]>(d.item.groundingJson, []);
      return {
        itemId: d.item.id,
        kind: d.item.kind,
        front: d.item.front,
        back: d.item.back,
        options: safeJsonParse<string[]>(d.item.optionsJson, []),
        correctIdx: d.item.correctIdx,
        difficulty: d.item.difficulty,
        conceptLabel: d.item.concept?.label ?? null,
        chunkIdx: grounding[0]?.chunkIdx ?? null,
      };
    });
  },

  /** Bir cevabı kaydeder, yeniden zamanlar, kavram + pack mastery'yi günceller. */
  async grade(input: {
    itemId: string;
    grade: ReviewGrade;
    responseMs: number;
    correct?: boolean;
  }): Promise<GradeResult> {
    const now = new Date();
    const item = await learnPackRepo.getItemById(input.itemId);
    if (!item) throw new Error("item_not_found");

    let schedule = await learnReviewRepo.getScheduleByItem(input.itemId);
    if (!schedule) {
      schedule = await learnReviewRepo.createSchedule({
        itemId: input.itemId,
        dueAt: now,
        intervalDays: 1,
        ladderStep: 0,
        ease: 2.5,
      });
    }

    const prev: ScheduleState = {
      ladderStep: schedule.ladderStep,
      intervalDays: schedule.intervalDays,
      ease: schedule.ease,
      lapses: schedule.lapses,
    };
    const next = nextSchedule(prev, input.grade);
    const dueAt = computeDueAt(now, next.intervalDays);

    const isCorrect = input.correct ?? input.grade > 0;
    await learnReviewRepo.createAttempt({
      itemId: input.itemId,
      grade: input.grade,
      correct: isCorrect,
      responseMs: input.responseMs,
    });
    await learnReviewRepo.updateSchedule(input.itemId, {
      ladderStep: next.ladderStep,
      intervalDays: next.intervalDays,
      ease: next.ease,
      lapses: next.lapses,
      dueAt,
      lastReviewedAt: now,
    });

    // Kavram mastery: kavramın tüm item'larının ortalaması (recency+interval ağırlıklı).
    let conceptMastery: number | null = null;
    if (item.conceptId) {
      const items = await learnPackRepo.listItemsByConcept(item.conceptId);
      const scores: number[] = [];
      for (const it of items) {
        const recent = await learnReviewRepo.recentCorrect(it.id, 5);
        const sched = await learnReviewRepo.getScheduleByItem(it.id);
        scores.push(masteryFromReviews(recent, sched?.intervalDays ?? next.intervalDays));
      }
      conceptMastery =
        scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      await learnPackRepo.updateConceptMastery(item.conceptId, conceptMastery);
    }

    // Pack mastery: kavramların importance-ağırlıklı ortalaması.
    const concepts = await learnPackRepo.listConcepts(item.packId);
    const packMastery = rollupPackMastery(
      concepts.map((c) => ({ masteryScore: c.masteryScore, importance: c.importance }))
    );
    await learnPackRepo.update(item.packId, { masteryScore: packMastery });

    return {
      nextDueAt: dueAt.toISOString(),
      intervalDays: next.intervalDays,
      conceptMastery,
      packMastery,
    };
  },
};
