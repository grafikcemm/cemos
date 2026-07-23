import { prisma } from "@/lib/db/client";
import { assessQueueItemReadiness } from "@/lib/services/readinessAdapter";
import { getInstagramPlanHealth } from "@/lib/health/planHealthService";
import {
  getProviderLiveness,
  type ProviderLiveness,
} from "@/lib/services/providerLivenessService";
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

function infrastructureInput(
  health: HealthPayloadLike,
  liveness: Record<string, ProviderLiveness> = {},
): InfrastructureInput {
  const meta = health.metaToken;
  // The liveness ledger (real LAST-call outcome from UsageLog) OVERRIDES shallow
  // env-presence health: a configured provider whose most recent call FAILED
  // (e.g. OpenRouter 402 credit-exhausted) must NOT read green on the Sistem
  // panel. Mirrors integrationDisplay.ts so the two surfaces agree (closes the
  // split-brain where Profile→Integrations was honest but Sistem was not).
  const orDegraded = liveness.openrouter?.state === "degraded";
  const sdDegraded = liveness.socialdata?.state === "degraded";
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
        ok: health.openrouter?.ok !== false && !orDegraded,
        envNames: ["OPENROUTER_API_KEY"],
        detail: orDegraded
          ? `Son çağrı başarısız (${liveness.openrouter?.lastErrorClass ?? "hata"})`
          : health.openrouter?.message,
      },
      {
        key: "socialdata",
        label: "SocialData",
        required: true,
        configured: health.socialdata?.configured === true,
        ok: health.socialdata?.ok !== false && !sdDegraded,
        envNames: ["SOCIALDATA_API_KEY"],
        detail: sdDegraded
          ? `Son çağrı başarısız (${liveness.socialdata?.lastErrorClass ?? "hata"})`
          : health.socialdata?.message,
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
      // Egress (C2): assessQueueItemReadiness + preparedIntents için gereken DAR alan
      // kümesi. Geniş `candidatesJson` gövdesi ve tam Account JOIN'i her health
      // poll'unda taşınmaz (readinessAdapter yalnız aşağıdaki alanları okur).
      select: {
        id: true,
        content: true,
        editedContent: true,
        status: true,
        draftType: true,
        mode: true,
        scores: true,
        lintReport: true,
        threadSegments: true,
        sourcePostId: true,
        newsItemId: true,
        account: { select: { handle: true, maxChars: true } },
      },
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

// Egress (C1/C2/C3 kısmi azaltım): /api/health poll'u + navigation-burst
// (SystemHealthProvider + SettingsTab + ProfileIntegrationsTab + DiscoveryEngineTab
// HEPSİ /api/health çeker) aynı pahalı hesapları (plan-health dossier fan-out'u,
// provider liveness 10 sorgu, bugünün queueItem'ları) kısa pencerede DEFALARCA
// koşuyordu. Kısa TTL + eşzamanlı (in-flight) collapse → penceredeki tüm çağrılar
// TEK hesabı paylaşır. Sağlık sinyali ≤TTL bayat olabilir (saniyelik değişmez).
// Hata CACHE'LENMEZ → sıradaki çağrı taze dener. NOT: tek sekmenin 5dk poll'ü hâlâ
// yeni hesap yapar; plan-health fan-out'unun TAM tek-sekme çözümü kalıcı readiness
// kolonu (migration — Neon askıda) veya deep-gate (ürün kararı) gerektirir.
const HEALTH_CACHE_TTL_MS = 15_000;
function ttlMemo<T>(fn: () => Promise<T>, ttlMs: number): () => Promise<T> {
  let cache: { value: T; at: number } | null = null;
  let inflight: Promise<T> | null = null;
  return () => {
    if (cache && Date.now() - cache.at < ttlMs) return Promise.resolve(cache.value);
    if (inflight) return inflight;
    inflight = fn().then(
      (v) => {
        cache = { value: v, at: Date.now() };
        inflight = null;
        return v;
      },
      (e) => {
        inflight = null; // hatayı cache'leme
        throw e;
      },
    );
    return inflight;
  };
}
const cachedLiveness = ttlMemo(() => getProviderLiveness(), HEALTH_CACHE_TTL_MS);
const cachedTodayInput = ttlMemo(() => todayInput(), HEALTH_CACHE_TTL_MS);
const cachedPlanHealth = ttlMemo(() => getInstagramPlanHealth(), HEALTH_CACHE_TTL_MS);

export const healthContractService = {
  /**
   * Üç sözleşmeyi mevcut health payload'ından + bölüm-bazlı fail-soft
   * sorgulardan türetir. Tek bölümün hatası diğerlerini düşürmez.
   *
   * WP-02c: pahalı plan-health dossier fan-out'u VARSAYILAN çağrıda KOŞMAZ —
   * yalnız `?deep=true` (manuel/düşük frekanslı operasyon kontrolü) hesaplar.
   * Shallow'da instagramPlanning null → sözleşme dürüst "unknown" döner; bu,
   * her health okumasının dossier taramasını tetikleyip egress yakmasını keser
   * (yukarıdaki eski NOT'un beklediği deep-gate ürün kararı budur).
   */
  async getContracts(
    health: HealthPayloadLike,
    opts?: { deep?: boolean },
  ): Promise<SystemHealthContracts> {
    // Fail-soft: liveness errors leave providers on their env-configured status.
    const liveness = await cachedLiveness().catch(() => ({}));
    const [infra, pipeline, today, instagramPlanning] = await Promise.all([
      Promise.resolve()
        .then(() => infrastructureInput(health, liveness))
        .catch(() => null),
      pipelineInput(health).catch(() => null),
      cachedTodayInput().catch(() => null),
      // Instagram plan sağlığı — AYRI ürün sözleşmesi; fail-soft (kendi içinde
      // unknown döner), infrastructure'ı ETKİLEMEZ. Yalnız deep'te hesaplanır.
      opts?.deep === true ? cachedPlanHealth().catch(() => null) : Promise.resolve(null),
    ]);
    return deriveHealthContracts({ infrastructure: infra, pipeline, today, instagramPlanning });
  },
};
