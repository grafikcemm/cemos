import { prisma } from "@/lib/db/client";
import {
  fromSourcePost,
  fromNewsItem,
  fromYtVideo,
  fromIgMedia,
  fromRepoRadarItem,
  type NormalizedContentInput,
} from "@/lib/content/normalizer";
import { ingestContent, recomputeBaseline, scoreOutlier } from "@/lib/content/ingestService";
import { buildSearchableDoc, embedText } from "@/lib/content/search";
import { contentEmbeddingRepo } from "@/lib/db/contentEmbeddingRepo";

// Ingestion BRIDGE (Faz CI — otomatik besleme). Mevcut platform tabloları
// (SourcePost/NewsItem/YtVideo/IgMedia/RepoRadarItem) → kanonik ContentItem'a
// normalize edip yazar (idempotent), sonra dokunulan creator+format için baseline
// hesaplar, outlier skorlar ve embedding üretir. Mevcut tablolar DEĞİŞMEZ (yalnız
// okunur). Daily cron'dan ve manuel /api/content/sync'ten çağrılır. Deadline-bounded,
// fail-open: bir kaynak patlasa diğerleri devam eder.

export type SyncResult = {
  ingested: number;
  bySource: Record<string, number>;
  baselines: number;
  outliers: number;
  embedded: number;
  errors: string[];
};

type SourceLoader = { name: string; load: () => Promise<NormalizedContentInput[]> };

function loaders(limit: number): SourceLoader[] {
  return [
    {
      name: "SourcePost",
      load: async () =>
        (await prisma.sourcePost.findMany({ orderBy: { scannedAt: "desc" }, take: limit })).map(fromSourcePost),
    },
    {
      name: "NewsItem",
      load: async () =>
        (await prisma.newsItem.findMany({ orderBy: { fetchedAt: "desc" }, take: limit })).map(fromNewsItem),
    },
    {
      name: "YtVideo",
      load: async () =>
        (await prisma.ytVideo.findMany({ orderBy: { createdAt: "desc" }, take: limit })).map(fromYtVideo),
    },
    {
      name: "IgMedia",
      load: async () =>
        (await prisma.igMedia.findMany({ orderBy: { postedAt: "desc" }, take: limit })).map(fromIgMedia),
    },
    {
      name: "RepoRadarItem",
      load: async () =>
        (await prisma.repoRadarItem.findMany({ orderBy: { createdAt: "desc" }, take: limit })).map(
          fromRepoRadarItem,
        ),
    },
  ];
}

/**
 * Mevcut tablolardan kanonik havuza tek geçiş. limitPerSource her kaynaktan en yeni
 * N satır (idempotent upsert → tekrar çalıştırmak güvenli). deadlineMs aşılırsa kalan
 * kaynaklar atlanır (cron-dostu).
 */
export async function syncToCanonical(
  opts: { limitPerSource?: number; deadlineMs?: number } = {},
): Promise<SyncResult> {
  const limit = Math.min(Math.max(opts.limitPerSource ?? 100, 1), 500);
  const deadline = opts.deadlineMs ?? Date.now() + 120_000;
  const res: SyncResult = { ingested: 0, bySource: {}, baselines: 0, outliers: 0, embedded: 0, errors: [] };

  const ingestedIds: string[] = [];
  const touched = new Map<string, { creatorId: string; platform: string; format: string }>();

  for (const loader of loaders(limit)) {
    if (Date.now() > deadline) {
      res.errors.push(`${loader.name}: time_budget_skipped`);
      continue;
    }
    try {
      const inputs = await loader.load();
      let n = 0;
      for (const input of inputs) {
        if (Date.now() > deadline) break;
        const item = await ingestContent(input);
        ingestedIds.push(item.id);
        n++;
        if (item.creatorId && item.format) {
          touched.set(`${item.creatorId}:${item.format}`, {
            creatorId: item.creatorId,
            platform: item.platform,
            format: item.format,
          });
        }
      }
      res.bySource[loader.name] = n;
      res.ingested += n;
    } catch (err) {
      res.errors.push(`${loader.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Baseline'lar (dokunulan creator+format başına bir kez).
  for (const t of touched.values()) {
    if (Date.now() > deadline) break;
    try {
      await recomputeBaseline(t.creatorId, t.platform, t.format);
      res.baselines++;
    } catch (err) {
      res.errors.push(`baseline ${t.creatorId}/${t.format}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Outlier skoru (creator'a bağlı item'lar için) + embedding (hepsi için).
  for (const id of ingestedIds) {
    if (Date.now() > deadline) break;
    try {
      const item = await prisma.contentItem.findUnique({ where: { id } });
      if (!item) continue;
      if (item.creatorId && item.format) {
        await scoreOutlier(id);
        res.outliers++;
      }
      const doc = buildSearchableDoc(item);
      const e = embedText(doc);
      await contentEmbeddingRepo.upsert({
        contentItemId: id,
        model: e.model,
        dim: e.dim,
        values: e.values,
        searchableDoc: doc.slice(0, 8000),
      });
      res.embedded++;
    } catch (err) {
      res.errors.push(`score/embed ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return res;
}
