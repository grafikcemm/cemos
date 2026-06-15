import { NextRequest, NextResponse } from "next/server";
import { instagramService } from "@/lib/services/instagramService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";

type DraftAction = "sent" | "edited" | "dismissed";
const VALID_ACTIONS = new Set<DraftAction>(["sent", "edited", "dismissed"]);

// PATCH /api/instagram/dm-drafts/[id] { action, editedText?, reason? }
//   Gönderdim → sent (PublishLog + FeedbackEvent); Düzenledim → edited; Olmadı → dismissed
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (typeof action !== "string" || !VALID_ACTIONS.has(action as DraftAction)) {
    return NextResponse.json({ success: false, error: "Geçersiz aksiyon" }, { status: 400 });
  }
  try {
    const draft = await instagramService.recordDmFeedback(id, action as DraftAction, {
      editedText: typeof body?.editedText === "string" ? body.editedText : undefined,
      reason: typeof body?.reason === "string" ? body.reason : undefined,
    });
    return NextResponse.json({ success: true, draft });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "draft_not_found") {
      return NextResponse.json({ success: false, error: "Bulunamadı" }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
