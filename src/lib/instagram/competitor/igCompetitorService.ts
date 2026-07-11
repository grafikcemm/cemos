/**
 * IG rakip istihbaratı (Sprint 4 — FINAL-CONTENT-ENGINE-SPEC §3, Option A).
 *
 * Policy tabanı (pazarlıksız): Meta `business_discovery` TEK otomatik okuma;
 * scraping ASLA; commenter/PII saklanmaz. Günlük sync LLM'SİZ (~$0) —
 * YouTube `syncCompetitors` klonu: handle → business_discovery → ContentItem
 * upsert → CreatorBaseline medyan → ContentOutlierScore.
 */

import { prisma } from "@/lib/db/client";
import { getBusinessDiscovery, type BusinessDiscoveryMedia } from "@/lib/instagram/igClient";

// 2026-07-11: 20→30 (kullanıcı isteği — site/araç tanıtan reels rakipleri
// eklendi). business_discovery günlük sync maliyeti hesap başına ~1 çağrı;
// 30 hesap hâlâ Meta rate-limit'inin çok altında.
export const IG_WATCHLIST_MAX = 30;
const BASELINE_WINDOW_DAYS = 30;
const BASELINE_MIN_SAMPLE = 5;
// YouTube outlier.ts ile aynı recency şekli: ≤7g tam, 7→30g lineer, taban 0.5.
const RECENCY_FULL_DAYS = 7;
const RECENCY_DECAY_DAYS = 23;
const RECENCY_FLOOR = 0.5;
const EPSILON = 1;

export function igFormatOf(media: Pick<BusinessDiscoveryMedia, "media_type" | "media_product_type">): string {
  if (media.media_product_type === "REELS") return "ig_reel";
  if (media.media_type === "CAROUSEL_ALBUM") return "ig_carousel";
  if (media.media_type === "VIDEO") return "ig_reel";
  return "ig_static";
}

export function engagementOf(media: Pick<BusinessDiscoveryMedia, "like_count" | "comments_count">): number {
  return (media.like_count ?? 0) + (media.comments_count ?? 0);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** engagement ÷ kendi medyanı × recency (YouTube outlierScore ile aynı şekil). */
export function igOutlierMultiplier(input: {
  engagement: number;
  baselineMedian: number;
  publishedAtMs: number;
  nowMs: number;
}): number {
  const base = input.engagement / Math.max(input.baselineMedian, EPSILON);
  const ageDays = Math.max(0, (input.nowMs - input.publishedAtMs) / 86_400_000);
  const recency = Math.min(
    1,
    Math.max(RECENCY_FLOOR, 1 - (ageDays - RECENCY_FULL_DAYS) / RECENCY_DECAY_DAYS)
  );
  return Math.round(base * recency * 100) / 100;
}

export type AddWatchResult =
  | { ok: true; watchId: string; probeStatus: "ok" }
  | { ok: true; watchId: string; probeStatus: "unavailable"; message: string };

/**
 * Watchlist'e hesap ekle — add-flow business_discovery ile probe eder.
 * Personal/private/age-gated → throw DEĞİL: Türkçe "API'den alınamıyor —
 * manuel ekle" bayrağıyla `unavailable` kaydı.
 */
export async function addWatchAccount(
  usernameRaw: string,
  flags?: { isInspiration?: boolean; isCompetitor?: boolean; notes?: string }
): Promise<AddWatchResult> {
  const username = usernameRaw.replace(/^@/, "").trim().toLowerCase();
  if (!username) throw new Error("username zorunlu");

  const probe = await getBusinessDiscovery(username, 1);
  if (!probe.ok || !probe.data) {
    const row = await prisma.igWatchAccount.upsert({
      where: { username },
      create: {
        username,
        isInspiration: flags?.isInspiration ?? false,
        isCompetitor: flags?.isCompetitor ?? true,
        notes: flags?.notes ?? "",
        probeStatus: "unavailable",
        probeError: "API'den alınamıyor — manuel ekle (personal/private hesap olabilir)",
      },
      update: { probeStatus: "unavailable" },
    });
    return {
      ok: true,
      watchId: row.id,
      probeStatus: "unavailable",
      message: row.probeError,
    };
  }

  const creator = await prisma.creator.upsert({
    where: { platform_handle: { platform: "instagram", handle: username } },
    create: {
      platform: "instagram",
      handle: username,
      displayName: probe.data.name ?? username,
      followers: probe.data.followers_count ?? 0,
    },
    update: { followers: probe.data.followers_count ?? 0 },
  });
  const row = await prisma.igWatchAccount.upsert({
    where: { username },
    create: {
      username,
      creatorId: creator.id,
      isInspiration: flags?.isInspiration ?? false,
      isCompetitor: flags?.isCompetitor ?? true,
      notes: flags?.notes ?? "",
      probeStatus: "ok",
      probeError: "",
    },
    update: { creatorId: creator.id, probeStatus: "ok", probeError: "" },
  });
  return { ok: true, watchId: row.id, probeStatus: "ok" };
}

export type IgCompetitorSyncResult = {
  accounts: number;
  synced: number;
  itemsUpserted: number;
  outliersScored: number;
  errors: Array<{ username: string; error: string }>;
  skipped?: string;
};

/**
 * Günlük LLM'siz sync — /api/cron/daily'ye katlanır (fail-open, deadline'lı).
 * Hesap başına: business_discovery → ContentItem upsert → format-medyan
 * baseline → outlier skoru.
 */
export async function syncIgCompetitors(opts?: {
  deadlineMs?: number;
}): Promise<IgCompetitorSyncResult> {
  const deadlineAt = Date.now() + (opts?.deadlineMs ?? 45_000);
  const result: IgCompetitorSyncResult = {
    accounts: 0,
    synced: 0,
    itemsUpserted: 0,
    outliersScored: 0,
    errors: [],
  };

  const watch = await prisma.igWatchAccount.findMany({
    where: { probeStatus: "ok", creatorId: { not: null } },
    orderBy: { lastSyncAt: "asc" }, // en bayat önce
    take: IG_WATCHLIST_MAX,
  });
  result.accounts = watch.length;
  if (watch.length === 0) return result;

  for (const w of watch) {
    if (Date.now() >= deadlineAt) {
      result.skipped = "time_budget";
      break;
    }
    const bd = await getBusinessDiscovery(w.username, 25);
    if (!bd.ok || !bd.data) {
      result.errors.push({ username: w.username, error: bd.error ?? "unknown" });
      continue;
    }

    const perFormat = new Map<string, number[]>();
    for (const m of bd.data.media) {
      if (!m.id) continue;
      const format = igFormatOf(m);
      const engagement = engagementOf(m);
      const publishedAt = m.timestamp ? new Date(m.timestamp) : null;

      const item = await prisma.contentItem.upsert({
        where: { platform_externalId: { platform: "instagram", externalId: m.id } },
        create: {
          platform: "instagram",
          externalId: m.id,
          canonicalUrl: m.permalink ?? null,
          sourceType: "external",
          originTable: "IgWatchAccount",
          originId: w.id,
          creatorId: w.creatorId,
          contentType: "post",
          format,
          body: (m.caption ?? "").slice(0, 4000),
          author: w.username,
          metricsJson: JSON.stringify({
            likes: m.like_count ?? 0,
            comments: m.comments_count ?? 0,
          }),
          publishedAt,
        },
        update: {
          metricsJson: JSON.stringify({
            likes: m.like_count ?? 0,
            comments: m.comments_count ?? 0,
          }),
          creatorId: w.creatorId,
        },
      });
      result.itemsUpserted++;

      // Baseline penceresi içindeki değerleri topla (medyan hesabı için).
      const inWindow =
        publishedAt &&
        Date.now() - publishedAt.getTime() <= BASELINE_WINDOW_DAYS * 86_400_000;
      if (inWindow) {
        const arr = perFormat.get(format) ?? [];
        arr.push(engagement);
        perFormat.set(format, arr);
      }

      // Outlier skoru — baseline aşağıda güncellenecek; skor mevcut medyanla.
      const baseline = await prisma.creatorBaseline.findUnique({
        where: {
          creatorId_format_metric: {
            creatorId: w.creatorId!,
            format,
            metric: "engagement",
          },
        },
      });
      const baseMedian = baseline?.medianValue ?? 0;
      const sampleSize = baseline?.sampleSize ?? 0;
      const multiplier = igOutlierMultiplier({
        engagement,
        baselineMedian: baseMedian,
        publishedAtMs: publishedAt?.getTime() ?? Date.now(),
        nowMs: Date.now(),
      });
      await prisma.contentOutlierScore.upsert({
        where: { contentItemId_metric: { contentItemId: item.id, metric: "engagement" } },
        create: {
          contentItemId: item.id,
          metric: "engagement",
          metricValue: engagement,
          baselineMedian: baseMedian,
          multiplier,
          sampleSize,
          insufficient: sampleSize < BASELINE_MIN_SAMPLE,
          explanationJson: JSON.stringify({
            window: BASELINE_WINDOW_DAYS,
            formula: "engagement / medyan * recency(7g tam, 30g taban 0.5)",
          }),
        },
        update: {
          metricValue: engagement,
          baselineMedian: baseMedian,
          multiplier,
          sampleSize,
          insufficient: sampleSize < BASELINE_MIN_SAMPLE,
        },
      });
      result.outliersScored++;
    }

    // Format-medyan baseline'ı yeniden hesapla (upsert).
    for (const [format, values] of perFormat) {
      await prisma.creatorBaseline.upsert({
        where: {
          creatorId_format_metric: {
            creatorId: w.creatorId!,
            format,
            metric: "engagement",
          },
        },
        create: {
          creatorId: w.creatorId!,
          platform: "instagram",
          format,
          metric: "engagement",
          medianValue: median(values),
          sampleSize: values.length,
          windowDays: BASELINE_WINDOW_DAYS,
        },
        update: {
          medianValue: median(values),
          sampleSize: values.length,
          version: { increment: 1 },
          computedAt: new Date(),
        },
      });
    }

    await prisma.igWatchAccount.update({
      where: { id: w.id },
      data: { lastSyncAt: new Date() },
    });
    result.synced++;
  }

  return result;
}
