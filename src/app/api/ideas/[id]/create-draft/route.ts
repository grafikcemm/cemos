import type { NextRequest } from "next/server";
import { ideaRepo } from "@/lib/db/ideaRepo";
import { queueRepo } from "@/lib/db/queueRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export const dynamic = "force-dynamic";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

// POST /api/ideas/[id]/create-draft
// Eden "Create": Idea → Draft (mevcut QueueItem akışına köprü). Hook+outline'dan
// deterministik bir taslak tohumlar; kullanıcı mevcut regenerate ile geliştirir.
// İnsan onayı korunur (status "new"); otomatik publish YOK.
// ADR-045: originKey="idea:{ideaId}" NULL-distinct unique → çift-tık/retry
// pre-check + P2002 backstop mevcut taslağı döner (duplicate queue item YOK).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  try {
    const idea = await ideaRepo.getById(id);
    if (!idea) {
      return fail("Bulunamadı", 404);
    }

    const originKey = `idea:${idea.id}`;
    const existing = await queueRepo.findByOriginKey(originKey);
    if (existing) return ok({ draft: existing, reused: true }, { status: 200 });

    const content = [idea.hook, idea.bodyOutline].filter(Boolean).join("\n\n").trim() || idea.title;

    let draft;
    try {
      draft = await queueRepo.create({
        accountId: idea.accountId,
        content,
        draftType: idea.platform === "x" ? "TWEET" : idea.platform.toUpperCase(),
        mode: "idea",
        originKey,
        scores: JSON.stringify({
          fromIdeaId: idea.id,
          angle: idea.angle,
          transformationType: idea.transformationType,
        }),
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const raced = await queueRepo.findByOriginKey(originKey);
        if (raced) return ok({ draft: raced, reused: true }, { status: 200 });
      }
      throw err;
    }

    await ideaRepo.setStatus(idea.id, "drafted");

    return ok({ draft, reused: false }, { status: 201 });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
