import { prisma } from "@/lib/db/client";
import type { ContentEmbedding } from "@/generated/prisma/client";

// Content embedding deposu (Faz CI-3). contentItem başına bir embedding (idempotent).
// embeddingJson = Float[] JSON. Arama servisi tüm vektörleri yükleyip JS cosine ile sıralar.

export const contentEmbeddingRepo = {
  upsert(input: {
    contentItemId: string;
    model: string;
    dim: number;
    values: number[];
    searchableDoc: string;
  }): Promise<ContentEmbedding> {
    const { contentItemId, model, dim, values, searchableDoc } = input;
    return prisma.contentEmbedding.upsert({
      where: { contentItemId },
      create: { contentItemId, model, dim, embeddingJson: JSON.stringify(values), searchableDoc },
      update: { model, dim, embeddingJson: JSON.stringify(values), searchableDoc },
    });
  },

  /** Arama adayları: tüm embedding'ler (vektör + contentItemId). */
  listAll(limit = 1000): Promise<{ id: string; contentItemId: string; embeddingJson: string }[]> {
    return prisma.contentEmbedding.findMany({
      take: Math.min(Math.max(limit, 1), 5000),
      select: { id: true, contentItemId: true, embeddingJson: true },
    });
  },

  /** Henüz embed edilmemiş content item id'leri (reindex için). */
  async missingContentItemIds(limit = 200): Promise<string[]> {
    const items = await prisma.contentItem.findMany({
      where: { embedding: null },
      select: { id: true },
      take: Math.min(Math.max(limit, 1), 1000),
    });
    return items.map((i) => i.id);
  },
};
