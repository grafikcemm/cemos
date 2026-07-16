import type { NextRequest } from "next/server";
import { publishAttemptService } from "@/lib/publish/publishAttemptService";
import { publishErrorResponse } from "@/lib/publish/routeErrors";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";

/**
 * Faz 1E (ADR-025): "X'te aç" hazırlığı. Server-side PublishAttempt(prepared)
 * yaratır ve intent URL'sini döner — pencereyi client kullanıcı gesture'ında
 * açar. Intent = yalnız prepared; yayın durumu/PublishLog/PublishedPost YOK.
 * ready olmayan taslak 422 ile reddedilir (readiness yayın anında yeniden koşar).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const { id } = await params;
    if (!id) return fail("id gerekli", 400);

    const { attempt, intentUrl, reused } = await publishAttemptService.prepareIntent(id);
    return ok({
      attempt: {
        id: attempt.id,
        state: attempt.state,
        contentHash: attempt.contentHash,
        createdAt: attempt.createdAt,
      },
      intentUrl,
      reused,
    });
  } catch (err) {
    const { status, error, code, reasons } = publishErrorResponse(err);
    return fail(error, status, { code, reasons });
  }
}
