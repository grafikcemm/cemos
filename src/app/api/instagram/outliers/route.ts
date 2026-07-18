import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

/**
 * IG rakip outlier feed'i (Sprint 8 — CONTENT-ENGINE §3 "ertesi gün outlier
 * feed'i"). Kaynak: business_discovery sync'inin yazdığı ContentItem +
 * ContentOutlierScore (API'den, scraping asla).
 */
export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const scores = await prisma.contentOutlierScore.findMany({
      where: {
        metric: "engagement",
        // Yalnız provider kaynaklı rakip içeriği — manuel capture'lar feed'e girmez.
        contentItem: { platform: "instagram", sourceType: "external" },
      },
      // insufficient skorlar sona: güvenilir çarpanlar önce.
      orderBy: [{ insufficient: "asc" }, { multiplier: "desc" }],
      take: 30,
      include: {
        contentItem: {
          select: {
            id: true,
            body: true,
            format: true,
            author: true,
            canonicalUrl: true,
            metricsJson: true,
            publishedAt: true,
          },
        },
      },
    });
    const items = scores.map((s) => ({
      contentItemId: s.contentItem.id,
      author: s.contentItem.author,
      format: s.contentItem.format,
      caption: s.contentItem.body.slice(0, 200),
      url: s.contentItem.canonicalUrl,
      publishedAt: s.contentItem.publishedAt,
      metrics: s.contentItem.metricsJson,
      // Yetersiz örneklem / medyan 0 → çarpan güvenilir DEĞİL: null döner.
      multiplier: s.insufficient ? null : s.multiplier,
      insufficient: s.insufficient,
      sampleSize: s.sampleSize,
      computedAt: s.computedAt,
    }));
    return ok({ items });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Outlier feed alınamadı", 500);
  }
}
