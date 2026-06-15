import { NextResponse } from "next/server";
import { operatorReadinessService } from "@/lib/services/operatorReadinessService";

export async function GET() {
  try {
    const readiness = await operatorReadinessService.getReadiness();
    return NextResponse.json(readiness);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Operator readiness check failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
