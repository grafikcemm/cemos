import type { NextRequest } from "next/server";
import { imageService } from "@/lib/services/imageService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { budgetErrorResponse } from "@/lib/utils/budgetErrorResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

/**
 * POST /api/queue/[id]/generate-image
 *
 * Manual (button-triggered) visual generation for a queued draft — the grafikcem
 * "nokta atışı" path. Never runs automatically. All credit discipline (dedupe,
 * separate fal budget gate, fail-open) lives in imageService.
 *
 * Pass { force: true } to regenerate over an existing image.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;

  const body = await parseJsonBody<{ force?: boolean }>(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);

  try {
    const force = body.data?.force === true;

    const result = await imageService.generateForQueueItem(id, { force });

    if (result.blocked === "budget") {
      return fail("Aylık fal görsel bütçesi aşıldı.", 402, { code: "budget", ...result });
    }

    if (result.blocked === "not_configured") {
      // fail-open: the prompt-only result is still usable
      return fail(
        "Görsel üretimi yapılandırılmamış: FAL_KEY env değişkeni tanımlı değil.",
        200,
        { code: "not_configured", ...result }
      );
    }

    return ok({
      generatedImageUrl: result.generatedImageUrl,
      imagePrompt: result.imagePrompt,
      reused: result.reused,
      provider: result.provider,
      costUsd: result.costUsd,
    });
  } catch (err) {
    const budgetRes = budgetErrorResponse(err);
    if (budgetRes) return budgetRes;
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    const status = msg === "queue_item_not_found" ? 404 : 500;
    return fail(msg, status);
  }
}
