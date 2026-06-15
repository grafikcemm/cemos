import { NextRequest, NextResponse } from "next/server";
import { scheduleService } from "@/lib/services/scheduleService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/queue/[id]">
) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  
  if (!body) {
    return NextResponse.json({ success: false, error: "Geçersiz gövde" }, { status: 400 });
  }

  try {
    if (body.slotKey) {
      const item = await scheduleService.quickSlot(id, body.slotKey);
      return NextResponse.json({ success: true, item });
    }

    if (body.scheduledAt) {
      const scheduledAt = new Date(body.scheduledAt);
      if (isNaN(scheduledAt.getTime())) {
        return NextResponse.json({ success: false, error: "Geçersiz tarih formatı" }, { status: 400 });
      }
      const item = await scheduleService.scheduleDraft(id, scheduledAt);
      return NextResponse.json({ success: true, item });
    }

    return NextResponse.json({ success: false, error: "scheduledAt veya slotKey gerekli" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
