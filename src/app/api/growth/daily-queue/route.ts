import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { accountRepo } from "@/lib/db/accountRepo";
import { accountProfiles } from "@/lib/accounts";
import { computePillarConsistency } from "@/lib/growth-engine/pillar-consistency";
import { readinessInputFromQueueItem } from "@/lib/services/readinessAdapter";
import { assessReadiness } from "@/lib/services/readinessService";
import { whyToday } from "@/lib/services/whyToday";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const accountHandle = req.nextUrl.searchParams.get("accountHandle") || "all";
    const statusFilter = req.nextUrl.searchParams.get("status") || "all";
    const dateRange = req.nextUrl.searchParams.get("dateRange") || "all";
    const riskFilter = req.nextUrl.searchParams.get("risk") || "all";
    const search = req.nextUrl.searchParams.get("search") || "";
    const sort = req.nextUrl.searchParams.get("sort") || "createdAt";

    // Resolve accounts map with schedule
    const accounts = await prisma.account.findMany({
      include: { schedule: true },
      orderBy: { handle: "asc" }
    });
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    let targetAccountId: string | undefined;
    if (accountHandle !== "all") {
      const acc = accounts.find((a) => a.handle === accountHandle);
      if (acc) {
        targetAccountId = acc.id;
      } else {
        // If account handle given but not found, return empty candidates list
        return ok({
          summary: {
            totalItems: 0,
            draftItems: 0,
            approvedItems: 0,
            rejectedItems: 0,
            scheduledItems: 0,
            highRiskItems: 0,
            averagePublishScore: 0,
            todayItems: 0,
          },
          items: [],
        });
      }
    }

    // Query QueueItems from DB
    const whereClause: any = {};
    if (targetAccountId) {
      whereClause.accountId = targetAccountId;
    }

    const rawItems = await prisma.queueItem.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      // Faz 1C: "Neden bugün?" + doğrulama durumu kaynağa dayanır (whyToday).
      include: { sourcePost: true, newsItem: true },
    });

    const nowMs = Date.now();

    // Faz 1E (ADR-025): taslak başına en güncel intent hazırlığı — UI
    // "Paylaşıldı olarak işaretle" durumunu server kaynağından besler (reload
    // sonrası korunur); staleForCurrentContent içerik-değişti işaretidir.
    const { publishAttemptService } = await import("@/lib/publish/publishAttemptService");
    const attemptMap = await publishAttemptService.latestIntentAttempts(
      rawItems.map((i) => ({ id: i.id, content: i.content, editedContent: i.editedContent })),
    );

    const { getLocalDayBounds } = await import("@/lib/utils/date");
    const { start: startOfToday, end: endOfToday } = getLocalDayBounds("Europe/Istanbul");

    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const endOfTomorrow = new Date(endOfToday.getTime() + 24 * 60 * 60 * 1000);

    const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysHence = new Date(endOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Map and enrich items
    const enrichedItems = rawItems.map((item) => {
      const acc = accountMap.get(item.accountId);
      const accHandle = acc?.handle || "unknown";
      
      let parsedScores: any = {};
      try {
        if (item.scores) {
          parsedScores = typeof item.scores === "string" ? JSON.parse(item.scores) : item.scores;
        }
      } catch {}

      const riskScore = parsedScores.riskScore ?? parsedScores.risk ?? 20;
      const personaMatchScore = parsedScores.personaMatchScore ?? parsedScores.personaMatch ?? 75;
      const viralityScore = parsedScores.viralityScore ?? parsedScores.viralPotential ?? parsedScores.virality ?? 75;
      // LIVE path persists `hookStrength` (no Score suffix); growth path uses hookStrengthScore.
      const hookStrengthScore = parsedScores.hookStrengthScore ?? parsedScores.hookStrength ?? 75;
      const clarityScore = parsedScores.clarityScore ?? 75;
      const noveltyScore = parsedScores.noveltyScore ?? 75;

      // Faz B: content-quality "path" + leak signals.
      const payoff = typeof parsedScores.payoff === "string" ? parsedScores.payoff : "none";
      const leaks = Array.isArray(parsedScores.leaks) ? parsedScores.leaks : [];
      const ctaPresent = payoff !== "none";

      let publishScore = parsedScores.publishScore;
      let isEstimatedScore = false;
      if (typeof publishScore !== "number") {
         publishScore = Math.round((personaMatchScore + viralityScore + hookStrengthScore + clarityScore + noveltyScore) / 5);
         isEstimatedScore = true;
      }

      // Faz 1C: yayına-hazırlık (kart/drawer AYNI türetilmiş sonucu kullanır) +
      // "Neden bugün?"/doğrulama (kaynak ≠ fact-check). Yayın anında publishService
      // bunu YENİDEN çalıştırır — bu payload UI kararı, yayın kapısı değil.
      const readinessInput = readinessInputFromQueueItem(item, {
        handle: accHandle,
        maxChars: acc?.maxChars ?? 280,
      });
      const readiness = assessReadiness(readinessInput);
      const why = whyToday({
        newsItem: item.newsItem
          ? {
              sourceVerification: item.newsItem.sourceVerification,
              whyPeopleCare: item.newsItem.whyPeopleCare,
              title: item.newsItem.trTitle ?? item.newsItem.originalTitle,
              fetchedAt: item.newsItem.fetchedAt,
            }
          : null,
        sourcePost: item.sourcePost
          ? {
              scannedAt: item.sourcePost.scannedAt,
              publishedAt: item.sourcePost.publishedAt,
              url: item.sourcePost.url,
            }
          : null,
        nowMs,
      });

      const attempt = attemptMap.get(item.id);

      return {
        ...item,
        accountHandle: accHandle,
        displayName: acc?.xHandle || acc?.handle || "unknown",
        // Faz 1E: intent hazırlık durumu (yoksa null) — prepared + güncel metinle
        // eşleşiyorsa UI "Paylaşıldı olarak işaretle"yi gösterir.
        publishAttempt: attempt
          ? {
              id: attempt.id,
              state: attempt.state,
              contentHash: attempt.contentHash,
              staleForCurrentContent: attempt.staleForCurrentContent,
            }
          : null,
        readiness,
        // Client canlı readiness için: düzenlerken editedContent'i değiştirip
        // assessReadiness'i YENİDEN koşar (aynı saf fonksiyon → kart/sunucu tutarlı).
        readinessInput,
        whyToday: why,
        scoresParsed: {
          publishScore,
          isEstimatedScore,
          personaMatchScore,
          hookStrengthScore,
          clarityScore,
          viralityScore,
          noveltyScore,
          riskScore,
          // Sprint 1 ayrışık alt-sinyaller (Bugün kartı çubukları). null =
          // sinyal yok (eski kayıt / judge koşmadı) — UI 75 uydurmasın diye
          // default doldurulmaz.
          turkishNaturalness:
            typeof parsedScores.turkishNaturalness === "number"
              ? parsedScores.turkishNaturalness
              : null,
          sourceFaithfulness:
            typeof parsedScores.sourceFaithfulness === "number"
              ? parsedScores.sourceFaithfulness
              : null,
          judged: parsedScores.telemetry?.judged === true,
          publishRecommendation: parsedScores.publishRecommendation || "publish",
          rewriteSuggestion: parsedScores.rewriteSuggestion || "",
          angle: parsedScores.angle || "safe",
          reasoning: parsedScores.reasoning || "Standard draft in queue",
          patternUsed: parsedScores.patternUsed,
          writerModel: parsedScores.modelUsed?.writer || parsedScores.writerModel || "unknown",
          judgeModel: parsedScores.modelUsed?.judge || parsedScores.judgeModel || "unknown",
          finalEditorModel: parsedScores.modelUsed?.finalEditor || parsedScores.finalEditorModel || "unknown",
          modelFallbackUsed: parsedScores.modelUsed?.writerFallbackUsed || parsedScores.modelUsed?.judgeFallbackUsed || parsedScores.modelFallbackUsed || false,
          modelFallbackReason: parsedScores.modelUsed?.writerFallbackReason || parsedScores.modelUsed?.judgeFallbackReason || parsedScores.modelFallbackReason || "",
          payoff,
          ctaPresent,
          leaks,
          leakCount: leaks.length,
          // Faz C — package linkage lives in scores JSON (no DB column).
          packageId: typeof parsedScores.packageId === "string" ? parsedScores.packageId : null,
          packageRole: typeof parsedScores.packageRole === "string" ? parsedScores.packageRole : null,
        },
      };
    });

    // Perform filtering in-memory for parsed criteria
    const filteredItems = enrichedItems.filter((item) => {
      // 0. Account Handle Fallback (useful for robust mock testing)
      if (targetAccountId && item.accountId !== targetAccountId) return false;

      // 1. Status Filter
      if (statusFilter !== "all") {
        const itemStatus = item.status === "new" ? "draft" : item.status;
        if (statusFilter === "active") {
          // needs_edit kuyrukta GÖRÜNÜR (operatör düzenlesin diye) ama edit-gate
          // + rozet yayınlanmasını engeller — kalite kapısı redirect'tir, silme değil.
          if (!["draft", "scheduled", "approved", "needs_edit"].includes(itemStatus)) return false;
        } else if (itemStatus !== statusFilter) {
          return false;
        }
      }

      // 2. Date Range Filter
      if (dateRange !== "all") {
        let itemDate: Date;
        if (dateRange === "tomorrow" || dateRange === "next_7_days") {
          itemDate = item.scheduledAt ? new Date(item.scheduledAt) : new Date(item.createdAt);
        } else {
          itemDate = item.status === "scheduled" && item.scheduledAt ? new Date(item.scheduledAt) : new Date(item.createdAt);
        }

        if (dateRange === "today") {
          if (itemDate < startOfToday || itemDate > endOfToday) return false;
        } else if (dateRange === "tomorrow") {
          if (itemDate < startOfTomorrow || itemDate > endOfTomorrow) return false;
        } else if (dateRange === "last_7_days") {
          if (item.status === "published" || item.status === "manual_published") return false;
          if (itemDate < sevenDaysAgo || itemDate > endOfToday) return false;
        } else if (dateRange === "next_7_days") {
          if (itemDate < startOfToday || itemDate > sevenDaysHence) return false;
        }
      }

      // 3. Risk Filter
      if (riskFilter !== "all") {
        const risk = item.scoresParsed.riskScore;
        if (riskFilter === "low" && risk >= 40) return false;
        if (riskFilter === "medium" && (risk < 40 || risk >= 70)) return false;
        if (riskFilter === "high" && risk < 70) return false;
      }

      // 4. Search Filter
      if (search.trim()) {
        const lowerSearch = search.toLowerCase();
        const contentMatch = item.content.toLowerCase().includes(lowerSearch);
        const editedMatch = item.editedContent?.toLowerCase().includes(lowerSearch);
        if (!contentMatch && !editedMatch) return false;
      }

      return true;
    });

    // Perform sorting
    filteredItems.sort((a, b) => {
      if (sort === "createdAt") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else if (sort === "scheduledAt") {
        const timeA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
        const timeB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
        return timeB - timeA;
      } else if (sort === "publishScore") {
        return b.scoresParsed.publishScore - a.scoresParsed.publishScore;
      } else if (sort === "riskScore") {
        return b.scoresParsed.riskScore - a.scoresParsed.riskScore;
      }
      return 0;
    });

    // Calculate aggregate telemetry summaries
    const totalItems = enrichedItems.length;
    const draftItems = enrichedItems.filter((i) => i.status === "new" || i.status === "draft").length;
    const approvedItems = enrichedItems.filter((i) => i.status === "approved").length;
    const rejectedItems = enrichedItems.filter((i) => i.status === "rejected").length;
    const scheduledItems = enrichedItems.filter((i) => i.status === "scheduled").length;
    const highRiskItems = enrichedItems.filter((i) => i.scoresParsed.riskScore >= 70).length;

    const sumPublishScore = enrichedItems.reduce((sum, i) => sum + i.scoresParsed.publishScore, 0);
    const averagePublishScore = totalItems > 0 ? Math.round(sumPublishScore / totalItems) : 0;

    // Faz B: CTA coverage + leak totals (content-quality, not revenue).
    const draftsWithCta = enrichedItems.filter((i) => i.scoresParsed.ctaPresent).length;
    const ctaCoveragePct = totalItems > 0 ? Math.round((draftsWithCta / totalItems) * 100) : 0;
    const totalLeaks = enrichedItems.reduce((sum, i) => sum + i.scoresParsed.leakCount, 0);

    // Faz D: pillar consistency (Trust signal) — only meaningful per single account.
    const pillarProfile =
      accountHandle !== "all"
        ? accountProfiles[accountHandle as keyof typeof accountProfiles]
        : undefined;
    const pillarConsistency = pillarProfile
      ? computePillarConsistency({
          items: enrichedItems.map((i) => ({ mode: i.mode })),
          knownPillars: pillarProfile.modes.map((m) => m.id),
        })
      : null;

    const todayItems = enrichedItems.filter((item) => {
      const itemDate = item.scheduledAt ? new Date(item.scheduledAt) : new Date(item.createdAt);
      return itemDate >= startOfToday && itemDate <= endOfToday;
    }).length;

    // Create accountsStatus
    const accountsStatus = accounts.map((acc: any) => {
      const accTodayItems = enrichedItems.filter((item) => {
        const itemDate = item.scheduledAt ? new Date(item.scheduledAt) : new Date(item.createdAt);
        return item.accountId === acc.id && itemDate >= startOfToday && itemDate <= endOfToday;
      }).length;

      return {
        id: acc.id,
        handle: acc.handle,
        displayName: acc.xHandle || acc.handle,
        automationEnabled: acc.schedule?.automationEnabled ?? false,
        lastScanAt: acc.schedule?.lastScanAt ?? null,
        todayItems: accTodayItems,
      };
    });

    const activeBacklogCount = enrichedItems.filter((item) => {
      const itemStatus = item.status === "new" ? "draft" : item.status;
      if (!["draft", "approved", "scheduled"].includes(itemStatus)) return false;
      const itemDate = item.scheduledAt ? new Date(item.scheduledAt) : new Date(item.createdAt);
      return itemDate < startOfToday || itemDate > endOfToday;
    }).length;

    const summary = {
      totalItems,
      draftItems,
      approvedItems,
      rejectedItems,
      scheduledItems,
      highRiskItems,
      averagePublishScore,
      todayItems,
      accountsStatus,
      activeBacklogCount,
      draftsWithCta,
      ctaCoveragePct,
      totalLeaks,
      pillarConsistency,
    };

    return ok({
      summary,
      items: filteredItems,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error during daily queue fetch.";
    return fail(msg, 500);
  }
}
