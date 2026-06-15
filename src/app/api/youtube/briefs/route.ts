import { NextRequest, NextResponse } from "next/server";
import { youtubeService } from "@/lib/services/youtubeService";
import { ytBriefRepo } from "@/lib/db/ytBriefRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { BudgetExceededError } from "@/lib/config/costGate";
import { YtBriefDailyLimitError } from "@/lib/youtube/brief-generator";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// GET /api/youtube/briefs?videoId= — bir videonun briefleri.
export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ success: false, error: "videoId gerekli" }, { status: 400 });
  }
  const briefs = await ytBriefRepo.listByVideo(videoId);
  return NextResponse.json({ success: true, briefs });
}

// POST /api/youtube/briefs { videoId } — on-demand 5-aşama brief üretimi (bütçe gate'li).
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const videoId = body?.videoId;
  if (typeof videoId !== "string" || videoId === "") {
    return NextResponse.json({ success: false, error: "videoId gerekli" }, { status: 400 });
  }
  try {
    const result = await youtubeService.briefForVideo(videoId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return NextResponse.json(
        { success: false, code: "budget", error: err.message },
        { status: 429 }
      );
    }
    if (err instanceof YtBriefDailyLimitError) {
      return NextResponse.json(
        { success: false, code: "daily_limit", error: err.message },
        { status: 429 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "video_not_found") {
      return NextResponse.json({ success: false, code: "not_found", error: msg }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
