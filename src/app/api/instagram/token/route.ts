import { NextRequest, NextResponse } from "next/server";
import { getTokenHealth, refreshLongLivedToken } from "@/lib/instagram/igClient";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";

// GET /api/instagram/token — token sağlığı (açık okuma; sekme banner'ı)
export async function GET() {
  const health = await getTokenHealth();
  return NextResponse.json({ success: true, ...health });
}

// POST /api/instagram/token — uzun ömürlü token'ı tazele → DB (guard, redeploy'suz)
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const r = await refreshLongLivedToken();
  if (!r.ok) {
    return NextResponse.json({ success: false, error: r.error }, { status: 502 });
  }
  return NextResponse.json({ success: true, ...r.data });
}
