import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

/**
 * Kalite KPI'ları (Sprint 8 — EVALUATION-SPEC §7; C9: yeni ekran YOK,
 * CostsTab detayına render edilir). LLM'siz, salt okuma:
 *  - acceptance rate = approved / (approved + rejected)
 *  - median edit-distance (kuzey yıldızı — FeedbackEvent.reason JSON'undan)
 *  - golden pass % (EvalTest golden: vakaları)
 * Veri yoksa null döner (UI "veri yok" gösterir; sıfır uydurulmaz).
 */

function parseEditDistance(reason: string): number | null {
  try {
    const parsed = JSON.parse(reason) as { editDistance?: unknown };
    return typeof parsed.editDistance === "number" ? parsed.editDistance : null;
  } catch {
    return null;
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [approved, rejected, editedEvents, goldenTests] = await Promise.all([
      prisma.feedbackEvent.count({ where: { feedbackType: "approved", createdAt: { gte: since } } }),
      prisma.feedbackEvent.count({ where: { feedbackType: "rejected", createdAt: { gte: since } } }),
      prisma.feedbackEvent.findMany({
        where: { feedbackType: "edited", createdAt: { gte: since } },
        select: { reason: true, editDistance: true },
        take: 500,
      }),
      prisma.evalTest.findMany({
        where: { testName: { startsWith: "golden:" }, score: { not: null } },
        select: { score: true },
      }),
    ]);

    const decided = approved + rejected;
    const acceptanceRate = decided > 0 ? Number((approved / decided).toFixed(3)) : null;

    // Kolon-önce, reason-JSON-fallback: yeni satırlar editDistance kolonundan,
    // eski satırlar reason JSON'undan okunur (geriye uyumlu).
    const distances = editedEvents
      .map((e) => (typeof e.editDistance === "number" ? e.editDistance : parseEditDistance(e.reason)))
      .filter((d): d is number => d !== null);
    const medianEditDistance =
      distances.length > 0 ? Number(median(distances)!.toFixed(3)) : null;

    const goldenScored = goldenTests.length;
    const goldenPassed = goldenTests.filter((t) => (t.score ?? 0) >= 100).length;
    const goldenPassPct =
      goldenScored > 0 ? Math.round((goldenPassed / goldenScored) * 100) : null;

    return ok({
      windowDays: 30,
      acceptanceRate,
      decidedCount: decided,
      medianEditDistance,
      editSampleCount: distances.length,
      goldenPassPct,
      goldenScored,
    });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "KPI'lar alınamadı", 500);
  }
}
