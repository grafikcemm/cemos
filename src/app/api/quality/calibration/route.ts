import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { buildCalibrationStatus } from "@/lib/services/calibrationStatus";

export const dynamic = "force-dynamic";

/**
 * GET /api/quality/calibration — ADR-046 dürüst kalite-kalibrasyon durumu.
 * Deterministik read model; "kalibre edildi" yalanı söylemez.
 */
export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const status = await buildCalibrationStatus();
    return ok({ status });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Kalibrasyon durumu alınamadı", 500);
  }
}
