import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/generated/prisma/client";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";

// GET /api/prompt-library?category=&search=&limit=
// Lists the prompt template library (PromptTemplate table).
export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const category = sp.get("category");
  const search = sp.get("search");
  const limit = Math.min(Number(sp.get("limit")) || 200, 500);

  const where: Prisma.PromptTemplateWhereInput = {};
  if (category && category !== "all") where.category = category;
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { promptText: { contains: search } },
      { useCase: { contains: search } },
    ];
  }

  try {
    const rows = await prisma.promptTemplate.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
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
