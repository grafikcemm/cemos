import { prisma } from "@/lib/db/client";
import { assessQueueItemReadiness } from "@/lib/services/readinessAdapter";
import { getInstagramPlanHealth } from "@/lib/health/planHealthService";
import {
  deriveHealthContracts,
  type InfrastructureInput,
  type PipelineInput,
  type SystemHealthContracts,
  type TodayInput,
} from "./healthContracts";

/**
 * Faz 1F (ADR-026) — üç sözleşmenin sunucu tarafı montajı. healthService'in
 * MEVCUT payload'ını girdi alır (aynı probe'lar iki kez koşmaz; deep=true
 * ASLA kullanılmaz) ve bölüm-bazlı fail-soft ek sorgular yapar: tek bölümün
 * verisi toplanamazsa o bölüm "unknown" olur, diğerleri yaşar.
 * Secret DEĞERİ hiçbir çıktıya yazılmaz — yalnız ENV adları.
 */

type HealthPayloadLike = {
  openrouter?: { configured?: boolean; ok?: boolean; message?: string };
  socialdata?: { configured?: boolean; ok?: boolean; message?: string };
  database?: { ok?: boolean; message?: string };
  metaToken?: {
    configured?: boolean;
    status?: "ok" | "warn" | "critical" | "unknown";
    daysUntilExpiry?: number | null;
    message?: string;
  };
  cronAuth?: { ok?: boolean; message?: string };
  newsPipeline?: {
    status?: string;
    message?: string;
    rawBacklog?: number;
    failedBacklog?: number;
    analyzedLast24h?: number;
    digestToday?: boolean;
  };
  worker?: {
    mode?: "worker" | "cron" | "unknown";
    inferredStatus?: "unknown" | "recent_tick" | "stale";
    lastTickAt?: string;
    recommendation?: string;
    lastCronRun?: { kind: string; startedAt: string; finishedAt: string | null; ok: boolean; error: string | null };
  };
};

function infrastructureInput(health: HealthPayloadLike): InfrastructureInput {
  const meta = health.metaToken;
  return {
    databaseOk: health.database?.ok ?? null,
    worker: {
      mode: health.worker?.mode ?? "unknown",
      status: health.worker?.inferredStatus ?? "unknown",
      detail: health.worker?.recommendation,
    },
    cronAuth: health.cronAuth ? { ok: health.cronAuth.ok !== false, message: health.cronAuth.message } : null,
    providers: [
      {
        key: "openrouter",
        label: "OpenRouter",
        required: true,
        configured: health.openrouter?.configured === true,
        ok: health.openrouter?.ok !== false,
        envNames: ["OPENROUTER_API_KEY"],
        detail: health.openrouter?.message,
      },
      {
        key: "socialdata",
        label: "SocialData",
        required: true,
        configured: health.socialdata?.configured === true,
        ok: health.socialdata?.ok !== false,
        envNames: ["SOCIALDATA_API_KEY"],
        detail: health.socialdata?.message,
      },
      {
        key: "meta",
        label: "Meta (Instagram)",
        required: false,
        configured: meta?.configured === true,
        ok: meta?.status !== "critical",
        envNames: ["META_ACCESS_TOKEN"],
        detail: meta?.message,
      },
    ],
    credentialExpiry:
      meta?.configured && (meta.status === "warn" || meta.status === "critical")
        ? [
            {
              label: "Meta token süresi",
              status: meta.status,
              detail: meta.message,
            },
          ]
        : [],
  };
}

async function pipelineInput(health: HealthPayloadLike): Promise<PipelineInput> {
  const nowMs = Date.now();
  // Son çalışmalar CronRun defterinden (fail-soft; yoksa null → never_ran).
  const [newsRun, morningRun] = await Promise.all([
    prisma.cronRun.findFirst({
      where: { kind: { in: ["news_run", "daily"] }, finishedAt: { not: null } },
      orderBy: { startedAt: "desc" },
    }),
    prisma.cronRun.findFirst({
      where: { kind: "generate_morning", finishedAt: { not: null } },
      orderBy: { startedAt: "desc" },
    }),
  ]);
  const news = health.newsPipeline;
  return {
    nowMs,
    runs: [
      {
        key: "news",
        label: "Haber akışı",
        lastRunAt: newsRun?.startedAt ? newsRun.startedAt.toISOString() : null,
        lastRunOk: newsRun ? newsRun.ok : null,
        detail: news?.message,
      },
      {
        key: "generation",
        label: "Sabah üretimi",
        lastRunAt: morningRun?.startedAt ? morningRun.startedAt.toISOString() : null,
        lastRunOk: morningRun ? morningRun.ok && !morningRun.partial : null,
        detail: morningRun?.error ?? undefined,
      },
    ],
    news: news
      ? {
          rawBacklog: news.rawBacklog ?? null,
          failedBacklog: news.failedBacklog ?? null,
          analyzedLast24h: news.analyzedLast24h ?? null,
          digestToday: news.digestToday ?? null,
        }
      : null,
  };
}

const ACTIVE_STATUSES = ["new", "draft", "approved", "scheduled", "needs_edit"];
const PUBLISHED_STATUSES = ["published", "manual_published"];

async function todayInput(): Promise<TodayInput> {
  const { getLocalDayBounds } = await import("@/lib/utils/date");
  const { start, end } = getLocalDayBounds("Europe/Istanbul");

  const [todayItems, publishedToday, schedules, morningRun] = await Promise.all([
    prisma.queueItem.findMany({
      where: { createdAt: { gte: start, lte: end }, status: { in: ACTIVE_STATUSES } },
      include: { account: true },
    }),
    prisma.queueItem.count({
      where: { publishedAt: { gte: start, lte: end }, status: { in: PUBLISHED_STATUSES } },
    }),
    prisma.schedule.findMany({ select: { dailyMaxPosts: true } }),
    prisma.cronRun.findFirst({
      where: { kind: "generate_morning", startedAt: { gte: start, lte: end } },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  let ready = 0;
  let needsEdit = 0;
  let blocked = 0;
  for (const item of todayItems) {
    const r = assessQueueItemReadiness(item, item.account);
    if (r.state === "ready") ready++;
    else if (r.state === "blocked") blocked++;
    else needsEdit++;
  }

  const preparedIntents =
    todayItems.length > 0
      ? await prisma.publishAttempt.count({
          where: {
            queueItemId: { in: todayItems.map((i) => i.id) },
            adapter: "intent",
            state: "prepared",
          },
        })
      : 0;

  const targetToday = schedules.length > 0 ? schedules.reduce((s, x) => s + (x.dailyMaxPosts || 0), 0) : null;

  return {
    productionRanToday: morningRun ? true : false,
    counts: {
      ready,
      needsEdit,
      blocked,
      awaitingDecision: todayItems.length,
      preparedIntents,
      publishedToday,
      targetToday,
      totalActiveToday: todayItems.length,
    },
  };
}

export const healthContractService = {
  /**
   * Üç sözleşmeyi mevcut health payload'ından + bölüm-bazlı fail-soft
   * sorgulardan türetir. Tek bölümün hatası diğerlerini düşürmez.
   */
  async getContracts(health: HealthPayloadLike): Promise<SystemHealthContracts> {
    const [infra, pipeline, today, instagramPlanning] = await Promise.all([
      Promise.resolve()
        .then(() => infrastructureInput(health))
        .catch(() => null),
      pipelineInput(health).catch(() => null),
      todayInput().catch(() => null),
      // Instagram plan sağlığı — AYRI ürün sözleşmesi; fail-soft (kendi içinde
      // unknown döner), infrastructure'ı ETKİLEMEZ.
      getInstagramPlanHealth().catch(() => null),
    ]);
    return deriveHealthContracts({ infrastructure: infra, pipeline, today, instagramPlanning });
  },
};
