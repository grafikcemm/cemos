import { NextRequest, NextResponse } from "next/server";
import { instagramService } from "@/lib/services/instagramService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/instagram/drafts { bulk:true } — öncelikli (≥60) yorumlara toplu taslak (guard)
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const result = await instagramService.generateReplyDrafts({ bulk: true });
    return NextResponse.json({ success: true, generated: result.generated });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "error";
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, code, error: msg }, { status: code === "budget" ? 402 : 500 });
  }
}
