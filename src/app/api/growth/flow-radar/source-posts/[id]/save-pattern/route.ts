import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { processFeedback } from "@/lib/growth-engine/feedback-service";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";
import { budgetErrorResponse } from "@/lib/utils/budgetErrorResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const { id } = await params;

    // 1. Fetch post details
    const post = await prisma.sourcePost.findUnique({
      where: { id },
      include: {
        account: true,
      },
    });

    if (!post) {
      return fail("Gönderi bulunamadı", 404);
    }

    // Phase 5A (ADR-044) idempotency: gönderi zaten "used" ise desen çıkarımı TEKRAR
    // KOŞMAZ — ikinci ücretli extractPattern + duplicate ViralPattern üretilmez.
    if (post.status === "used") {
      return ok({
        alreadySaved: true,
        message: "Bu gönderi zaten desen olarak kaydedildi.",
      });
    }

    // ATOMİK claim ücretli çağrıdan ÖNCE: iki hızlı tık / eşzamanlı sekme yarışında
    // yalnız BİRİ used'a çevirebilir → ücretli extractPattern + duplicate
    // ViralPattern/TrainingExample TAM BİR KEZ koşar. Eski check-then-act (önce oku
    // → ücretli işle → sonra used yaz) her iki isteği de kapıdan geçirip çift
    // OpenRouter harcaması yaptırıyordu.
    const priorStatus = post.status;
    const claim = await prisma.sourcePost.updateMany({
      where: { id, status: { not: "used" } },
      data: { status: "used" },
    });
    if (claim.count === 0) {
      return ok({
        alreadySaved: true,
        message: "Bu gönderi zaten desen olarak kaydedildi.",
      });
    }

    try {
      // 2. Trigger Feedback API process to extract & save pattern + training example
      const result = await processFeedback({
        accountHandle: post.account.handle as any,
        accountId: post.accountId,
        feedbackType: "saved_as_pattern",
        originalContent: post.text,
        sourcePostId: post.id,
        sourceContent: post.text,
        saveTrainingExample: true,
        saveAsPattern: true,
      });

      // processFeedback extraction hatasını warnings'e yutar ve success:true döner;
      // desen gerçekten yazılmadıysa (viralPatternId yok) bu bir başarı DEĞİL —
      // claim'i geri al ki gönderi "used"da kilitli kalmasın. Warning metni ham
      // sağlayıcı hatası taşıyabilir → istemciye geçirilmez, sabit mesaj döner.
      // NOT: feedback-service'in deterministik idempotency kapısı (FeedbackEvent
      // extraction'dan önce yazılır) aynı içerik için retry'da extraction'ı yeniden
      // KOŞMAZ — mesaj bu yüzden retriability vaat etmez; resume semantiği PR-B işi.
      if (!result.viralPatternId) {
        await prisma.sourcePost
          .updateMany({ where: { id, status: "used" }, data: { status: priorStatus } })
          .catch(() => {});
        return fail(
          "Desen çıkarımı başarısız oldu; gönderi kaydedilmedi.",
          502,
          { code: "pattern_extraction_failed" },
        );
      }

      return ok({
        feedbackResult: result,
        message: "Pattern başarıyla kaydedildi ve gönderi used olarak işaretlendi.",
      });
    } catch (inner) {
      // Ücretli işlem başarısız → claim'i GERİ AL (post kaybolmasın; operatör tekrar
      // deneyebilsin), sonra normal hata yoluna (budget/redakte) devret.
      await prisma.sourcePost
        .updateMany({ where: { id, status: "used" }, data: { status: priorStatus } })
        .catch(() => {});
      throw inner;
    }
  } catch (err) {
    const budgetRes = budgetErrorResponse(err);
    if (budgetRes) return budgetRes;
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return fail(msg, 500);
  }
}
