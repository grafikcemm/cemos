import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

// GET /api/repo-radar?status=&minScore=&limit=
// Lists trending GitHub repos (labelled "GitHub Trending"). topics is stored as
// a JSON string; parse on read for callers.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? "active";
  const minScoreRaw = sp.get("minScore");
  const limit = Math.min(Number(sp.get("limit")) || 50, 200);

  const where: Prisma.RepoRadarItemWhereInput = { status };
  if (minScoreRaw && !Number.isNaN(Number(minScoreRaw))) {
    where.xValueScore = { gte: Number(minScoreRaw) };
  }

  try {
    const rows = await prisma.repoRadarItem.findMany({
      where,
      orderBy: [{ xValueScore: "desc" }, { stars: "desc" }],
      take: limit,
    });

    const items = rows.map((r) => ({
      ...r,
      topics: safeParseArray(r.topics),
      label: "GitHub Trending",
    }));

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
