import { prisma } from "@/lib/db/client";
import { healthService } from "@/lib/services/healthService";

/**
 * Operator hazırlık değerlendirmesi (W1 yumuşatma).
 *
 * Felsefe: TEK gerçek blocker = bugün taslak yokluğu (+ altyapı: DB / hedef
 * hesaplar). Üretim altyapısı uyarıları (OpenRouter/SocialData/otomasyon/cron/
 * bütçe/dev-profil) `warnings`'a düşer ve `ready`'yi BLOKLAMAZ — iki hesapta da
 * bugün taslak varsa "Operator Mode Hazır" yeşil döner. Uyarılar yine yüzeyde
 * gösterilir (yarının otomasyonu için aksiyon alınabilsin).
 */
export const operatorReadinessService = {
  async getReadiness() {
    const health = await healthService.getHealth({ deep: false });
    const targetHandles = ["grafikcem", "maskulenkod"];

    const accounts = await prisma.account.findMany({
      where: { handle: { in: targetHandles } },
      include: { schedule: true },
    });

    const issues: string[] = [];
    const warnings: string[] = [];
    const checks = {
      workerRecent: false,
      openrouterOk: false,
      socialdataOk: false,
      databaseOk: false,
      accountsFound: false,
      automationEnabled: false,
      cadenceDaily: false,
      dailyMaxPostsOne: false,
      todayItemsPerfect: false,
      costUnderBudget: false,
    };

    // 1. Worker / cron tazeliği → uyarı (bloklamaz).
    if (health.worker.inferredStatus === "recent_tick") {
      checks.workerRecent = true;
    } else if (health.worker.mode === "cron") {
      warnings.push("Günlük cron son 26 saatte çalışmadı — Vercel cron / CRON_SECRET kontrol edin.");
    } else {
      warnings.push("Worker çalışmıyor veya güncel değil (stale) — yarının otomatik üretimi için worker'ı çalıştırın.");
    }

    // 2. Üretim API'leri → uyarı (mevcut taslakları bloklamaz; yeni üretim için gerekir).
    if (health.openrouter.ok) {
      checks.openrouterOk = true;
    } else {
      warnings.push("OpenRouter API anahtarı geçersiz/eksik — yeni taslak üretilemez.");
    }
    if (health.socialdata.ok) {
      checks.socialdataOk = true;
    } else {
      warnings.push("SocialData API anahtarı geçersiz/eksik — yeni kaynak taraması yapılamaz.");
    }

    // 3. Altyapı → gerçek blocker.
    if (health.database.ok) {
      checks.databaseOk = true;
    } else {
      issues.push("Veritabanı bağlantısı aktif değil.");
    }

    const foundHandles = accounts.map((a) => a.handle);
    const missing = targetHandles.filter((h) => !foundHandles.includes(h));
    if (missing.length === 0) {
      checks.accountsFound = true;
    } else {
      missing.forEach((m) => issues.push(`Sistemde hedef hesap bulunamadı: ${m}`));
    }

    // 4. Hesap-bazlı kontrol listesi.
    const { getLocalDayBounds } = await import("@/lib/utils/date");
    const { start: todayStart, end: todayEnd } = getLocalDayBounds("Europe/Istanbul");
    const stats: Record<string, any> = {};
    const backlog: Record<string, number> = {};

    let allAutoEnabled = true;
    let allCadenceDaily = true;
    let allMaxPostsOne = true;
    let allTodayItemsReady = true;

    for (const handle of targetHandles) {
      const acc = accounts.find((a) => a.handle === handle);
      if (!acc) {
        stats[handle] = { found: false };
        allTodayItemsReady = false;
        continue;
      }

      const todayCount = await prisma.queueItem.count({
        where: {
          accountId: acc.id,
          createdAt: { gte: todayStart, lte: todayEnd },
          status: { in: ["new", "draft", "approved", "scheduled"] },
        },
      });

      const backlogCount = await prisma.queueItem.count({
        where: {
          accountId: acc.id,
          createdAt: { lt: todayStart },
          status: { in: ["new", "draft", "approved", "scheduled"] },
        },
      });

      stats[handle] = {
        found: true,
        automationEnabled: acc.schedule?.automationEnabled ?? false,
        cadence: acc.schedule?.cadence ?? "daily",
        dailyMaxPosts: acc.schedule?.dailyMaxPosts ?? 1,
        todayItems: todayCount,
        lastScanAt: acc.schedule?.lastScanAt ?? null,
      };

      backlog[handle] = backlogCount;

      // Konfigürasyon sapmaları → uyarı (bloklamaz).
      if (!acc.schedule?.automationEnabled) {
        allAutoEnabled = false;
        warnings.push(`${handle} otomasyonu kapalı — otomatik üretim için Ayarlar'dan açın.`);
      }
      if (acc.schedule?.cadence !== "daily") {
        allCadenceDaily = false;
        warnings.push(`${handle} günlük tarama modunda değil.`);
      }
      if (acc.schedule?.dailyMaxPosts !== 1) {
        allMaxPostsOne = false;
        warnings.push(`${handle} günlük gönderim limiti 1 değil.`);
      }
      // Taslak yokluğu → TEK gerçek blocker.
      if (todayCount < 1) {
        allTodayItemsReady = false;
        issues.push(`${handle} için bugün taslak yok.`);
      }
    }

    checks.automationEnabled = allAutoEnabled;
    checks.cadenceDaily = allCadenceDaily;
    checks.dailyMaxPostsOne = allMaxPostsOne;
    checks.todayItemsPerfect = allTodayItemsReady;

    // 5. Maliyet kontrolü → uyarı (bloklamaz).
    const thisMonthStr = new Date().toISOString().slice(0, 7);
    const logs = await prisma.usageLog.findMany({
      where: { date: { startsWith: thisMonthStr } },
    });
    const totalMonthCost = logs.reduce((sum, l) => sum + l.estimatedCostUsd, 0);

    const monthlyBudgetUSD = Number(process.env.MONTHLY_AI_BUDGET_USD || "7");
    const budgetExceeded = totalMonthCost >= monthlyBudgetUSD;
    checks.costUnderBudget = !budgetExceeded;
    if (budgetExceeded) {
      warnings.push(`Aylık bütçe sınırı aşıldı (${totalMonthCost.toFixed(2)} / ${monthlyBudgetUSD} USD) — yeni üretimi beklatmayı düşünün.`);
    }

    // 6. Model profil kalitesi → uyarı (bloklamaz).
    const { resolveModel } = await import("@/lib/ai/model-config");
    const activeProfile = process.env.MODEL_PROFILE || "operator_quality";
    const hasFreeModel =
      resolveModel("cheapWriter").includes(":free") ||
      resolveModel("viralJudge").includes(":free") ||
      resolveModel("qualityJudge").includes(":free");

    if (activeProfile === "dev" || hasFreeModel) {
      warnings.push("Kalite profili dev/free — daha iyi çıktı için Ayarlar'dan 'Operator Quality' modunu etkinleştirin.");
    }

    const todayItemsCount = targetHandles.reduce((sum, h) => sum + (stats[h]?.todayItems || 0), 0);

    const ready = issues.length === 0;
    const readyWithWarning = ready && warnings.length > 0;

    return {
      ready,
      readyWithWarning,
      checks,
      issues,
      warnings,
      stats,
      backlog,
      todayItemsCount,
      monthlyBudgetExceeded: budgetExceeded,
      totalMonthCost,
      monthlyBudgetUSD,
      lastScanResult: health.worker.lastScanResult,
      workerInferredStatus: health.worker.inferredStatus,
      workerMode: health.worker.mode,
      modelProfile: activeProfile,
    };
  },
};
