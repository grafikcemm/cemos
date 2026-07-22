import { prisma } from "@/lib/db/client";
import type { TrainingExample } from "@/generated/prisma/client";
import {
  CreateTrainingExampleSchema,
  type CreateTrainingExampleInput,
  safeJsonStringify,
  safeJsonParse,
} from "@/lib/growth-engine/types";
import { deriveTrainingPlatform } from "@/lib/db/platformDerive";

export type TrainingExampleWithParsed = Omit<
  TrainingExample,
  "metricsJson" | "embeddingJson"
> & {
  metricsJson: Record<string, unknown>;
  embeddingJson: number[] | null;
};

function parse(te: TrainingExample): TrainingExampleWithParsed {
  return {
    ...te,
    metricsJson: safeJsonParse(te.metricsJson, {}),
    embeddingJson: te.embeddingJson ? safeJsonParse<number[]>(te.embeddingJson, []) : null,
  };
}

export const trainingExampleRepo = {
  create(raw: CreateTrainingExampleInput): Promise<TrainingExample> {
    const input = CreateTrainingExampleSchema.parse(raw);
    return prisma.trainingExample.create({
      data: {
        accountId: input.accountId,
        inputType: input.inputType,
        sourceContent: input.sourceContent,
        outputContent: input.outputContent,
        label: input.label,
        reason: input.reason ?? "",
        metricsJson: input.metricsJson ? safeJsonStringify(input.metricsJson) : "{}",
        embeddingJson: input.embeddingJson ? safeJsonStringify(input.embeddingJson) : null,
        platform: input.platform ?? deriveTrainingPlatform(input.inputType),
        seriesKey: input.seriesKey ?? null,
      },
    });
  },

  listByAccount(accountId: string, limit = 100): Promise<TrainingExampleWithParsed[]> {
    return prisma.trainingExample
      .findMany({
        where: { accountId },
        orderBy: { createdAt: "desc" },
        take: limit,
      })
      .then((rows) => rows.map(parse));
  },

  listByLabel(accountId: string, label: string): Promise<TrainingExampleWithParsed[]> {
    return prisma.trainingExample
      .findMany({
        where: { accountId, label },
        orderBy: { createdAt: "desc" },
      })
      .then((rows) => rows.map(parse));
  },

  findById(id: string): Promise<TrainingExampleWithParsed | null> {
    return prisma.trainingExample
      .findUnique({ where: { id } })
      .then((te) => (te ? parse(te) : null));
  },

  updateEmbedding(id: string, embeddingJson: string): Promise<TrainingExample> {
    return prisma.trainingExample.update({
      where: { id },
      data: { embeddingJson },
    });
  },
};
