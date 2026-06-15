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
    const status =
      msg === "queue_item_not_found" ? 404
      : msg === "invalid_status" ? 409
      : msg === "edit_required" ? 422
      : 500;
    const error = msg === "edit_required"
      ? "AI çıktısını kendi sesinle düzenlemeden yayınlayamazsın."
      : msg;
    return NextResponse.json({ success: false, error, code: msg }, { status });
  }
}
