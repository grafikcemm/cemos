import { NextRequest, NextResponse } from "next/server";
import { ytBriefRepo } from "@/lib/db/ytBriefRepo";
import { youtubeService } from "@/lib/services/youtubeService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set(["draft", "liked", "edited", "recorded", "dismissed"]);

// GET /api/youtube/briefs/[id] — tek brief.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const brief = await ytBriefRepo.getById(id);
  if (!brief) {
    return NextResponse.json({ success: false, error: "Bulunamadı" }, { status: 404 });
  }
  return NextResponse.json({ success: true, brief });
}

// PATCH /api/youtube/briefs/[id] { status, editedScript?, feedbackNote? }
//   durum → FeedbackEvent (platform:"youtube"); "recorded" → PublishLog.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (typeof status !== "string" || !VALID_STATUS.has(status)) {
    return NextResponse.json({ success: false, error: "Geçersiz durum" }, { status: 400 });
  }
  try {
    const brief = await youtubeService.recordFeedback(id, status, {
      editedScript: typeof body?.editedScript === "string" ? body.editedScript : undefined,
      feedbackNote: typeof body?.feedbackNote === "string" ? body.feedbackNote : undefined,
    });
    return NextResponse.json({ success: true, brief });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "brief_not_found") {
      return NextResponse.json({ success: false, error: "Bulunamadı" }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
