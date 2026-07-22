import type { NextRequest } from "next/server";
import { ytVideoRepo } from "@/lib/db/ytVideoRepo";
import { isYouTubeConfigured } from "@/lib/youtube/ytConfig";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";

// GET /api/youtube/videos?category=&minScore=&sinceDays=&shorts=only|exclude&limit=
// Fırsat akışı: outlierScore'a göre azalan.
export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("unauthorized", 403);
  const sp = req.nextUrl.searchParams;
  const category = sp.get("category") || undefined;
  const minScoreRaw = sp.get("minScore");
  const sinceDaysRaw = sp.get("sinceDays");
  const limitRaw = sp.get("limit");
  const shorts = sp.get("shorts"); // "only" | "exclude" | null

  const minScore = minScoreRaw != null && minScoreRaw !== "" ? Number(minScoreRaw) : undefined;
  const sinceDays = sinceDaysRaw != null && sinceDaysRaw !== "" ? Number(sinceDaysRaw) : undefined;
  const limit = limitRaw != null && limitRaw !== "" ? Number(limitRaw) : undefined;
  const isShort = shorts === "only" ? true : shorts === "exclude" ? false : undefined;

  const videos = await ytVideoRepo.listOpportunities({
    category,
    minScore: Number.isFinite(minScore) ? minScore : undefined,
    sinceDays: Number.isFinite(sinceDays) ? sinceDays : undefined,
    isShort,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return ok({
    configured: isYouTubeConfigured(),
    count: videos.length,
    videos,
  });
}
