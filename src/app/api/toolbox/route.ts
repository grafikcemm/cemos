import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

// GET /api/toolbox?category=&favorite=&search=&platform=&useCase=&format=&reliability=&checked=&limit=
// Lists curated tools/resources from the ToolboxResource table.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
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
