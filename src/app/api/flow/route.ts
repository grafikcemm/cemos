import { NextRequest, NextResponse } from "next/server";
import { createSourcePosts } from "@/lib/agent/source-engine";
import type { AccountHandle } from "@/lib/accounts";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(request: NextRequest) {
  if (!isOperatorOrCronAuthorized(request)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const account = (body.account ?? "all") as AccountHandle | "all";
  const perAccount = Number(body.perAccount ?? 5);

  return NextResponse.json({
    scannedAt: new Date().toISOString(),
    posts: createSourcePosts(account, perAccount),
  });
}
