import { prisma } from "@/lib/db/client";
import type {
  LearnPack,
  LearnConcept,
  LearnItem,
} from "@/generated/prisma/client";

export type UpdateLearnPackInput = Partial<{
  status: string;
  category: string;
  summaryL1: string;
  summaryL2: string;
  summaryL3: string;
  notesJson: string;
  qaReportJson: string;
  masteryScore: number;
  modelUsed: string;
  costUsd: number;
  warningsJson: string;
}>;

export type ConceptInput = {
  label: string;
  definition: string;
  importance: number;
  groundingJson: string;
};

export type ItemInput = {
  conceptId?: string | null;
  kind: string;
  front: string;
  back: string;
  optionsJson: string;
  correctIdx?: number | null;
  difficulty: number;
  groundingType: string;
  groundingJson: string;
};

export type PackWithRelations = LearnPack & {
  concepts: LearnConcept[];
  items: LearnItem[];
};

export const learnPackRepo = {
  findBySourceVersion(
    sourceId: string,
    pipelineVersion: string
  ): Promise<LearnPack | null> {
    return prisma.learnPack.findUnique({
      where: { sourceId_pipelineVersion: { sourceId, pipelineVersion } },
    });
  },

  /** Cache anahtarı [sourceId, pipelineVersion] → varsa mevcut draft döner. */
  upsertDraft(input: {
    sourceId: string;
    pipelineVersion: string;
    promptVersion: string;
  }): Promise<LearnPack> {
    return prisma.learnPack.upsert({
      where: {
        sourceId_pipelineVersion: {
          sourceId: input.sourceId,
          pipelineVersion: input.pipelineVersion,
        },
      },
      update: {},
      create: {
        sourceId: input.sourceId,
        pipelineVersion: input.pipelineVersion,
        promptVersion: input.promptVersion,
      },
    });
  },

  getById(id: string): Promise<LearnPack | null> {
    return prisma.learnPack.findUnique({ where: { id } });
  },

  getFull(id: string): Promise<PackWithRelations | null> {
    return prisma.learnPack.findUnique({
      where: { id },
      include: {
        concepts: { orderBy: { importance: "desc" } },
        items: { orderBy: { createdAt: "asc" } },
      },
    });
  },

  listSummaries(limit = 100): Promise<LearnPack[]> {
    return prisma.learnPack.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  },

  countByStatus(status: string): Promise<number> {
    return prisma.learnPack.count({ where: { status } });
  },

  update(id: string, data: UpdateLearnPackInput): Promise<LearnPack> {
    return prisma.learnPack.update({ where: { id }, data });
  },

  /** Idempotent: pack'in item+concept'lerini silip kavramları yeniden yazar.
   *  Item'lardan ÖNCE review attempt/schedule silinir (FK güvenliği — reprocess'te). */
  async replaceConcepts(packId: string, concepts: ConceptInput[]): Promise<LearnConcept[]> {
    await prisma.learnReviewAttempt.deleteMany({ where: { item: { packId } } });
    await prisma.learnReviewSchedule.deleteMany({ where: { item: { packId } } });
    await prisma.learnItem.deleteMany({ where: { packId } });
    await prisma.learnConcept.deleteMany({ where: { packId } });
    if (concepts.length > 0) {
      await prisma.learnConcept.createMany({
        data: concepts.map((c) => ({ ...c, packId })),
      });
    }
    return prisma.learnConcept.findMany({
      where: { packId },
      orderBy: { importance: "desc" },
    });
  },

  listConcepts(packId: string): Promise<LearnConcept[]> {
    return prisma.learnConcept.findMany({ where: { packId } });
  },

  updateConceptMastery(id: string, masteryScore: number): Promise<LearnConcept> {
    return prisma.learnConcept.update({ where: { id }, data: { masteryScore } });
  },

  /** Idempotent: pack'in item'larını silip yeniden yazar. Review attempt/schedule
   *  (FK çocukları) item'lardan ÖNCE silinir (assessment retry'da çakışmayı önler). */
  async replaceItems(packId: string, items: ItemInput[]): Promise<number> {
    await prisma.learnReviewAttempt.deleteMany({ where: { item: { packId } } });
    await prisma.learnReviewSchedule.deleteMany({ where: { item: { packId } } });
    await prisma.learnItem.deleteMany({ where: { packId } });
    if (items.length === 0) return 0;
    const res = await prisma.learnItem.createMany({
      data: items.map((it) => ({
        packId,
        conceptId: it.conceptId ?? null,
        kind: it.kind,
        front: it.front,
        back: it.back,
        optionsJson: it.optionsJson,
        correctIdx: it.correctIdx ?? null,
        difficulty: it.difficulty,
        groundingType: it.groundingType,
        groundingJson: it.groundingJson,
      })),
    });
    return res.count;
  },

  listItems(packId: string): Promise<LearnItem[]> {
    return prisma.learnItem.findMany({ where: { packId } });
  },

  getItemById(id: string): Promise<LearnItem | null> {
    return prisma.learnItem.findUnique({ where: { id } });
  },

  listItemsByConcept(conceptId: string): Promise<LearnItem[]> {
    return prisma.learnItem.findMany({ where: { conceptId } });
  },
};
