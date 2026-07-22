/**
 * IG rakip istihbaratı (Sprint 4 — FINAL-CONTENT-ENGINE-SPEC §3, Option A).
 *
 * Policy tabanı (pazarlıksız): Meta `business_discovery` TEK otomatik okuma;
 * scraping ASLA; commenter/PII saklanmaz. Günlük sync LLM'SİZ (~$0) —
 * YouTube `syncCompetitors` klonu: handle → business_discovery → ContentItem
 * upsert → CreatorBaseline medyan → ContentOutlierScore.
 */

import { prisma } from "@/lib/db/client";
import {
  getBusinessDiscovery,
  getEffectiveToken,
  type BusinessDiscoveryMedia,
} from "@/lib/instagram/igClient";
import { getIgUserId } from "@/lib/instagram/igConfig";

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
  | { ok: true; watchId: string; probeStatus: "unavailable"; message: string }
  | { ok: true; watchId: string; probeStatus: "config_required"; message: string };

const CONFIG_REQUIRED_MESSAGE =
  "Meta business_discovery yapılandırılmamış (META_IG_USER_ID + erişim token'ı gerekli) — hesap listeye alındı, otomatik tarama yapılamıyor.";

const IG_HANDLE_RE = /^[a-z0-9._]{1,30}$/;

/** business_discovery çağrılabilir mi — token + IG user id (değer loglanmaz). */
export async function isBusinessDiscoveryReady(): Promise<boolean> {
  const { token } = await getEffectiveToken();
  return Boolean(token && getIgUserId());
}

/**
 * Watchlist'e hesap ekle — add-flow business_discovery ile probe eder.
 * Personal/private/age-gated → throw DEĞİL: Türkçe "API'den alınamıyor —
 * manuel ekle" bayrağıyla `unavailable` kaydı. Meta yapılandırması eksikse
 * DÜRÜST `config_required` — "private hesap olabilir" YALANI söylenmez ve
 * manuel fallback otomatik sync yapılmış gibi görünmez.
 */
export async function addWatchAccount(
  usernameRaw: string,
  flags?: { isInspiration?: boolean; isCompetitor?: boolean; notes?: string }
): Promise<AddWatchResult> {
  const username = usernameRaw.replace(/^@/, "").trim().toLowerCase();
  if (!username) throw new Error("username zorunlu");
  if (!IG_HANDLE_RE.test(username)) throw new Error("Geçersiz Instagram kullanıcı adı");

  const probe = await getBusinessDiscovery(username, 1);
  if (!probe.ok || !probe.data) {
    const configMissing = probe.error === "not_configured";
    const probeStatus = configMissing ? "config_required" : "unavailable";
    const probeError = configMissing
      ? CONFIG_REQUIRED_MESSAGE
      : "API'den alınamıyor — manuel ekle (personal/private hesap olabilir)";
    const row = await prisma.igWatchAccount.upsert({
      where: { username },
      create: {
        username,
        isInspiration: flags?.isInspiration ?? false,
        isCompetitor: flags?.isCompetitor ?? true,
        notes: flags?.notes ?? "",
        probeStatus,
        probeError,
      },
      update: { probeStatus, probeError },
    });
    if (configMissing) {
      return { ok: true, watchId: row.id, probeStatus: "config_required", message: probeError };
    }
    return { ok: true, watchId: row.id, probeStatus: "unavailable", message: probeError };
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
 *
 * İKİ AŞAMALI skorlama (Phase 3C §C): hesap başına önce TÜM medya upsert
 * edilir ve pencere değerleri toplanır, SONRA format-medyan baseline
 * güncellenir, skorlar GÜNCEL baseline ile yazılır (eski akış skoru bayat
 * medyanla üretip ilk sync'te yanıltıcı çarpan basıyordu). Baseline'a YALNIZ
 * provider (business_discovery) metrikleri girer; manuel metrikler zarfta
 * kalır. Yetersiz örneklem / medyan 0 → multiplier=0 + insufficient=true
 * (EPSILON bölmeli şişik çarpan üretilmez); API katmanı bunu null gösterir.
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

  // Meta yapılandırması yoksa DÜRÜST fail-fast: sıfır çağrı, sıfır sahte hata.
  if (!(await isBusinessDiscoveryReady())) {
    result.skipped = "meta_config_required";
    return result;
  }

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

    // ── AŞAMA 1: medya upsert + pencere değerlerini topla ──
    type PendingScore = { itemId: string; format: string; engagement: number; publishedAt: Date | null };
    const pending: PendingScore[] = [];
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
      pending.push({ itemId: item.id, format, engagement, publishedAt });

      const inWindow =
        publishedAt &&
        Date.now() - publishedAt.getTime() <= BASELINE_WINDOW_DAYS * 86_400_000;
      if (inWindow) {
        const arr = perFormat.get(format) ?? [];
        arr.push(engagement);
        perFormat.set(format, arr);
      }
    }

    // ── AŞAMA 2: format-medyan baseline'ı GÜNCEL değerlerle yaz ──
    const freshBaseline = new Map<string, { medianValue: number; sampleSize: number }>();
    for (const [format, values] of perFormat) {
      const medianValue = median(values);
      freshBaseline.set(format, { medianValue, sampleSize: values.length });
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
          medianValue,
          sampleSize: values.length,
          windowDays: BASELINE_WINDOW_DAYS,
        },
        update: {
          medianValue,
          sampleSize: values.length,
          version: { increment: 1 },
          computedAt: new Date(),
        },
      });
    }

    // ── AŞAMA 3: skorlar GÜNCEL baseline ile ──
    const computedAt = new Date();
    for (const p of pending) {
      const base = freshBaseline.get(p.format) ?? { medianValue: 0, sampleSize: 0 };
      const insufficient = base.sampleSize < BASELINE_MIN_SAMPLE || base.medianValue <= 0;
      const multiplier = insufficient
        ? 0
        : igOutlierMultiplier({
            engagement: p.engagement,
            baselineMedian: base.medianValue,
            publishedAtMs: p.publishedAt?.getTime() ?? computedAt.getTime(),
            nowMs: computedAt.getTime(),
          });
      const explanationJson = JSON.stringify({
        window: BASELINE_WINDOW_DAYS,
        sampleSize: base.sampleSize,
        minSample: BASELINE_MIN_SAMPLE,
        metricProvenance: "meta_business_discovery",
        formula: "engagement / güncel format medyanı * recency(7g tam, 30g taban 0.5)",
        computedAt: computedAt.toISOString(),
      });
      await prisma.contentOutlierScore.upsert({
        where: { contentItemId_metric: { contentItemId: p.itemId, metric: "engagement" } },
        create: {
          contentItemId: p.itemId,
          metric: "engagement",
          metricValue: p.engagement,
          baselineMedian: base.medianValue,
          multiplier,
          sampleSize: base.sampleSize,
          insufficient,
          explanationJson,
        },
        update: {
          metricValue: p.engagement,
          baselineMedian: base.medianValue,
          multiplier,
          sampleSize: base.sampleSize,
          insufficient,
          explanationJson,
          computedAt,
        },
      });
      result.outliersScored++;
    }

    await prisma.igWatchAccount.update({
      where: { id: w.id },
      data: { lastSyncAt: new Date() },
    });
    result.synced++;
  }

  return result;
}
