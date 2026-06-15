import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

// GET /api/content-radar?account=&status=&limit=
// Lists derived ContentOpportunity rows (per-account targeting).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const accountHandle = sp.get("account");
  const status = sp.get("status");
  const limit = Math.min(Number(sp.get("limit")) || 50, 200);

  const where: Prisma.ContentOpportunityWhereInput = {};
  if (status) where.status = status;
  if (accountHandle) where.account = { handle: accountHandle };

  try {
    const items = await prisma.contentOpportunity.findMany({
      where,
      orderBy: [{ xValueScore: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        account: { select: { handle: true } },
        newsItem: { select: { url: true, trTitle: true, originalTitle: true } },
      },
    });
    return NextResponse.json({ success: true, count: items.length, items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
