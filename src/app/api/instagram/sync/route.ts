import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import { syncInstagramViaBridge } from "@/lib/instagram/bridgeSyncService";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Manuel READ-ONLY Instagram sync komutu (ADR-032). Generic Composio tool
 * executor DEĞİLDİR — tool/parametre almaz; yalnız bounded own-account sync'ini
 * tetikler (media ≤25, yorum ≤50/medya, insight günde 1). Provider seçimi
 * server-side env sözleşmesiyle yapılır; response secret/ham credential içermez.
 * Mevcut auth sözleşmesi: same-origin operatör VEYA cron secret.
 */
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const result = await syncInstagramViaBridge();
    return ok({ result });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Instagram sync başarısız", 500);
  }
}
