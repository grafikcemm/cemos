import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/generated/prisma/client";
import { TOOLBOX_BUCKETS, categoriesForBucket } from "@/lib/toolbox/buckets";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";

// GET /api/toolbox
//   ?counts=1                  -> lightweight per-bucket counts (no row payload)
//   ?bucket=<key>              -> tools in one workflow bucket (lazy-loaded)
//   ?favorite=true             -> favorited tools across all buckets
//   ?search=<q>                -> flat search across all buckets
//   (+ legacy category/platform/useCase/format/reliability/checked filters)
//
// The counts + bucket split is what keeps this off a full 254-row scan on every
// page load — the catalog is fetched group-by-group on demand instead.
export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;

  // Counts mode: one grouped aggregate instead of streaming every row. Powers
  // the collapsed accordion headers (`Tasarım & İlham (68)`).
  if (sp.get("counts") === "1") {
    try {
      const grouped = await prisma.toolboxResource.groupBy({
        by: ["category"],
        where: { isActive: true },
        _count: { _all: true },
      });
      const perCategory = new Map<string, number>(
        grouped.map((g) => [g.category, g._count._all])
      );
      const buckets = TOOLBOX_BUCKETS.map((b) => ({
        key: b.key,
        label: b.label,
        count: b.categories.reduce((sum, c) => sum + (perCategory.get(c) ?? 0), 0),
      }));
      const total = buckets.reduce((sum, b) => sum + b.count, 0);
      const favoritesCount = await prisma.toolboxResource.count({
        where: { isActive: true, isFavorite: true },
      });
      return NextResponse.json({ success: true, buckets, total, favoritesCount });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sunucu hatası";
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
  }

  const bucket = sp.get("bucket");
  const category = sp.get("category");
  const favorite = sp.get("favorite");
  const search = sp.get("search");
  const platform = sp.get("platform");
  const useCase = sp.get("useCase");
  const format = sp.get("format");
  const reliability = sp.get("reliability");
  const checked = sp.get("checked");
  const limit = Math.min(Number(sp.get("limit")) || 100, 300);

  const where: Prisma.ToolboxResourceWhereInput = { isActive: true };
  if (bucket) {
    const cats = categoriesForBucket(bucket);
    // Unknown bucket key -> empty result rather than leaking the whole table.
    where.category = { in: cats ?? [] };
  }
  if (category && category !== "all") where.category = category;
  if (favorite === "true") where.isFavorite = true;
  if (platform && platform !== "all") where.platform = platform;
  if (useCase && useCase !== "all") where.useCase = useCase;
  if (format && format !== "all") where.contentFormat = format;
  if (reliability && reliability !== "all") where.sourceReliability = reliability;
  if (checked && checked !== "all") where.linkStatus = checked;
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { useCase: { contains: search } },
    ];
  }

  try {
    const rows = await prisma.toolboxResource.findMany({
      where,
      orderBy: [{ isFavorite: "desc" }, { xValueScore: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    const items = rows.map((r) => ({ ...r, tags: safeParseArray(r.tags) }));
    return NextResponse.json({ success: true, count: items.length, items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
