import { NextRequest, NextResponse } from "next/server";
import { getDigestForDate } from "@/lib/news/digest";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { fail } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export const dynamic = "force-dynamic";

// GET /api/daily-digest?date=YYYY-MM-DD
// Defaults to today's Europe/Istanbul calendar day.
export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 403 });
  }
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
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
