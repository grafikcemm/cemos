import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { draftService } from "@/lib/services/draftService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";
import { composeNewsGrounding } from "@/lib/news/draftBridge";

const bodySchema = z.object({
  account: z.enum(["grafikcem", "maskulenkod"]),
  mode: z.string().optional(),
  draftType: z.string().optional(),
});

// POST /api/news-pool/[id]/generate-draft
// THE bridge: turn a NewsItem into an X draft for the chosen account and push
// it onto the daily queue. The news item becomes the grounding source.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz istek (account gerekli)", 400);
  }

  try {
    const news = await prisma.newsItem.findUnique({ where: { id } });
    if (!news) {
      return fail("Haber bulunamadı", 404);
    }

    // Raw/failed items have no translation or score — drafting from them would
    // feed the LLM noisy English input. Process the pool first.
    if (news.processingStatus !== "analyzed") {
      return fail(
        "Haber henüz işlenmedi (çeviri/analiz bekleniyor). Önce 'Tümünü İşle' çalıştırın.",
        409,
        { code: "not_analyzed" }
      );
    }

    // Compose grounding text from the translated/scored news fields.
    const grounding = composeNewsGrounding(news);

    const result = await draftService.generateDraft({
      accountHandle: parsed.data.account,
      sourceTweet: grounding,
      sourceHandle: news.newsSourceId ?? "news",
      draftType: parsed.data.draftType ?? "TWEET",
      mode: parsed.data.mode ?? (news.suggestedFormat || undefined),
      newsItemId: news.id,
      imageUrl: news.imageUrl ?? undefined,
    });

    if (result.blocked) {
      return fail("blocked", 200, { blocked: true, reason: result.reason });
    }

    // Mark the news item as used so it drops out of the "to action" pool.
    await prisma.newsItem.update({ where: { id }, data: { isUsed: true } });

    return ok({ result });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
