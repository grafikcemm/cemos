import type { NextRequest } from "next/server";
import { z } from "zod";
import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

const SendToQueueSchema = z.object({
  content: z.string().max(10000).optional(),
  accountHandle: z.string().max(100).optional(),
  modeId: z.string().max(100).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const { id } = await params;
    const body = await parseJsonBody(req);
    if (!body.ok) return fail("Geçersiz JSON", 400);

    const parsed = SendToQueueSchema.safeParse(body.data);
    if (!parsed.success) return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });

    const { content, accountHandle, modeId } = parsed.data;

    if (content && accountHandle) {
      const account = await accountRepo.findByHandle(accountHandle);
      if (!account) {
        return fail("Account not found", 404);
      }

      const validSourceId = id && id !== "none" && id !== "undefined" ? id : undefined;
      // Idempotency (Phase 5B pattern): aynı kaynak-postunu iki kez "Kuyruğa At"
      // DUPLICATE taslak üretmesin (kart re-render'ında post hâlâ enabled kalıyordu).
      // originKey NULL-distinct unique + ön-kontrol + P2002 yarış backstop'u.
      const originKey = validSourceId ? `sourcepost-queue:${validSourceId}` : undefined;
      if (originKey) {
        const existing = await queueRepo.findByOriginKey(originKey);
        if (existing) {
          return ok({ queueItemId: existing.id, idempotent: true, message: "Bu kaynak zaten sıraya eklendi." });
        }
      }

      try {
        const queueItem = await queueRepo.create({
          accountId: account.id,
          sourcePostId: validSourceId,
          content,
          draftType: "TWEET",
          mode: modeId || "ai_news",
          estimatedCostUsd: 0.001,
          // This is REAL content (a verbatim competitor source post, or an
          // operator-edited AI draft) — never a fabricated mock. Mislabelling it
          // usedMock:true inverts the field's contract for any future analytics
          // built on it.
          usedMock: false,
          scores: "{}",
          originKey,
        });

        return ok({
          queueItemId: queueItem.id,
          message: "Taslak başarıyla sıraya (Queue) eklendi.",
        });
      } catch (e) {
        // Yarış: iki eşzamanlı istek ön-kontrolü aynı anda geçti → P2002; mevcut
        // satırı döndür (idempotent), duplicate FIRLATMA.
        if (
          originKey &&
          e &&
          typeof e === "object" &&
          "code" in e &&
          (e as { code?: string }).code === "P2002"
        ) {
          const existing = await queueRepo.findByOriginKey(originKey);
          if (existing) {
            return ok({ queueItemId: existing.id, idempotent: true, message: "Bu kaynak zaten sıraya eklendi." });
          }
        }
        throw e;
      }
    }

    return ok({
      placeholder: true,
      message: "Draft Generator Sprint 10’da aktif olacak.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return fail(msg, 500);
  }
}
