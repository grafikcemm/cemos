import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { accountRepo } from "@/lib/db/accountRepo";
import { scoreSourcePostFallback } from "@/lib/growth-engine/scorer";
import { extractPatternSyncFallback } from "@/lib/growth-engine/pattern-extractor";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountHandle = searchParams.get("accountHandle") || searchParams.get("account") || "all";
    const action = searchParams.get("action") || "all"; // tweet | quote | reply | ignore | all
    const risk = searchParams.get("risk") || "all"; // low | medium | high | all
    const minOpportunity = Number(searchParams.get("minOpportunity") || "0");
    const status = searchParams.get("status") || "all"; // all | new | reviewed | ignored | queued
    const search = searchParams.get("search") || "";
    const sort = searchParams.get("sort") || "opportunityScore"; // opportunityScore | riskScore | publishedAt | scannedAt | viralScore

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
    const dbSources = await prisma.source.findMany({
      where: { accountId: { in: accountIds }, archivedAt: null },
    });
    const sourceMap = new Map(dbSources.map((s) => [s.id, s]));
    const sourceIds = dbSources.map((s) => s.id);

    // 3. Fetch SourcePosts (take up to 300 for rich in-memory handling)
    const postWhere: any = {
      accountId: { in: accountIds },
      sourceId: { in: sourceIds },
    };

    if (status !== "all") {
      postWhere.status = status;
    }

    const dbPosts = await prisma.sourcePost.findMany({
      where: postWhere,
      orderBy: { scannedAt: "desc" },
      take: 300,
    });

    // 4. Enrich each post with scoring and pattern extraction
    const enrichedCandidates = dbPosts.map((post) => {
      const account = accountMap.get(post.accountId);
      const source = sourceMap.get(post.sourceId);

      const targetHandle = account ? account.handle : "unknown";
      const sourceHandle = source ? source.handle : "unknown";
      const sourceName = source && source.displayName ? source.displayName : "";

      // Scoring
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

      // Pattern Extraction
      let patternResult = {
        suggestedPatterns: [] as string[],
        emotionalTrigger: "bunu bilmem gerekiyordu",
        viralityReason: "Genel viral kanca yapısı",
      };

      try {
        const extracted = extractPatternSyncFallback({
          text: post.text,
          accountHandle: targetHandle,
          sourceType: "manual",
          language: "TR",
        });
        patternResult = {
          suggestedPatterns: extracted.suggestedPatterns || [],
          emotionalTrigger: extracted.emotionalTrigger || "bunu bilmem gerekiyordu",
          viralityReason: extracted.viralityReason || "Genel viral kanca yapısı",
        };
      } catch {}

      // Normalize opportunityScore (decimal 0-1 to 0-100 if stored as fraction)
      const rawOppScore = post.opportunityScore;
      const opportunityScore = rawOppScore <= 1 && rawOppScore > 0
        ? Math.round(rawOppScore * 100)
        : Math.round(rawOppScore);

      return {
        id: post.id,
        sourceHandle: sourceHandle,
        sourceName: sourceName,
        accountHandle: targetHandle,
        content: post.text,
        url: post.url || "",
        publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
        metrics: {
          likes: post.likeCount,
          reposts: post.retweetCount,
          views: post.viewCount,
        },
        score: {
          opportunityScore: opportunityScore || score.opportunityScore,
          riskScore: score.riskScore,
          suggestedAction: score.suggestedAction,
          reason: score.reason || "AI Opportunity",
        },
        pattern: {
          suggestedPatterns: patternResult.suggestedPatterns,
          emotionalTrigger: patternResult.emotionalTrigger,
          viralityReason: patternResult.viralityReason,
        },
        status: post.status,
        scannedAt: post.scannedAt,
        viralScore: post.viralScore,
      };
    });

    // 5. Apply Client-side Filtering
    let filteredCandidates = enrichedCandidates;

    if (action !== "all") {
      filteredCandidates = filteredCandidates.filter(
        (c) => c.score.suggestedAction.toLowerCase() === action.toLowerCase()
      );
    }

    if (risk !== "all") {
      filteredCandidates = filteredCandidates.filter((c) => {
        if (risk === "low") return c.score.riskScore < 50;
        if (risk === "medium") return c.score.riskScore >= 50 && c.score.riskScore < 70;
        if (risk === "high") return c.score.riskScore >= 70;
        return true;
      });
    }

    if (minOpportunity > 0) {
      filteredCandidates = filteredCandidates.filter(
        (c) => c.score.opportunityScore >= minOpportunity
      );
    }

    if (search) {
      const query = search.toLowerCase();
      filteredCandidates = filteredCandidates.filter(
        (c) =>
          c.content.toLowerCase().includes(query) ||
          c.sourceHandle.toLowerCase().includes(query) ||
          c.score.reason.toLowerCase().includes(query) ||
          c.pattern.suggestedPatterns.some((p) => p.toLowerCase().includes(query))
      );
    }

    // Apply Sorting
    filteredCandidates.sort((a, b) => {
      if (sort === "opportunityScore") {
        return b.score.opportunityScore - a.score.opportunityScore;
      }
      if (sort === "riskScore") {
        return b.score.riskScore - a.score.riskScore;
      }
      if (sort === "publishedAt") {
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateB - dateA;
      }
      if (sort === "scannedAt") {
        return new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime();
      }
      if (sort === "viralScore") {
        return b.viralScore - a.viralScore;
      }
      return 0;
    });

    // 6. Calculate Summary Stats
    const totalCandidates = filteredCandidates.length;
    const highOpportunity = filteredCandidates.filter((c) => c.score.opportunityScore >= 75).length;
    const highRisk = filteredCandidates.filter((c) => c.score.riskScore >= 70).length;
    const tweetCandidates = filteredCandidates.filter((c) => c.score.suggestedAction === "tweet").length;
    const quoteCandidates = filteredCandidates.filter((c) => c.score.suggestedAction === "quote").length;
    const replyCandidates = filteredCandidates.filter((c) => c.score.suggestedAction === "reply").length;
    const ignored = filteredCandidates.filter((c) => c.status === "ignored").length;

    let averageOpportunityScore = 0;
    if (totalCandidates > 0) {
      const sum = filteredCandidates.reduce((acc, c) => acc + c.score.opportunityScore, 0);
      averageOpportunityScore = Math.round(sum / totalCandidates);
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalCandidates,
        highOpportunity,
        highRisk,
        tweetCandidates,
        quoteCandidates,
        replyCandidates,
        ignored,
        averageOpportunityScore,
      },
      candidates: filteredCandidates,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
