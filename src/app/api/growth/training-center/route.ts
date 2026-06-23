import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { getAccountProfile } from "@/lib/growth-engine/account-profiles";
import { ok, fail } from "@/lib/utils/apiResponse";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountHandle = searchParams.get("accountHandle") || "all";
    const feedbackType = searchParams.get("feedbackType") || "all";
    const label = searchParams.get("label") || "all";
    const dateRange = searchParams.get("dateRange") || "all";
    const search = searchParams.get("search") || "";

    // 1. Fetch accounts to build an id/handle mapper
    const accounts = await prisma.account.findMany();
    const idToAccount = new Map<string, { id: string; handle: string; displayName: string }>();
    const handleToId = new Map<string, string>();
    for (const acc of accounts) {
      let displayName = acc.handle;
      try {
        const profile = getAccountProfile(acc.handle);
        if (profile) {
          displayName = profile.displayName;
        }
      } catch {}
      idToAccount.set(acc.id, { id: acc.id, handle: acc.handle, displayName });
      handleToId.set(acc.handle, acc.id);
    }

    // 2. Base filter options
    const whereFeedback: any = {};
    const whereTraining: any = {};
    const wherePattern: any = { isActive: true }; // recentPatterns snapshot shows only active ones

    // Account Handle filter
    if (accountHandle !== "all") {
      const accountId = handleToId.get(accountHandle);
      if (accountId) {
        whereFeedback.accountId = accountId;
        whereTraining.accountId = accountId;
        wherePattern.accountId = accountId;
      } else {
        // If an invalid handle was passed, return empty lists immediately
        return ok({
          summary: {
            totalFeedbackEvents: 0,
            totalTrainingExamples: 0,
            goodExamples: 0,
            badExamples: 0,
            editedExamples: 0,
            savedPatterns: 0,
          },
          feedbackEvents: [],
          trainingExamples: [],
          recentPatterns: [],
        });
      }
    }

    // Feedback Type filter
    if (feedbackType !== "all") {
      whereFeedback.feedbackType = feedbackType;
    }

    // Label filter
    if (label !== "all") {
      whereTraining.label = label;
    }

    // Date Range filter
    if (dateRange !== "all") {
      const now = new Date();
      let limitDate: Date | null = null;
      if (dateRange === "today") {
        limitDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateRange === "last_7_days") {
        limitDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (dateRange === "last_30_days") {
        limitDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      if (limitDate) {
        whereFeedback.createdAt = { gte: limitDate };
        whereTraining.createdAt = { gte: limitDate };
      }
    }

    // Search filter (Case-insensitive contains in SQLite is default behavior)
    if (search.trim().length > 0) {
      whereFeedback.OR = [
        { originalContent: { contains: search } },
        { editedContent: { contains: search } },
        { reason: { contains: search } },
      ];
      whereTraining.OR = [
        { sourceContent: { contains: search } },
        { outputContent: { contains: search } },
        { reason: { contains: search } },
      ];
    }

    // 3. Fetch data
    const feedbackEvents = await prisma.feedbackEvent.findMany({
      where: whereFeedback,
      orderBy: { createdAt: "desc" },
    });

    const trainingExamples = await prisma.trainingExample.findMany({
      where: whereTraining,
      orderBy: { createdAt: "desc" },
    });

    const recentPatterns = await prisma.viralPattern.findMany({
      where: wherePattern,
      orderBy: { successScore: "desc" },
    });

    // 4. Map account IDs to handles/displayNames and parse JSON columns safely
    const mappedFeedback = feedbackEvents.map((evt) => ({
      id: evt.id,
      accountId: evt.accountId,
      accountHandle: idToAccount.get(evt.accountId)?.handle || "unknown",
      displayName: idToAccount.get(evt.accountId)?.displayName || "unknown",
      queueItemId: evt.queueItemId,
      sourcePostId: evt.sourcePostId,
      feedbackType: evt.feedbackType,
      originalContent: evt.originalContent,
      editedContent: evt.editedContent,
      reason: evt.reason,
      createdAt: evt.createdAt.toISOString(),
    }));

    const mappedTraining = trainingExamples.map((te) => {
      let metricsJson: Record<string, any> = {};
      if (te.metricsJson) {
        try {
          metricsJson = JSON.parse(te.metricsJson);
        } catch {}
      }
      return {
        id: te.id,
        accountId: te.accountId,
        accountHandle: idToAccount.get(te.accountId)?.handle || "unknown",
        displayName: idToAccount.get(te.accountId)?.displayName || "unknown",
        inputType: te.inputType,
        sourceContent: te.sourceContent,
        outputContent: te.outputContent,
        label: te.label,
        reason: te.reason,
        metricsJson,
        createdAt: te.createdAt.toISOString(),
      };
    });

    const mappedPatterns = recentPatterns.map((vp) => {
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
      };
    });

    // 5. Build summary metrics
    const summary = {
      totalFeedbackEvents: mappedFeedback.length,
      totalTrainingExamples: mappedTraining.length,
      goodExamples: mappedTraining.filter((t) => t.label === "good").length,
      badExamples: mappedTraining.filter((t) => t.label === "bad").length,
      editedExamples: mappedTraining.filter((t) => t.label === "edited").length,
      savedPatterns: mappedPatterns.length,
    };

    return ok({
      summary,
      feedbackEvents: mappedFeedback,
      trainingExamples: mappedTraining,
      recentPatterns: mappedPatterns,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return fail(msg, 500);
  }
}
