/**
 * CemOS Learn — tekrar oturumu + notlama + mastery. Due item seçimi performansa
 * dayalı (en zayıf kavram önce). Notlamada srs.ts ile yeniden zamanlama + kavram/pack
 * mastery yeniden hesaplanır. Saf srs matematiği reviewService'i ince tutar.
 */

import { prisma } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
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
  /** true → çift-gönderim tespit edildi, schedule İLERLEMEDİ (idempotent). */
  deduped: boolean;
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

  /**
   * Bir cevabı kaydeder, yeniden zamanlar, kavram + pack mastery'yi günceller.
   * ATOMİK: schedule ilerletme + attempt insert TEK transaction. İDEMPOTENT: aynı
   * idempotencyKey ikinci kez gelirse schedule İLERLEMEZ (çift-tık ladder'ı iki
   * kez atlamaz) — server-side garanti, yalnız client disable'a güvenilmez.
   */
  async grade(input: {
    itemId: string;
    grade: ReviewGrade;
    responseMs: number;
    correct?: boolean;
    idempotencyKey?: string | null;
  }): Promise<GradeResult> {
    const now = new Date();
    const item = await learnPackRepo.getItemById(input.itemId);
    if (!item) throw new Error("item_not_found");
    const isCorrect = input.correct ?? input.grade > 0;
    const key = input.idempotencyKey ?? null;

    let dueAt: Date;
    let intervalDays: number;
    let deduped = false;
    try {
      const core = await prisma.$transaction(async (tx) => {
        let schedule = await tx.learnReviewSchedule.findUnique({
          where: { itemId: input.itemId },
        });
        if (!schedule) {
          schedule = await tx.learnReviewSchedule.create({
            data: { itemId: input.itemId, dueAt: now, intervalDays: 1, ladderStep: 0, ease: 2.5 },
          });
        }
        // İdempotency: bu key zaten kaydedildiyse hiçbir şey ilerletme, mevcut durumu döndür.
        if (key) {
          const dup = await tx.learnReviewAttempt.findUnique({ where: { idempotencyKey: key } });
          if (dup) {
            return { deduped: true, dueAt: schedule.dueAt, intervalDays: schedule.intervalDays };
          }
        }
        const prev: ScheduleState = {
          ladderStep: schedule.ladderStep,
          intervalDays: schedule.intervalDays,
          ease: schedule.ease,
          lapses: schedule.lapses,
        };
        const next = nextSchedule(prev, input.grade);
        const d = computeDueAt(now, next.intervalDays);
        await tx.learnReviewAttempt.create({
          data: {
            itemId: input.itemId,
            grade: input.grade,
            correct: isCorrect,
            responseMs: input.responseMs,
            idempotencyKey: key,
          },
        });
        await tx.learnReviewSchedule.update({
          where: { itemId: input.itemId },
          data: {
            ladderStep: next.ladderStep,
            intervalDays: next.intervalDays,
            ease: next.ease,
            lapses: next.lapses,
            dueAt: d,
            lastReviewedAt: now,
          },
        });
        return { deduped: false, dueAt: d, intervalDays: next.intervalDays };
      });
      dueAt = core.dueAt;
      intervalDays = core.intervalDays;
      deduped = core.deduped;
    } catch (err) {
      // Eşzamanlı yarış: aynı key başka istekte insert edildi (P2002) → schedule DOKUNULMADI.
      if (key && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const schedule = await learnReviewRepo.getScheduleByItem(input.itemId);
        dueAt = schedule?.dueAt ?? now;
        intervalDays = schedule?.intervalDays ?? 1;
        deduped = true;
      } else {
        throw err;
      }
    }

    // Kavram mastery: kavramın tüm item'larının ortalaması (recency+interval ağırlıklı).
    // Attempt'lerden türer → idempotent; deduped olsa da güncel değeri döndürür.
    let conceptMastery: number | null = null;
    if (item.conceptId) {
      const items = await learnPackRepo.listItemsByConcept(item.conceptId);
      const scores: number[] = [];
      for (const it of items) {
        const recent = await learnReviewRepo.recentCorrect(it.id, 5);
        const sched = await learnReviewRepo.getScheduleByItem(it.id);
        scores.push(masteryFromReviews(recent, sched?.intervalDays ?? intervalDays));
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
      intervalDays,
      conceptMastery,
      packMastery,
      deduped,
    };
  },
};
