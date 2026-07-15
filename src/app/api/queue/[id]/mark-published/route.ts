import { NextRequest, NextResponse } from "next/server";
import { publishService } from "@/lib/services/publishService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ success: false, error: "id gerekli" }, { status: 400 });

    const { log } = await publishService.markManualPublished(id);
    return NextResponse.json({ success: true, logId: log.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Hata";
    const reasons = (err as { reasons?: { code: string; message: string }[] })?.reasons;
    const status =
      msg === "queue_item_not_found" ? 404
      : msg === "invalid_status" ? 409
      : msg === "edit_required" || msg === "readiness_blocked" ? 422
      : 500;
    const error =
      msg === "readiness_blocked"
        ? "Taslak yayınlanamaz — önce engelleyen sorunları gider."
        : msg === "edit_required"
          ? "Taslak yayına hazır değil — önce düzenle."
          : msg;
    return NextResponse.json({ success: false, error, code: msg, reasons }, { status });
  }
}
