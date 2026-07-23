import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { cronRunRepo } from "@/lib/db/cronRunRepo";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function serializeCronRun(run: {
  kind: string;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean;
  partial: boolean;
  error: string | null;
} | null) {
  if (!run) return null;
  return {
    kind: run.kind,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    ok: run.ok,
    partial: run.partial,
    error: run.error,
  };
}

/**
 * Lightweight learning telemetry for the "Öğrenme Durumu" card: pure DB
 * counts/lookups, zero LLM calls — cheap enough to render on every Settings
 * visit. Makes the continuous-learning loop VISIBLE to the operator.
 */
export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("unauthorized", 403);
  try {
    const weekAgo = new Date(Date.now() - WEEK_MS);
    const [lastDaily, lastLearn, patternsMinedLast7d, engagementEventsLast7d, topPatterns] =
      await Promise.all([
        cronRunRepo.latestByKind("daily"),
        cronRunRepo.latestByKind("learn"),
        prisma.viralPattern.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.feedbackEvent.count({
          where: { feedbackType: { startsWith: "engagement" }, createdAt: { gte: weekAgo } },
        }),
        prisma.viralPattern.findMany({
          where: { isActive: true },
          orderBy: { successScore: "desc" },
          take: 3,
          select: { patternName: true, successScore: true, usageCount: true },
        }),
      ]);

    return ok({
      lastDaily: serializeCronRun(lastDaily),
      lastLearn: serializeCronRun(lastLearn),
      patternsMinedLast7d,
      engagementEventsLast7d,
      topPatterns,
    });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Öğrenme durumu alınamadı";
    return fail(msg, 500);
  }
}
