import type { NextRequest } from "next/server";
import { z } from "zod";
import { youtubeService } from "@/lib/services/youtubeService";
import { ytBriefRepo } from "@/lib/db/ytBriefRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { budgetErrorResponse } from "@/lib/utils/budgetErrorResponse";
import { YtBriefDailyLimitError } from "@/lib/youtube/brief-generator";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const PostSchema = z.object({
  videoId: z.string().min(1),
});

// GET /api/youtube/briefs?videoId= — bir videonun briefleri.
export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return fail("videoId gerekli", 400);
  }
  const briefs = await ytBriefRepo.listByVideo(videoId);
  return ok({ briefs });
}

// POST /api/youtube/briefs { videoId } — on-demand 5-aşama brief üretimi (bütçe gate'li).
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = PostSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("videoId gerekli", 400, { detail: parsed.error.flatten() });
  }
  try {
    const result = await youtubeService.briefForVideo(parsed.data.videoId);
    return ok({ ...result });
  } catch (err) {
    const budgetRes = budgetErrorResponse(err);
    if (budgetRes) return budgetRes;
    if (err instanceof YtBriefDailyLimitError) {
      return fail(err.message, 429, { code: "daily_limit" });
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "video_not_found") {
      return fail(msg, 404, { code: "not_found" });
    }
    return fail(msg, 500);
  }
}
