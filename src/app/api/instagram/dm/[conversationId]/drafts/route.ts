import type { NextRequest } from "next/server";
import { igDmDraftRepo } from "@/lib/db/igDmDraftRepo";
import { instagramService } from "@/lib/services/instagramService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/instagram/dm/[conversationId]/drafts — bu konuşmanın taslakları
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await ctx.params;
  const drafts = await igDmDraftRepo.listByConversation(conversationId);
  return ok({ drafts });
}

// POST /api/instagram/dm/[conversationId]/drafts — bağlam-farkında taslak üret (guard)
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ conversationId: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { conversationId } = await ctx.params;
  try {
    const result = await instagramService.generateDmDrafts({ conversationId });
    return ok({
      drafts: result.drafts,
      riskWarning: result.riskWarning,
    });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "error";
    const msg = err instanceof Error ? err.message : String(err);
    const status = code === "budget" ? 402 : 500;
    return fail(msg, status, { code });
  }
}
