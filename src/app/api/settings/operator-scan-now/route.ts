import type { NextRequest } from "next/server";
import { operatorReadinessService } from "@/lib/services/operatorReadinessService";
import { workerService } from "@/lib/services/workerService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    // 1. Initial readiness state check
    const initialRes = await operatorReadinessService.getReadiness();

    // 2. Validate API Keys
    if (!process.env.OPENROUTER_API_KEY || !process.env.SOCIALDATA_API_KEY) {
      return fail("API Anahtarları eksik! OpenRouter veya SocialData key bulunamadı.", 400);
    }

    // 3. Validate Budget
    if (initialRes.monthlyBudgetExceeded) {
      return fail(
        `Aylık bütçe limiti aşıldı! ($${initialRes.totalMonthCost.toFixed(2)} / $${Number(process.env.MONTHLY_AI_BUDGET_USD || "7").toFixed(2)})`,
        400
      );
    }

    // 4. Run targeted and forced worker scan tick
    // ADR-031: hedef hesaplar DB'den (üretim-hazır liste); literal değil.
    const { listGenerationReadyHandles } = await import("@/lib/accounts/profileRepository");
    const targetHandles = (await listGenerationReadyHandles()).handles;
    const scanResult = await workerService.scanTick(new Date(), {
      force: true,
      targetHandles
    });

    if (scanResult && !scanResult.success && scanResult.reason === "locked") {
      return fail("Kilit hatası: Başka bir tarama işlemi şu an aktif durumda.", 409);
    }

    // 5. Get final readiness status to return updated count and state
    const finalRes = await operatorReadinessService.getReadiness();

    const results = (scanResult as any)?.results || [];
    const draftsCreated = results.reduce((s: number, r: any) => s + (Number(r?.draftsCreated) || 0), 0);
    const draftsBlocked = results.reduce((s: number, r: any) => s + (Number(r?.draftsBlocked) || 0), 0);
    // Honest outcome: a 0-draft run (automation off / no candidates / all
    // quality-blocked) must NOT read as "generated". Surface the count + reason
    // so the UI can say "0 taslak — <reason>" instead of a blanket success toast.
    const firstReason = results
      .map((r: any) => r?.reason)
      .find((x: unknown) => typeof x === "string" && x);
    return ok({
      results,
      readiness: finalRes,
      draftsCreated,
      draftsBlocked,
      reason: draftsCreated > 0 ? "generated" : firstReason || "no_drafts_created",
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const message = err instanceof Error ? err.message : "Operator scan now failed";
    return fail(message, 500);
  }
}
