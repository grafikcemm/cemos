import { NextRequest, NextResponse } from "next/server";
import { operatorReadinessService } from "@/lib/services/operatorReadinessService";
import { workerService } from "@/lib/services/workerService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    // 1. Initial readiness state check
    const initialRes = await operatorReadinessService.getReadiness();

    // 2. Validate API Keys
    if (!process.env.OPENROUTER_API_KEY || !process.env.SOCIALDATA_API_KEY) {
      return NextResponse.json({
        success: false,
        error: "API Anahtarları eksik! OpenRouter veya SocialData key bulunamadı."
      }, { status: 400 });
    }

    // 3. Validate Budget
    if (initialRes.monthlyBudgetExceeded) {
      return NextResponse.json({
        success: false,
        error: `Aylık bütçe limiti aşıldı! ($${initialRes.totalMonthCost.toFixed(2)} / $${Number(process.env.MONTHLY_AI_BUDGET_USD || "7").toFixed(2)})`
      }, { status: 400 });
    }

    // 4. Run targeted and forced worker scan tick
    const targetHandles = ["grafikcem", "maskulenkod"];
    const scanResult = await workerService.scanTick(new Date(), {
      force: true,
      targetHandles
    });

    if (scanResult && !scanResult.success && scanResult.reason === "locked") {
      return NextResponse.json({
        success: false,
        error: "Kilit hatası: Başka bir tarama işlemi şu an aktif durumda."
      }, { status: 409 });
    }

    // 5. Get final readiness status to return updated count and state
    const finalRes = await operatorReadinessService.getReadiness();

    return NextResponse.json({
      success: true,
      results: (scanResult as any)?.results || [],
      readiness: finalRes
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Operator scan now failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
