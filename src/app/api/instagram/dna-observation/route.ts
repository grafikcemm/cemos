import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { prisma } from "@/lib/db/client";
import { getInstagramDnaObservation } from "@/lib/instagram/dnaObservationService";
import { deriveCaptionDnaValues } from "@/lib/instagram/dnaApplyService";

/**
 * Gözlenen Instagram DNA'sı — read model (Phase 3A §E, ADR-035).
 *
 * GET ?accountId=... → binding sözleşmesi + gözlem + hesabın ONAYLI CaptionDna
 * snapshot'ı. Yanıt, gözlem ile onaylı DNA'yı AÇIKÇA ayırır; gözlem hiçbir
 * yerde "kural" olarak sunulmaz. Yazma yok, LLM yok, raw provider payload yok.
 */
export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const result = await getInstagramDnaObservation();

    // accountId parametresi verilmişse single-IG contract hesabıyla eşleşmeli
    // (cross-account sorgu fail-closed).
    const requestedAccountId = req.nextUrl.searchParams.get("accountId");
    if (
      requestedAccountId &&
      result.account &&
      requestedAccountId !== result.account.id
    ) {
      return fail("accountId bağlı Instagram hesabıyla eşleşmiyor", 422, {
        code: "account_mismatch",
      });
    }

    // Onaylı (insan-sahipli) DNA snapshot'ı — gözlemden ayrı blok.
    let approvedCaptionDna: Record<string, unknown> | null = null;
    if (result.account) {
      const dna = await prisma.captionDna.findUnique({
        where: { accountHandle: result.account.handle },
        select: {
          openingHookTypes: true,
          lengthRange: true,
          emojiPolicy: true,
          lineBreakPattern: true,
          ctaStyle: true,
          provenance: true,
          version: true,
          evidenceCount: true,
          updatedAt: true,
        },
      });
      approvedCaptionDna = dna ?? null;
    }

    return ok({
      status: result.status,
      reason: result.reason,
      account: result.account ?? null,
      binding: result.binding ?? null,
      observation: result.observation ?? null,
      // Gözlemden türetilecek ÖNERİ değerleri (önizleme için; kural değil).
      proposedCaptionDnaValues:
        result.observation && result.observation.sampleSufficiency === "sufficient"
          ? deriveCaptionDnaValues(result.observation)
          : null,
      approved: { captionDna: approvedCaptionDna },
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Gözlem hesaplanamadı", 500);
  }
}
