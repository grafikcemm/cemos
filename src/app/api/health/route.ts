import { NextResponse } from "next/server";
import { healthService } from "@/lib/services/healthService";
import { healthContractService } from "@/lib/health/healthContractService";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const deep = searchParams.get("deep") === "true";
    const health = await healthService.getHealth({ deep });
    // Faz 1F (ADR-026): üç sözleşme (infrastructure / pipelineFreshness /
    // todayReadiness + topbar sinyali) — additive alan; bölüm-bazlı fail-soft,
    // sözleşme montajı düşerse eski düz payload yine döner.
    const contracts = await healthContractService.getContracts(health).catch(() => null);
    return NextResponse.json({ ...health, contracts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sağlık durumu kontrol edilemedi";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
