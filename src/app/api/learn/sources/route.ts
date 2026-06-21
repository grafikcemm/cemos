import { NextRequest, NextResponse } from "next/server";
import { learnService, InvalidSourceUrlError } from "@/lib/learning/learnService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";

function disabled() {
  return NextResponse.json({ success: false, code: "disabled" }, { status: 404 });
}

// GET /api/learn/sources — dashboard (kaynaklar + sayaçlar).
export async function GET() {
  if (!isLearnEnabled()) return disabled();
  const data = await learnService.dashboard();
  return NextResponse.json({ success: true, ...data });
}

// POST /api/learn/sources { url, manualTranscript? } — kaynak + işleme job'ı yaratır.
export async function POST(req: NextRequest) {
  if (!isLearnEnabled()) return disabled();
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const url = body?.url;
  if (typeof url !== "string" || url.trim() === "") {
    return NextResponse.json({ success: false, error: "url gerekli" }, { status: 400 });
  }
  const manualTranscript =
    typeof body?.manualTranscript === "string" ? body.manualTranscript : undefined;
  try {
    const result = await learnService.createSource({ url, manualTranscript });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof InvalidSourceUrlError) {
      return NextResponse.json({ success: false, code: "invalid_url", error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
