import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { draftService } from "@/lib/services/draftService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

const bodySchema = z.object({
  account: z.enum(["grafikcem", "maskulenkod"]),
  mode: z.string().optional(),
  draftType: z.string().optional(),
});

// POST /api/news-pool/[id]/generate-draft
// THE bridge: turn a NewsItem into an X draft for the chosen account and push
// it onto the daily queue. The news item becomes the grounding source.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Geçersiz istek (account gerekli)" }, { status: 400 });
  }

  try {
    const news = await prisma.newsItem.findUnique({ where: { id } });
    if (!news) {
      return NextResponse.json({ success: false, error: "Haber bulunamadı" }, { status: 404 });
    }

    // Raw/failed items have no translation or score — drafting from them would
    // feed the LLM noisy English input. Process the pool first.
    if (news.processingStatus !== "analyzed") {
      return NextResponse.json(
        {
          success: false,
          code: "not_analyzed",
          error: "Haber henüz işlenmedi (çeviri/analiz bekleniyor). Önce 'Tümünü İşle' çalıştırın.",
        },
        { status: 409 }
      );
    }

    // Compose grounding text from the translated/scored news fields.
    const grounding = [
      news.trTitle || news.originalTitle,
      news.trSummary || news.originalSummary || "",
      news.whyPeopleCare ? `Neden önemli: ${news.whyPeopleCare}` : "",
      news.tweetAngle ? `Açı: ${news.tweetAngle}` : "",
      news.url,
    ]
      .filter(Boolean)
      .join("\n");

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
      return NextResponse.json({ success: false, blocked: true, reason: result.reason }, { status: 200 });
    }

    // Mark the news item as used so it drops out of the "to action" pool.
    await prisma.newsItem.update({ where: { id }, data: { isUsed: true } });

    return NextResponse.json({ success: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
