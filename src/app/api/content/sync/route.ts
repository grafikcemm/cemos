import { NextRequest, NextResponse } from "next/server";
import { syncToCanonical } from "@/lib/content/syncBridge";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { fail } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/content/sync?limit=&deadlineMs=
// Mevcut platform tablolarını kanonik İçerik Zekası havuzuna besler (ingest → baseline
// → outlier → embedding). Idempotent — güvenle tekrar çalışır. Operator/cron-guard'lı.
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const limitPerSource = Number(sp.get("limit")) || 100;
  const deadlineMs = Date.now() + (Number(sp.get("deadlineMs")) || 240_000);
  try {
    const result = await syncToCanonical({ limitPerSource, deadlineMs });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
