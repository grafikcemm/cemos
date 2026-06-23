import type { NextRequest } from "next/server";
import { ideaRepo } from "@/lib/db/ideaRepo";
import { queueRepo } from "@/lib/db/queueRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

// POST /api/ideas/[id]/create-draft
// Eden "Create": Idea → Draft (mevcut QueueItem akışına köprü). Hook+outline'dan
// deterministik bir taslak tohumlar; kullanıcı mevcut regenerate ile geliştirir.
// İnsan onayı korunur (status "new"); otomatik publish YOK.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  try {
    const idea = await ideaRepo.getById(id);
    if (!idea) {
      return fail("Bulunamadı", 404);
    }

    const content = [idea.hook, idea.bodyOutline].filter(Boolean).join("\n\n").trim() || idea.title;

    const draft = await queueRepo.create({
      accountId: idea.accountId,
      content,
      draftType: idea.platform === "x" ? "TWEET" : idea.platform.toUpperCase(),
      mode: "idea",
      scores: JSON.stringify({
        fromIdeaId: idea.id,
        angle: idea.angle,
        transformationType: idea.transformationType,
      }),
    });

    await ideaRepo.setStatus(idea.id, "drafted");

    return ok({ draft }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
