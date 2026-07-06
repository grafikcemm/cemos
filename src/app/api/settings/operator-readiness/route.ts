import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { operatorReadinessService } from "@/lib/services/operatorReadinessService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 403 });
  }
  try {
    const readiness = await operatorReadinessService.getReadiness();
    return NextResponse.json(readiness);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Operator readiness check failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
