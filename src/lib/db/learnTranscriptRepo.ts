import { prisma } from "@/lib/db/client";
import type { LearnTranscript, LearnChunk } from "@/generated/prisma/client";

export type UpsertTranscriptInput = {
  sourceId: string;
  provider?: string;
  lang?: string | null;
  segmentsJson?: string;
  fullText: string;
};

export type ChunkInput = {
  idx: number;
  startSec: number;
  endSec: number;
  text: string;
  sectionIdx: number;
};

export const learnTranscriptRepo = {
  /** Kaynak başına bir transkript (sourceId unique). */
  async upsert(input: UpsertTranscriptInput): Promise<LearnTranscript> {
    const charCount = input.fullText.length;
    return prisma.learnTranscript.upsert({
      where: { sourceId: input.sourceId },
      update: {
        provider: input.provider ?? "innertube",
        lang: input.lang ?? null,
        segmentsJson: input.segmentsJson ?? "[]",
        fullText: input.fullText,
        charCount,
      },
      create: {
        sourceId: input.sourceId,
        provider: input.provider ?? "innertube",
        lang: input.lang ?? null,
        segmentsJson: input.segmentsJson ?? "[]",
        fullText: input.fullText,
        charCount,
      },
    });
  },

  getBySource(sourceId: string): Promise<LearnTranscript | null> {
    return prisma.learnTranscript.findUnique({ where: { sourceId } });
  },

  /** Idempotent re-chunk: kaynağın chunk'larını siler, yeniden yazar. */
  async replaceChunks(
    sourceId: string,
    transcriptId: string,
    chunks: ChunkInput[]
  ): Promise<number> {
    await prisma.learnChunk.deleteMany({ where: { sourceId } });
    if (chunks.length === 0) return 0;
    const res = await prisma.learnChunk.createMany({
      data: chunks.map((c) => ({ ...c, sourceId, transcriptId })),
    });
    return res.count;
  },

  listChunks(sourceId: string): Promise<LearnChunk[]> {
    return prisma.learnChunk.findMany({
      where: { sourceId },
      orderBy: { idx: "asc" },
    });
  },

  countChunks(sourceId: string): Promise<number> {
    return prisma.learnChunk.count({ where: { sourceId } });
  },
};
