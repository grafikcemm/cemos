import { NextRequest, NextResponse } from "next/server";
import { imageService } from "@/lib/services/imageService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

/**
 * POST /api/queue/[id]/generate-image
 *
 * Manual (button-triggered) visual generation for a queued draft — the grafikcem
 * "nokta atışı" path. Never runs automatically. All credit discipline (dedupe,
 * separate fal budget gate, fail-open) lives in imageService.
 *
 * Pass { force: true } to regenerate over an existing image.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/queue/[id]">) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;

    const result = await imageService.generateForQueueItem(id, { force });

    if (result.blocked === "budget") {
      return NextResponse.json(
        { success: false, error: "Aylık fal görsel bütçesi aşıldı.", code: "budget", ...result },
        { status: 402 }
      );
    }

    if (result.blocked === "not_configured") {
      return NextResponse.json(
        {
          success: false,
          error: "Görsel üretimi yapılandırılmamış: FAL_KEY env değişkeni tanımlı değil.",
          code: "not_configured",
          ...result,
        },
        { status: 200 } // fail-open: the prompt-only result is still usable
      );
    }

    return NextResponse.json({
      success: true,
      generatedImageUrl: result.generatedImageUrl,
      imagePrompt: result.imagePrompt,
      reused: result.reused,
      provider: result.provider,
      costUsd: result.costUsd,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    const status = msg === "queue_item_not_found" ? 404 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
