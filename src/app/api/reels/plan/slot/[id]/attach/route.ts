import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { acquireXactAdvisoryLock } from "@/lib/db/advisoryLock";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { pipelineTraceRepo } from "@/lib/db/pipelineTraceRepo";
import { extractProvenance } from "@/lib/reels/dossierReviewService";
import { getDossierProductionState } from "@/lib/reels/dossierProductionService";

export const dynamic = "force-dynamic";

/**
 * Slot ↔ dossier bağlama (ADR-036 §I → ADR-038 §F) — YALNIZ açık kullanıcı
 * eylemiyle. Sözleşme:
 *  - Cross-account fail-closed (dossier.accountId === plan.accountId).
 *  - Seri slotu: dossier PROVENANCE'ı (PipelineTrace seriesKey) slotun
 *    seriesKey'iyle eşleşmeli — başlık/pillar string tahmini DEĞİL.
 *  - Aynı dossier birden fazla aktif slota bağlanamaz (advisory lock +
 *    in-tx kontrol; yarış → 409).
 *  - İdempotent: aynı dossier aynı slota tekrar → alreadyAttached.
 *  - Bağlama PLANLAMA eylemidir: yanıt `productionReady` + blockers döner —
 *    "slota bağlandı" ASLA "yayına hazır" anlamına gelmez; `drafted` statüsü
 *    yalnız "dossier bağlandı" demektir.
 */

const AttachSchema = z.object({
  accountId: z.string().min(1).max(64),
  dossierId: z.string().min(1).max(64),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id: slotId } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = AttachSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);
  const { accountId, dossierId } = parsed.data;

  try {
    // Provenance READ-ONLY — transaction dışında (seri uyumu gerçek kaynaktan).
    const traces = await pipelineTraceRepo.listBySubject("reel_dossier", dossierId, 5);
    const provenance = extractProvenance(traces.flatMap((t) => t.stages));

    const result = await prisma.$transaction(async (tx) => {
      await acquireXactAdvisoryLock(tx, "slot_attach:" + dossierId);

      const slot = await tx.reelPlanSlot.findUnique({
        where: { id: slotId },
        include: { plan: { select: { accountId: true } } },
      });
      if (!slot) return { fail: { msg: "Slot bulunamadı", status: 404, code: "slot_not_found" } };
      if (slot.plan.accountId !== accountId) {
        return { fail: { msg: "Slot bu hesaba ait değil", status: 422, code: "account_mismatch" } };
      }
      const dossier = await tx.reelDossier.findUnique({
        where: { id: dossierId },
        select: { accountId: true },
      });
      if (!dossier) {
        return { fail: { msg: "Dossier bulunamadı", status: 404, code: "dossier_not_found" } };
      }
      if (dossier.accountId !== slot.plan.accountId) {
        return {
          fail: { msg: "Dossier bu hesaba ait değil", status: 422, code: "dossier_account_mismatch" },
        };
      }

      if (slot.dossierId === dossierId) {
        return { alreadyAttached: true as const };
      }
      if (slot.dossierId) {
        return { fail: { msg: "Slota zaten başka bir dossier bağlı", status: 409, code: "slot_occupied" } };
      }

      // Seri slotu ↔ dossier provenance uyumu (gerçek kaynak, string tahmini değil).
      if (slot.seriesKey && provenance.seriesKey !== slot.seriesKey) {
        return {
          fail: {
            msg: provenance.seriesKey
              ? `Dossier "${provenance.seriesKey}" serisi için üretilmiş; slot "${slot.seriesKey}" serisine ait.`
              : "Bu seri slotuna yalnız o seri için üretilmiş dossier bağlanabilir (dossier'in seri provenance'ı yok).",
            status: 422,
            code: "series_mismatch",
          },
        };
      }

      // Aynı dossier başka bir aktif slota bağlıysa yeni bağlama reddedilir
      // (advisory lock aynı dossier için yarışan attach'leri sıralar).
      const otherSlot = await tx.reelPlanSlot.findFirst({
        where: { dossierId, id: { not: slotId } },
        select: { id: true },
      });
      if (otherSlot) {
        return {
          fail: {
            msg: "Bu dossier zaten başka bir slota bağlı — önce oradan kaldır veya yeni dossier üret.",
            status: 409,
            code: "dossier_already_attached",
          },
        };
      }

      // Atomik claim: yalnız hâlâ boş slot güncellenir (yarış → 409).
      const claimed = await tx.reelPlanSlot.updateMany({
        where: { id: slotId, dossierId: null },
        data: { dossierId, status: "drafted" },
      });
      if (claimed.count === 0) {
        return { fail: { msg: "Slot bu arada bağlandı — yenileyip tekrar dene", status: 409, code: "slot_race" } };
      }
      return { attached: true as const };
    });

    if ("fail" in result && result.fail) {
      return fail(result.fail.msg, result.fail.status, { code: result.fail.code });
    }

    // Bağlama ≠ yayına hazır: güncel production truth açıkça döner.
    const d = await prisma.reelDossier.findUnique({ where: { id: dossierId } });
    const production = d ? await getDossierProductionState(d) : null;
    return ok({
      slotId,
      dossierId,
      alreadyAttached: "alreadyAttached" in result,
      productionReady: production?.productionReady ?? false,
      overall: production?.overall ?? null,
      blockers: production?.blockers ?? [],
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Bağlama başarısız", 500);
  }
}
