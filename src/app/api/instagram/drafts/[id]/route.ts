import type { NextRequest } from "next/server";
import { z } from "zod";
import { instagramService } from "@/lib/services/instagramService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

type DraftAction = "sent" | "edited" | "dismissed";

const PatchSchema = z.object({
  action: z.enum(["sent", "edited", "dismissed"]),
  editedText: z.string().max(10_000).optional(),
  reason: z.string().max(2_000).optional(),
});

// PATCH /api/instagram/drafts/[id] { action, editedText?, reason? }
//   Gönderdim → sent (PublishLog + FeedbackEvent approved); Düzenledim → edited; Olmadı → dismissed
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = PatchSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz aksiyon", 400, { detail: parsed.error.flatten() });
  }
  try {
    const draft = await instagramService.recordFeedback(id, parsed.data.action as DraftAction, {
      editedText: parsed.data.editedText,
      reason: parsed.data.reason,
    });
    return ok({ draft });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "draft_not_found") {
      return fail("Bulunamadı", 404);
    }
    return fail(msg, 500);
  }
}
