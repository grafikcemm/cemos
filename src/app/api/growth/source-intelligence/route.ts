import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { accountRepo } from "@/lib/db/accountRepo";
import { scoreSourcePostFallback } from "@/lib/growth-engine/scorer";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("unauthorized", 403);
  try {
    const { searchParams } = new URL(req.url);
    const accountHandle = searchParams.get("accountHandle") || searchParams.get("account") || "all";
    const sourceType = searchParams.get("sourceType") || "all";
    const status = searchParams.get("status") || "all"; // active | inactive | all
    const action = searchParams.get("action") || "all"; // tweet | quote | reply | ignore | all
    const risk = searchParams.get("risk") || "all"; // low | medium | high | all
    const search = searchParams.get("search") || "";
    const sort = searchParams.get("sort") || "opportunityScore"; // opportunityScore | riskScore | createdAt | updatedAt | sourceWeight

    // 1. Resolve Accounts
    let accounts = await accountRepo.findAll();
    if (accountHandle !== "all") {
      accounts = accounts.filter(
        (a) => a.handle.toLowerCase() === accountHandle.toLowerCase()
      );
    }
    const accountIds = accounts.map((a) => a.id);
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    // 2. Fetch Sources
    const sourceWhere: any = {
      accountId: { in: accountIds },
      archivedAt: null,
    };

    if (status === "active") {
      sourceWhere.enabled = true;
    } else if (status === "inactive") {
      sourceWhere.enabled = false;
    }

    if (sourceType !== "all") {
      sourceWhere.mode = sourceType.toUpperCase();
    }

    const dbSources = await prisma.source.findMany({
      where: sourceWhere,
      orderBy: { createdAt: "desc" },
    });

    const sourceMap = new Map(dbSources.map((s) => [s.id, s]));
    const sourceIds = dbSources.map((s) => s.id);

    // 3. Fetch SourcePosts (fetch up to 300 to process in memory)
    const postWhere: any = {
      accountId: { in: accountIds },
      sourceId: { in: sourceIds },
    };

    const dbPosts = await prisma.sourcePost.findMany({
      where: postWhere,
      orderBy: { scannedAt: "desc" },
      take: 300,
    });

    // 4. Enrich Posts with Dynamic Scoring
    const enrichedPosts = dbPosts.map((post) => {
      const account = accountMap.get(post.accountId);
      const source = sourceMap.get(post.sourceId);

      const targetHandle = account ? account.handle : "grafikcem";
      const sourceHandle = source ? source.handle : "unknown";

      const score = scoreSourcePostFallback({
        content: post.text,
        targetAccount: targetHandle,
        sourceHandle: sourceHandle,
        sourceType: "tweet",
        publishedAt: post.publishedAt?.toISOString() || post.scannedAt.toISOString(),
        metrics: {
          likes: post.likeCount,
          reposts: post.retweetCount,
        },
      });

      return {
        ...post,
        accountHandle: targetHandle,
        sourceHandle: sourceHandle,
        riskScore: score.riskScore,
        suggestedAction: score.suggestedAction,
        reason: score.reason || post.text.substring(0, 60),
      };
    });

    // 5. Apply Client-side Filtering on Enriched Posts
    let filteredPosts = enrichedPosts;

    if (action !== "all") {
      filteredPosts = filteredPosts.filter(
        (p) => p.suggestedAction.toLowerCase() === action.toLowerCase()
      );
    }

    if (risk !== "all") {
      filteredPosts = filteredPosts.filter((p) => {
        if (risk === "low") return p.riskScore < 50;
        if (risk === "medium") return p.riskScore >= 50 && p.riskScore < 70;
        if (risk === "high") return p.riskScore >= 70;
        return true;
      });
    }

    if (search) {
      const query = search.toLowerCase();
      filteredPosts = filteredPosts.filter(
        (p) =>
          p.text.toLowerCase().includes(query) ||
          p.sourceHandle.toLowerCase().includes(query) ||
          p.reason.toLowerCase().includes(query)
      );
    }

    // Apply Sorting
    filteredPosts.sort((a, b) => {
      if (sort === "opportunityScore") {
        return b.opportunityScore - a.opportunityScore;
      }
      if (sort === "riskScore") {
        return b.riskScore - a.riskScore;
      }
      if (sort === "createdAt" || sort === "publishedAt") {
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateB - dateA;
      }
      if (sort === "updatedAt" || sort === "scannedAt") {
        return new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime();
      }
      if (sort === "sourceWeight") {
        const sourceA = sourceMap.get(a.sourceId);
        const sourceB = sourceMap.get(b.sourceId);
        const weightA = sourceA ? sourceA.thresholdLikes : 0;
        const weightB = sourceB ? sourceB.thresholdLikes : 0;
        return weightB - weightA;
      }
      return 0;
    });

    // 6. Compute Aggregate Summary Statistics
    const totalSources = dbSources.length;
    const activeSources = dbSources.filter((s) => s.enabled).length;
    const inactiveSources = totalSources - activeSources;

    const totalSourcePosts = filteredPosts.length;
    const highOpportunityPosts = filteredPosts.filter((p) => p.opportunityScore >= 0.75 || p.opportunityScore >= 75).length;
    const highRiskPosts = filteredPosts.filter((p) => p.riskScore >= 70).length;

    let averageOpportunityScore = 0;
    if (totalSourcePosts > 0) {
      const sum = filteredPosts.reduce((acc, p) => acc + p.opportunityScore, 0);
      averageOpportunityScore = Math.round(sum / totalSourcePosts);
      // Map 0-1 range to 0-100 if stored in DB as decimal fraction
      if (averageOpportunityScore <= 1 && sum > 0) {
        averageOpportunityScore = Math.round(averageOpportunityScore * 100);
      }
    }

    // Determine Top Source handle (highest single opportunity score post or average opportunity score)
    let topSourceHandle = "";
    if (filteredPosts.length > 0) {
      // Find source with the highest opportunity score post
      const topPost = filteredPosts.reduce((prev, current) =>
        prev.opportunityScore > current.opportunityScore ? prev : current
      );
      topSourceHandle = topPost.sourceHandle;
    }

    // Enrich sources with post telemetry count
    const enrichedSources = dbSources.map((source) => {
      const account = accountMap.get(source.accountId);
      const postsForSource = enrichedPosts.filter((p) => p.sourceId === source.id);
      
      const sumOpp = postsForSource.reduce((acc, p) => acc + p.opportunityScore, 0);
      const avgOpp = postsForSource.length > 0 ? Math.round(sumOpp / postsForSource.length) : 0;
      
      const sumRisk = postsForSource.reduce((acc, p) => acc + p.riskScore, 0);
      const avgRisk = postsForSource.length > 0 ? Math.round(sumRisk / postsForSource.length) : 0;

      return {
        ...source,
        accountHandle: account ? account.handle : "unknown",
        totalPosts: postsForSource.length,
        averageOpportunity: avgOpp <= 1 && avgOpp > 0 ? Math.round(avgOpp * 100) : avgOpp,
        averageRisk: avgRisk,
      };
    });

    return ok({
      summary: {
        totalSources,
        activeSources,
        inactiveSources,
        totalSourcePosts,
        highOpportunityPosts,
        highRiskPosts,
        averageOpportunityScore,
        topSourceHandle,
      },
      sources: enrichedSources,
      sourcePosts: filteredPosts.map(p => ({
        ...p,
        // Normalize opportunityScore to 0-100 for UI consistency if stored as 0-1
        opportunityScore: p.opportunityScore <= 1 && p.opportunityScore > 0 
          ? Math.round(p.opportunityScore * 100) 
          : Math.round(p.opportunityScore)
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return fail(msg, 500);
  }
}
