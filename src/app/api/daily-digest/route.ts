import { NextRequest, NextResponse } from "next/server";
import { getDigestForDate } from "@/lib/news/digest";

export const dynamic = "force-dynamic";

// GET /api/daily-digest?date=YYYY-MM-DD
// Defaults to today's Europe/Istanbul calendar day.
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? undefined;

  try {
    const digest = await getDigestForDate(date);
    if (!digest) {
      return NextResponse.json(
        { success: true, digest: null, message: "Bu güne ait digest henüz yok" },
        { status: 200 }
      );
    }
    return NextResponse.json({ success: true, digest });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
