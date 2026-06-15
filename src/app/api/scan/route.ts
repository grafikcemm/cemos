import { NextRequest, NextResponse } from "next/server";
import { scanService } from "@/lib/services/scanService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    channel?: string;
    limit?: number;
  };

  const { channel, limit = 10 } = body;

  if (!channel) {
    return NextResponse.json({ success: false, error: "Gecersiz kanal" }, { status: 400 });
  }

  try {
    const result = await scanService.scanAccount(channel, limit);
    return NextResponse.json({
      success: true,
      channel,
      scannedAt: new Date().toISOString(),
      scanRunId: result.scanRunId,
      sourcesScanned: result.sourcesScanned,
      tweetsFound: result.tweetsFound,
      postsInserted: result.postsInserted,
      duplicatesFound: result.duplicatesFound,
      retweetsSkipped: result.retweetsSkipped,
      estimatedCostUSD: result.estimatedCostUsd.toFixed(4),
      errors: result.errors,
      posts: result.posts,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Tarama hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
