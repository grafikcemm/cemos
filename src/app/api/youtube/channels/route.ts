import { NextRequest, NextResponse } from "next/server";
import { ytChannelRepo } from "@/lib/db/ytChannelRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { isYouTubeConfigured, isYtCategory } from "@/lib/youtube/ytConfig";

export const dynamic = "force-dynamic";

// GET /api/youtube/channels — rakipler + keşif onay kuyruğu.
export async function GET() {
  const [competitors, suggestions] = await Promise.all([
    ytChannelRepo.listAll(),
    ytChannelRepo.listSuggestions(),
  ]);
  return NextResponse.json({
    success: true,
    configured: isYouTubeConfigured(),
    competitors,
    suggestions,
  });
}

// POST /api/youtube/channels — öneri onayla (enabled) ya da kategori düzelt.
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const channelId = body?.channelId;
  if (typeof channelId !== "string" || channelId === "") {
    return NextResponse.json({ success: false, error: "channelId gerekli" }, { status: 400 });
  }
  try {
    if (body?.action === "setCategory") {
      if (typeof body?.category !== "string" || !isYtCategory(body.category)) {
        return NextResponse.json({ success: false, error: "Geçersiz kategori" }, { status: 400 });
      }
      const channel = await ytChannelRepo.updateCategory(channelId, body.category);
      return NextResponse.json({ success: true, channel });
    }
    const enabled = typeof body?.enabled === "boolean" ? body.enabled : true;
    const channel = await ytChannelRepo.setEnabled(channelId, enabled);
    return NextResponse.json({ success: true, channel });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
