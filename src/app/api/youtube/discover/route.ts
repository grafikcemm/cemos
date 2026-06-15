import { NextRequest, NextResponse } from "next/server";
import { runDiscovery } from "@/lib/youtube/discovery";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

// Manuel kanal keşfi (search.list 100u/sorgu). Sadece operatör/cron; öneriler enabled:false.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const queries = Array.isArray(body?.queries)
    ? body.queries.filter((q: unknown): q is string => typeof q === "string")
    : undefined;
  const cap = typeof body?.cap === "number" ? body.cap : undefined;
  try {
    const result = await runDiscovery({ queries, cap });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
