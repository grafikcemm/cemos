import { NextRequest, NextResponse } from "next/server";
import { creatorRepo } from "@/lib/db/creatorRepo";

export const dynamic = "force-dynamic";

// GET /api/content/outliers?limit=
// Top creator-relative outliers (insufficient-sample ones excluded), explainable.
export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit")) || 50;
  try {
    const rows = await creatorRepo.listTopOutliers(limit);
    const items = rows.map((r) => ({
      ...r,
      explanation: safeParse(r.explanationJson),
    }));
    return NextResponse.json({ success: true, count: items.length, items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
