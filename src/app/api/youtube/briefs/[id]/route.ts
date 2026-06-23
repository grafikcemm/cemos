import type { NextRequest } from "next/server";
import { z } from "zod";
import { ytBriefRepo } from "@/lib/db/ytBriefRepo";
import { youtubeService } from "@/lib/services/youtubeService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  status: z.enum(["draft", "liked", "edited", "recorded", "dismissed"]),
  editedScript: z.string().max(50_000).optional(),
  feedbackNote: z.string().max(10_000).optional(),
});

// GET /api/youtube/briefs/[id] — tek brief.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const brief = await ytBriefRepo.getById(id);
  if (!brief) {
    return fail("Bulunamadı", 404);
  }
  return ok({ brief });
}

// PATCH /api/youtube/briefs/[id] { status, editedScript?, feedbackNote? }
//   durum → FeedbackEvent (platform:"youtube"); "recorded" → PublishLog.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = PatchSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz durum", 400, { detail: parsed.error.flatten() });
  }
  try {
    const brief = await youtubeService.recordFeedback(id, parsed.data.status, {
      editedScript: parsed.data.editedScript,
      feedbackNote: parsed.data.feedbackNote,
    });
    return ok({ brief });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "brief_not_found") {
      return fail("Bulunamadı", 404);
    }
    return fail(msg, 500);
  }
}
