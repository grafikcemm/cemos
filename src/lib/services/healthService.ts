import { prisma } from "@/lib/db/client";
import { getDigestForDate } from "@/lib/news/digest";
import { integrationCredentialRepo } from "@/lib/db/integrationCredentialRepo";
import { computeTokenStatus } from "@/lib/instagram/igClient";
import { META_TOKEN_KEY } from "@/lib/instagram/igConfig";
import { isCronSecretConfigured, isProductionRuntime } from "@/lib/utils/cronAuth";
import * as fs from "fs";
import * as path from "path";
import { redactError } from "@/lib/utils/redactSecrets";

export type NewsPipelineHealth = {
  rawBacklog: number;
  translatedLast24h: number;
  analyzedLast24h: number;
  failedBacklog: number;
  digestToday: boolean;
  status: "green" | "yellow" | "red";
  message: string;
};

// Result-level news health: infra "ok" is meaningless if a successful news run
// leaves the whole pool raw (the exact false-positive that shipped 96 raw items
// with a green "Cron: OK" badge).
async function getNewsPipelineHealth(): Promise<NewsPipelineHealth> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [rawBacklog, translatedLast24h, analyzedLast24h, failedBacklog, digest, lastNewsRun] =
    await Promise.all([
      prisma.newsItem.count({ where: { processingStatus: "raw" } }),
      prisma.newsItem.count({
        where: {
          processingStatus: { in: ["translated", "analyzed", "low_score"] },
          lastAttemptedAt: { gte: dayAgo },
        },
      }),
      // Count by analysisStatus, not processingStatus: low_score items WERE
      // analyzed — a day where everything scores <70 must not trip the red alert.
      prisma.newsItem.count({
        where: { analysisStatus: "success", lastAttemptedAt: { gte: dayAgo } },
      }),
      prisma.newsItem.count({ where: { processingStatus: "failed" } }),
      getDigestForDate(),
      prisma.cronRun.findFirst({
        where: { kind: { in: ["news_run", "daily"] }, finishedAt: { not: null } },
        orderBy: { startedAt: "desc" },
      }),
    ]);

  // Content-aware, not just row-existence: an empty digest row (all summary
  // fields blank — e.g. a failed generation that still upserted before the
  // buildDailyDigest fix) must NOT read as "today's digest is ready".
  const digestToday = Boolean(
    digest && (digest.newsSummary?.trim() || digest.repoSummary?.trim() || digest.aiTips?.trim()),
  );

  let status: NewsPipelineHealth["status"] = "green";
  let message = "Haber pipeline'ı sağlıklı.";

  if (lastNewsRun?.ok && analyzedLast24h === 0 && rawBacklog > 0) {
    status = "red";
    message = `Son haber çalışması "ok" görünüyor ama 24 saatte 0 analiz, ${rawBacklog} ham haber bekliyor — pipeline çıktı üretmiyor.`;
  } else if (rawBacklog > 30) {
    status = "yellow";
    message = `${rawBacklog} ham haber birikti — 'Tümünü İşle' çalıştırın veya cron bütçesini kontrol edin.`;
  } else if (!digestToday) {
    status = "yellow";
    message = "Bugünün digest'i henüz oluşmadı.";
  }

  return { rawBacklog, translatedLast24h, analyzedLast24h, failedBacklog, digestToday, status, message };
}

export const healthService = {
  async getHealth(options?: { deep?: boolean }) {
    const deep = options?.deep === true;

    // 1. OpenRouter
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const openrouterConfigured = Boolean(openrouterKey);
    let openrouterOk = openrouterConfigured;
    let openrouterMsg = openrouterConfigured ? "API anahtarı mevcut" : "API anahtarı eksik";

    if (openrouterConfigured && deep) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: {
            "Authorization": `Bearer ${openrouterKey}`
          }
        });
        if (res.ok) {
          openrouterOk = true;
          openrouterMsg = "OpenRouter API bağlantısı başarılı ve anahtar geçerli (Deep Check).";
        } else {
          openrouterOk = false;
          openrouterMsg = `OpenRouter API doğrulama hatası: (${res.status})`;
        }
      } catch (err) {
        openrouterOk = false;
        openrouterMsg = `OpenRouter API erişim hatası: ${redactError(err)}`;
      }
    }

    // 2. SocialData
    const socialdataKey = process.env.SOCIALDATA_API_KEY;
    const socialdataConfigured = Boolean(socialdataKey);
    let socialdataOk = socialdataConfigured;
    let socialdataMsg = socialdataConfigured ? "API anahtarı mevcut" : "API anahtarı eksik";

    if (socialdataConfigured && deep) {
      try {
        const res = await fetch("https://api.socialdata.tools/twitter/user/twitter", {
          headers: {
            "Authorization": `Bearer ${socialdataKey}`
          }
        });
        if (res.ok) {
          socialdataOk = true;
          socialdataMsg = "SocialData API bağlantısı başarılı ve anahtar geçerli (Deep Check).";
        } else {
          socialdataOk = false;
          socialdataMsg = `SocialData API doğrulama hatası: (${res.status})`;
        }
      } catch (err) {
        socialdataOk = false;
        socialdataMsg = `SocialData API erişim hatası: ${redactError(err)}`;
      }
    }

    // 3. Database — bounded retry so a transient Neon pool timeout (P2024) or a
    // cold-start hiccup doesn't flip readiness red on a single flaky probe (DH-007).
    let databaseOk = false;
    let databaseMsg = "";
    {
      const DB_PROBE_ATTEMPTS = 3;
      let lastErr: unknown;
      for (let attempt = 0; attempt < DB_PROBE_ATTEMPTS; attempt++) {
        try {
          await prisma.account.count();
          databaseOk = true;
          databaseMsg =
            attempt === 0
              ? "Veritabanı bağlantısı aktif."
              : `Veritabanı bağlantısı aktif (${attempt + 1}. denemede).`;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < DB_PROBE_ATTEMPTS - 1) {
            await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
          }
        }
      }
      if (!databaseOk) {
        databaseMsg = lastErr instanceof Error ? lastErr.message : "Veritabanı hatası";
      }
    }

    // 4. Worker / automation liveness
    //
    // Local dev: a long-running `npm run worker` writes data/worker_heartbeat.json
    // every ~3 min, so freshness < 3 min = healthy.
    //
    // Serverless (Vercel): there is NO persistent worker and the filesystem is
    // ephemeral, so a file heartbeat can never look fresh. Automation instead runs
    // via the daily Vercel cron (/api/cron/daily). We infer liveness from real DB
    // activity (latest account scan or generated draft) on a day-scale window — a
    // 3-min window would never match a once-daily cron.
    const isServerless = Boolean(process.env.VERCEL);
    const mode: "worker" | "cron" = isServerless ? "cron" : "worker";
    const FRESH_MS = isServerless ? 26 * 60 * 60 * 1000 : 3 * 60 * 1000;

    let inferredStatus: "unknown" | "recent_tick" | "stale" = "unknown";
    let lastTickAt: string | undefined;
    let lastScanResult: any;
    let lastError: string | undefined;
    let ageSeconds = -1;
    let recommendation = "";
    let lastCronRun:
      | {
          kind: string;
          startedAt: string;
          finishedAt: string | null;
          ok: boolean;
          partial: boolean;
          error: string | null;
        }
      | undefined;

    if (isServerless) {
      try {
        // Primary signal: the CronRun heartbeat written by /api/cron/* and the
        // manual scan. Falls back to scan/draft inference for pre-CronRun data.
        const [latestCron, lastSchedule, lastDraft] = await Promise.all([
          prisma.cronRun.findFirst({ orderBy: { startedAt: "desc" } }),
          prisma.schedule.findFirst({
            where: { lastScanAt: { not: null } },
            orderBy: { lastScanAt: "desc" },
            select: { lastScanAt: true },
          }),
          prisma.queueItem.findFirst({
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          }),
        ]);
        if (latestCron) {
          lastCronRun = {
            kind: latestCron.kind,
            startedAt: latestCron.startedAt.toISOString(),
            finishedAt: latestCron.finishedAt ? latestCron.finishedAt.toISOString() : null,
            ok: latestCron.ok,
            partial: latestCron.partial,
            error: latestCron.error,
          };
        }
        const candidates = [
          latestCron?.startedAt,
          lastSchedule?.lastScanAt,
          lastDraft?.createdAt,
        ].filter((d): d is Date => Boolean(d));
        if (candidates.length > 0) {
          const latest = candidates.reduce((a, b) => (a > b ? a : b));
          lastTickAt = latest.toISOString();
          const diffMs = Date.now() - latest.getTime();
          ageSeconds = Math.floor(diffMs / 1000);
          inferredStatus = diffMs < FRESH_MS ? "recent_tick" : "stale";
        }
      } catch {
        // ignore → unknown
      }
    } else {
      try {
        const heartbeatPath = path.join(process.cwd(), "data", "worker_heartbeat.json");
        if (fs.existsSync(heartbeatPath)) {
          const data = JSON.parse(fs.readFileSync(heartbeatPath, "utf-8"));
          const timeVal = data.lastTickAt || data.last;
          if (timeVal) {
            lastTickAt = timeVal;
            const diffMs = Date.now() - new Date(timeVal).getTime();
            ageSeconds = Math.floor(diffMs / 1000);
            inferredStatus = diffMs < FRESH_MS ? "recent_tick" : "stale";
          }
          lastScanResult = data.lastScanResult;
          lastError = data.lastError;
        }
      } catch {
        // ignore
      }
    }

    if (inferredStatus !== "recent_tick") {
      if (isServerless) {
        recommendation =
          inferredStatus === "stale"
            ? `Günlük cron en son ${Math.round(ageSeconds / 3600)} saat önce çalıştı. Vercel cron ayarını ve CRON_SECRET'i kontrol edin.`
            : "Otomasyon günlük Vercel cron ile çalışır. Henüz tick yok — ilk cron 06:00'da çalışacak ya da panelden manuel tarama yapın.";
      } else {
        recommendation =
          inferredStatus === "stale"
            ? `Worker aktif değil. Son tick: ${Math.round(ageSeconds / 60)} dakika önce. npm run dev:operator çalıştırın.`
            : "npm run dev:operator veya ayrı terminalde npm run worker çalıştırın.";
      }
    }

    // The cron DID run but errored → say that instead of the misleading
    // "cron çalışmadı" message (the most common false alarm pre-CronRun).
    if (isServerless && lastCronRun && lastCronRun.finishedAt && !lastCronRun.ok) {
      recommendation = `Son cron çalıştı fakat hata verdi: ${lastCronRun.error || "bilinmeyen hata"}. Panelden manuel tarama yapıp logları kontrol edin.`;
    } else if (isServerless && lastCronRun && lastCronRun.finishedAt && lastCronRun.ok && lastCronRun.partial) {
      // Overall ok, but a sub-stage degraded (e.g. an IG sync failed on a revoked
      // Meta token) — surface it instead of an all-green signal.
      recommendation =
        "Son cron çalıştı ama bazı alt-adımlar kısmi/başarısız (ör. Instagram senkronu). Profil → Entegrasyonlar ve Sistem'den durumu kontrol edin.";
    }

    // Result-level news pipeline health (fail-open: a DB hiccup here must not
    // take the whole health endpoint down).
    let newsPipeline: NewsPipelineHealth | { status: "unknown"; message: string };
    try {
      newsPipeline = await getNewsPipelineHealth();
    } catch (err) {
      newsPipeline = {
        status: "unknown",
        message: err instanceof Error ? err.message : "newsPipeline health hatası",
      };
    }

    // Meta (Instagram) token süresi alarmı — fail-open: bir DB hiccup tüm endpoint'i kırmasın.
    let metaToken: {
      configured: boolean;
      ok: boolean;
      status: "ok" | "warn" | "critical" | "unknown";
      daysUntilExpiry: number | null;
      message: string;
    };
    try {
      const cred = await integrationCredentialRepo.get(META_TOKEN_KEY);
      const hasEnvToken = Boolean(process.env.META_ACCESS_TOKEN);
      const { daysUntilExpiry, status } = computeTokenStatus(cred?.expiresAt ?? null);
      const configured = Boolean(cred) || hasEnvToken;
      const message =
        status === "critical"
          ? `Meta token ${daysUntilExpiry ?? "?"} gün içinde geçersiz — yenileyin.`
          : status === "warn"
            ? `Meta token ${daysUntilExpiry} gün geçerli — yakında yenileyin.`
            : configured
              ? "Meta token yapılandırılmış."
              : "Meta token ayarlı değil (Instagram opsiyonel).";
      metaToken = { configured, ok: status !== "critical", status, daysUntilExpiry, message };
    } catch (err) {
      metaToken = {
        configured: false,
        ok: true,
        status: "unknown",
        daysUntilExpiry: null,
        message: err instanceof Error ? err.message : "metaToken health hatası",
      };
    }

    // Cron auth posture — production without CRON_SECRET leaves cron endpoints open.
    const cronSecretConfigured = isCronSecretConfigured();
    const cronAuthCritical = isProductionRuntime() && !cronSecretConfigured;
    const cronAuth = {
      secretConfigured: cronSecretConfigured,
      ok: !cronAuthCritical,
      status: cronAuthCritical ? ("critical" as const) : ("ok" as const),
      message: cronAuthCritical
        ? "CRON_SECRET ayarlı değil — production cron uçları korumasız. Vercel env'e CRON_SECRET ekleyin."
        : cronSecretConfigured
          ? "Cron uçları CRON_SECRET ile korunuyor."
          : "Cron uçları dev/local'de açık (CRON_SECRET opsiyonel).",
    };

    return {
      openrouter: { configured: openrouterConfigured, ok: openrouterOk, message: openrouterMsg },
      socialdata: { configured: socialdataConfigured, ok: socialdataOk, message: socialdataMsg },
      database: { ok: databaseOk, message: databaseMsg },
      newsPipeline,
      metaToken,
      cronAuth,
      worker: {
        mode,
        inferredStatus,
        lastTickAt,
        lastScanResult,
        lastError,
        ageSeconds,
        recommendation,
        lastCronRun,
      },
    };
  },
};
