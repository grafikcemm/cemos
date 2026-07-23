import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { getDisplayName } from "@/lib/growth-engine/account-adapter";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("unauthorized", 403);
  try {
    const { searchParams } = new URL(req.url);
    const accountHandle = searchParams.get("accountHandle") || "all";
    const active = searchParams.get("active") || "all";
    const category = searchParams.get("category") || "all";
    const hookType = searchParams.get("hookType") || "all";
    const search = searchParams.get("search") || "";
    const sort = searchParams.get("sort") || "successScore";

    // 1. Fetch accounts to build an id/handle mapper
    const accounts = await prisma.account.findMany();
    const idToAccount = new Map<string, { id: string; handle: string; displayName: string }>();
    const handleToId = new Map<string, string>();
    for (const acc of accounts) {
      const displayName = getDisplayName(acc.handle);
      idToAccount.set(acc.id, { id: acc.id, handle: acc.handle, displayName });
      handleToId.set(acc.handle, acc.id);
    }

    // 2. Base query
    const where: any = {};

    // Account filter
    if (accountHandle !== "all") {
      const accountId = handleToId.get(accountHandle);
      if (accountId) {
        where.accountId = accountId;
      } else {
        // Return empty response immediately if invalid account handle
        return ok({
          summary: {
            totalPatterns: 0,
            activePatterns: 0,
            inactivePatterns: 0,
            averageSuccessScore: 0,
            topPatternName: "N/A",
            totalUsageCount: 0,
          },
          patterns: [],
        });
      }
    }

    // Active status filter
    if (active === "active") {
      where.isActive = true;
    } else if (active === "inactive") {
      where.isActive = false;
    }

    // Category filter
    if (category !== "all") {
      where.category = category;
    }

    // Hook Type filter
    if (hookType !== "all") {
      where.hookType = hookType;
    }

    // Search filter
    if (search.trim().length > 0) {
      where.OR = [
        { patternName: { contains: search } },
        { exampleGood: { contains: search } },
      ];
    }

    // 3. Sorting configuration
    const orderBy: any = {};
    const validSortFields = ["successScore", "usageCount", "createdAt", "updatedAt"];
    if (validSortFields.includes(sort)) {
      orderBy[sort] = "desc"; // Default descending
    } else {
      orderBy["successScore"] = "desc";
    }

    // 4. Fetch patterns
    // Egress (H3): mapper + özet metrikler yalnız aşağıdaki DAR alanları kullanır;
    // ağır `embeddingJson` (tam float vektör string, ~10-30KB/satır) ve
    // `angleSuggestionsJson` HİÇ döndürülmüyordu ama her satırda taşınıyordu.
    const patterns = await prisma.viralPattern.findMany({
      where,
      orderBy,
      // WP-02e: pattern havuzu kayıtlarla sınırsız büyür; 500 üst sınırı pratik
      // semantiği değiştirmeyen (mevcut havuz ~10²) bir egress emniyet kemeridir.
      take: 500,
      select: {
        id: true,
        accountId: true,
        patternName: true,
        category: true,
        hookType: true,
        structureJson: true,
        emotion: true,
        viralityTrigger: true,
        exampleGood: true,
        exampleBad: true,
        usageCount: true,
        successScore: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 5. Compute summary metrics based on filtered patterns
    const totalPatterns = patterns.length;
    const activePatterns = patterns.filter((p) => p.isActive).length;
    const inactivePatterns = totalPatterns - activePatterns;

    const totalUsageCount = patterns.reduce((sum, p) => sum + (p.usageCount || 0), 0);
    const averageSuccessScore = totalPatterns > 0
      ? Math.round(patterns.reduce((sum, p) => sum + (p.successScore || 0), 0) / totalPatterns)
      : 0;

    let topPatternName = "N/A";
    if (totalPatterns > 0) {
      const sortedForTop = [...patterns].sort((a, b) => b.successScore - a.successScore);
      topPatternName = sortedForTop[0].patternName;
    }

    // 6. Map pattern objects
    const mappedPatterns = patterns.map((vp) => {
      let structureJson: Record<string, any> = {};
      if (vp.structureJson) {
        try {
          structureJson = JSON.parse(vp.structureJson);
        } catch {}
      }
      return {
        id: vp.id,
        accountId: vp.accountId,
        accountHandle: idToAccount.get(vp.accountId)?.handle || "unknown",
        displayName: idToAccount.get(vp.accountId)?.displayName || "unknown",
        patternName: vp.patternName,
        category: vp.category,
        hookType: vp.hookType,
        structureJson,
        emotion: vp.emotion,
        viralityTrigger: vp.viralityTrigger,
        exampleGood: vp.exampleGood,
        exampleBad: vp.exampleBad,
        usageCount: vp.usageCount,
        successScore: vp.successScore,
        isActive: vp.isActive,
        createdAt: vp.createdAt.toISOString(),
        updatedAt: vp.updatedAt.toISOString(),
      };
    });

    return ok({
      summary: {
        totalPatterns,
        activePatterns,
        inactivePatterns,
        averageSuccessScore,
        topPatternName,
        totalUsageCount,
      },
      patterns: mappedPatterns,
    });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return fail(msg, 500);
  }
}
