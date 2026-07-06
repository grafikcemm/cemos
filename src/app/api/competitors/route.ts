import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { competitorGroups } from "@/lib/competitors";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 403 });
  }
  return NextResponse.json({ competitors: competitorGroups });
}
