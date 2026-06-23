import type { NextRequest } from "next/server";
import { igReplyDraftRepo } from "@/lib/db/igReplyDraftRepo";
import { instagramService } from "@/lib/services/instagramService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/instagram/comments/[id]/drafts — bu yorumun taslakları
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const drafts = await igReplyDraftRepo.listByComment(id);
  return ok({ drafts });
}

// POST /api/instagram/comments/[id]/drafts — yanıt taslağı üret (guard)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  try {
    const result = await instagramService.generateReplyDrafts({ commentId: id });
    const first = result.results[0];
    return ok({
      drafts: first?.drafts ?? [],
      riskWarning: first?.riskWarning ?? false,
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
