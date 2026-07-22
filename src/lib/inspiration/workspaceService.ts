import { prisma } from "@/lib/db/client";
import { getEffectiveToken } from "@/lib/instagram/igClient";
import { getIgUserId } from "@/lib/instagram/igConfig";
import { getInstagramGenerationGate } from "@/lib/config/productGates";
import { parseInspirationMeta, type InspirationMeta } from "@/lib/inspiration/inspirationMeta";

/**
 * Kütüphane → İlham çalışma alanı read model'i (Phase 3C §E).
 *
 * TEK GET ile UI'ın ihtiyacı olan her blok: hesap panoları, pano içerikleri
 * (parse edilmiş meta + outlier özeti), rakip watchlist özeti, outlier feed,
 * AI kapısının dürüst durumu. SIFIR yazma — GET hiçbir kayıt oluşturmaz.
 * Watchlist GLOBALDİR (hesap-scoped değil) ve UI'da böyle etiketlenir.
 */

const WATCH_STALE_DAYS = 3;
const OUTLIER_FEED_LIMIT = 30;
const ITEMS_LIMIT = 100;

export type InspirationOutlierSummary = {
  /** insufficient/median-0 ise null — sahte çarpan gösterilmez. */
  multiplier: number | null;
  insufficient: boolean;
  sampleSize: number;
  baselineMedian: number;
  computedAt: string | null;
};

export type InspirationWorkspaceItem = {
  id: string;
  boardId: string;
  contentItemId: string | null;
  title: string;
  url: string;
  note: string;
  itemType: string;
  createdAt: string;
  meta: InspirationMeta | null;
  content: {
    id: string;
    platform: string;
    format: string;
    author: string;
    title: string;
    body: string;
    canonicalUrl: string | null;
    sourceType: string;
    analysisStatus: string;
  } | null;
  outlier: InspirationOutlierSummary | null;
};

export type WatchlistSummary = {
  /** Meta business_discovery çağrılabilir mi (token + IG user id). */
  configured: boolean;
  total: number;
  ok: number;
  unavailable: number;
  configRequired: number;
  pending: number;
  neverSynced: number;
  lastSyncAt: string | null;
  stale: boolean;
};

export type OutlierFeedRow = {
  contentItemId: string;
  author: string;
  format: string;
  caption: string;
  url: string | null;
  publishedAt: string | null;
  multiplier: number | null;
  insufficient: boolean;
  sampleSize: number;
  computedAt: string | null;
};

export type InspirationWorkspace = {
  boards: Array<{ id: string; name: string; icon: string; itemCount: number }>;
  selectedBoardId: string | null;
  items: InspirationWorkspaceItem[];
  watch: WatchlistSummary;
  outliers: OutlierFeedRow[];
  gate: { allowed: boolean; missing: string[] };
};

export async function isBusinessDiscoveryConfigured(): Promise<boolean> {
  const { token } = await getEffectiveToken();
  return Boolean(token && getIgUserId());
}

function outlierSummary(score: {
  multiplier: number;
  insufficient: boolean;
  sampleSize: number;
  baselineMedian: number;
  computedAt: Date;
}): InspirationOutlierSummary {
  return {
    multiplier: score.insufficient ? null : score.multiplier,
    insufficient: score.insufficient,
    sampleSize: score.sampleSize,
    baselineMedian: score.baselineMedian,
    computedAt: score.computedAt.toISOString(),
  };
}

export async function getWatchlistSummary(): Promise<WatchlistSummary> {
  const [configured, rows] = await Promise.all([
    isBusinessDiscoveryConfigured(),
    prisma.igWatchAccount.findMany({
      select: { probeStatus: true, lastSyncAt: true },
    }),
  ]);
  const lastSync = rows.reduce<Date | null>(
    (acc, r) => (r.lastSyncAt && (!acc || r.lastSyncAt > acc) ? r.lastSyncAt : acc),
    null,
  );
  return {
    configured,
    total: rows.length,
    ok: rows.filter((r) => r.probeStatus === "ok").length,
    unavailable: rows.filter((r) => r.probeStatus === "unavailable").length,
    configRequired: rows.filter((r) => r.probeStatus === "config_required").length,
    pending: rows.filter((r) => r.probeStatus === "pending").length,
    neverSynced: rows.filter((r) => !r.lastSyncAt).length,
    lastSyncAt: lastSync ? lastSync.toISOString() : null,
    stale: lastSync ? Date.now() - lastSync.getTime() > WATCH_STALE_DAYS * 86_400_000 : true,
  };
}

async function getOutlierFeed(): Promise<OutlierFeedRow[]> {
  const scores = await prisma.contentOutlierScore.findMany({
    where: { metric: "engagement", contentItem: { platform: "instagram", sourceType: "external" } },
    orderBy: [{ insufficient: "asc" }, { multiplier: "desc" }],
    take: OUTLIER_FEED_LIMIT,
    include: {
      contentItem: {
        select: { id: true, body: true, format: true, author: true, canonicalUrl: true, publishedAt: true },
      },
    },
  });
  return scores.map((s) => ({
    contentItemId: s.contentItem.id,
    author: s.contentItem.author,
    format: s.contentItem.format,
    caption: s.contentItem.body.slice(0, 200),
    url: s.contentItem.canonicalUrl,
    publishedAt: s.contentItem.publishedAt ? s.contentItem.publishedAt.toISOString() : null,
    multiplier: s.insufficient ? null : s.multiplier,
    insufficient: s.insufficient,
    sampleSize: s.sampleSize,
    computedAt: s.computedAt.toISOString(),
  }));
}

export async function getInspirationWorkspace(input: {
  accountId: string;
  boardId?: string;
}): Promise<InspirationWorkspace> {
  const boards = await prisma.board.findMany({
    where: { archivedAt: null, accountId: input.accountId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { items: true } } },
  });

  const selectedBoardId =
    input.boardId && boards.some((b) => b.id === input.boardId)
      ? input.boardId
      : (boards[0]?.id ?? null);

  const rawItems = selectedBoardId
    ? await prisma.boardItem.findMany({
        where: { boardId: selectedBoardId },
        orderBy: { createdAt: "desc" },
        take: ITEMS_LIMIT,
        include: { contentItem: { include: { outlierScores: { where: { metric: "engagement" } } } } },
      })
    : [];

  const items: InspirationWorkspaceItem[] = rawItems.map((it) => {
    const score = it.contentItem?.outlierScores[0];
    return {
      id: it.id,
      boardId: it.boardId,
      contentItemId: it.contentItemId,
      title: it.title,
      url: it.url,
      note: it.note,
      itemType: it.itemType,
      createdAt: it.createdAt.toISOString(),
      meta: parseInspirationMeta(it.metaJson),
      content: it.contentItem
        ? {
            id: it.contentItem.id,
            platform: it.contentItem.platform,
            format: it.contentItem.format,
            author: it.contentItem.author,
            title: it.contentItem.title,
            body: it.contentItem.body.slice(0, 2_000),
            canonicalUrl: it.contentItem.canonicalUrl,
            sourceType: it.contentItem.sourceType,
            analysisStatus: it.contentItem.analysisStatus,
          }
        : null,
      outlier: score ? outlierSummary(score) : null,
    };
  });

  const [watch, outliers] = await Promise.all([getWatchlistSummary(), getOutlierFeed()]);
  const gate = getInstagramGenerationGate();

  return {
    boards: boards.map((b) => ({ id: b.id, name: b.name, icon: b.icon, itemCount: b._count.items })),
    selectedBoardId,
    items,
    watch,
    outliers,
    gate: { allowed: gate.allowed, missing: gate.missing },
  };
}
