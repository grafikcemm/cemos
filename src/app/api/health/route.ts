import { NextResponse } from "next/server";
import { healthService } from "@/lib/services/healthService";
import { healthContractService } from "@/lib/health/healthContractService";
import { fail } from "@/lib/utils/apiResponse";
import {
  isDbUnavailableError,
  DB_UNAVAILABLE_MESSAGE,
} from "@/lib/db/dbUnavailableError";
import { recordDbFailure, getDbCircuitState } from "@/lib/db/dbCircuit";

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
    // WP-01: health, DB-down'da 200 + degraded contract döner — 503/500 DÖNMEZ
    // (yoksa istemci health'i de "başarısız istek" sayar ve retry döngüsü health'in
    // kendisini fırtınaya çevirir). healthService probe'u bu sınıfı normalde içeride
    // yakalar; buraya düşmesi probe DIŞI bir yolun (ör. contracts öncesi) atmasıdır.
    if (isDbUnavailableError(err)) {
      recordDbFailure();
      return NextResponse.json({
        degraded: true,
        dbCircuit: getDbCircuitState(),
        generatedAt: new Date().toISOString(),
        database: { ok: false, message: DB_UNAVAILABLE_MESSAGE },
        contracts: null,
      });
    }
    const message = err instanceof Error ? err.message : "Sağlık durumu kontrol edilemedi";
    return fail(message, 500);
  }
}
