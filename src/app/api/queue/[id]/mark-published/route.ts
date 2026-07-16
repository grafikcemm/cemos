import type { NextRequest } from "next/server";
import { publishAttemptService } from "@/lib/publish/publishAttemptService";
import { publishErrorResponse } from "@/lib/publish/routeErrors";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";

/**
 * Faz 1E (ADR-025): manuel "Paylaşıldı" onayı — publish state machine üzerinden.
 * prepared intent attempt ŞART (yoksa 422 "hazırlık bulunamadı"); contentHash
 * güncel metinle eşleşmeli; tüm yayın yazımları tek transaction; tekrarlanan
 * onay idempotent (duplicate PublishLog/PublishedPost/UsageLog yok).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const { id } = await params;
    if (!id) return fail("id gerekli", 400);

    const result = await publishAttemptService.confirmManualPublish(id);
    return ok({
      alreadyPublished: result.alreadyPublished,
      logId: result.log?.id ?? null,
      attemptId: result.attempt.id,
      generatedImageUrl: result.generatedImageUrl,
    });
  } catch (err) {
    const { status, error, code, reasons } = publishErrorResponse(err);
    return fail(error, status, { code, reasons });
  }
}
