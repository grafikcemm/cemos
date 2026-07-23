import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import { executeAgent } from "@/lib/agents/registry";
import type { BenchmarkResult } from "@/lib/ai/prompts";
import {
  HandoffFlowError,
  handoffErrorResponse,
  opportunityHandoffService,
} from "@/lib/services/opportunityHandoffService";

export const dynamic = "force-dynamic";

// POST /api/opportunities/handoff/[id]/generate
// Fırsattan gerçek taslak üretimi — registry Content Creator adapter'ı
// üzerinden (ADR-027/028). Kurallar:
//  - Üretim engelliyse (OpenRouter kredi/bütçe) fırsat KAYBOLMAZ: handoff
//    pending + blockedReason; SAHTE taslak (mock) QueueItem'a YAZILMAZ.
//  - Başarıda QueueItem + handoff-consume TEK transaction; insan onayı korunur
//    (status "new"); otomatik publish YOK.
//  - Retry duplicate üretmez: consumed handoff idempotent mevcut sonucu döner.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  try {
    const handoff = await opportunityHandoffService.getById(id);
    if (!handoff) return fail("Fırsat aktarımı bulunamadı.", 404, { code: "not_found" });
    if (handoff.action !== "generate") {
      return fail("Bu aktarım içerik üretimi için değil.", 422, { code: "invalid_state" });
    }
    if (handoff.status === "consumed") {
      // Idempotent: tekrar tık yeni taslak ÜRETMEZ.
      return ok({ alreadyConsumed: true, queueItemId: handoff.resultQueueItemId });
    }
    if (handoff.status === "cancelled") {
      return fail("Bu aktarım iptal edilmiş — Fırsatlar'dan yeniden başlat.", 409, { code: "cancelled" });
    }

    const account = await prisma.account.findUnique({ where: { id: handoff.accountId } });
    if (!account) return fail("Hesap bulunamadı.", 422, { code: "account_mismatch" });

    // Kaynak tohumu — dış metin; adapter'ın delege ettiği draft-pipeline kendi
    // prompt katmanında untrusted-data çitlemesini uygular.
    const sourceText = [handoff.title, handoff.whyNow, handoff.whyNowDetail, handoff.topicSeed]
      .filter(Boolean)
      .join("\n")
      .slice(0, 8_000);

    const run = await executeAgent<BenchmarkResult>(
      "content-creator",
      { accountHandle: account.handle, sourceText },
      { subjectType: "opportunity_handoff", subjectId: handoff.id, platform: account.platform, accountId: account.id }
    );

    if (run.status === "blocked_external" || run.status === "deterministic_fallback") {
      await opportunityHandoffService.markBlocked(handoff.id, run.blockedReason ?? "generation_blocked");
      return ok({
        blocked: true,
        reason: run.blockedReason ?? "generation_blocked",
        message:
          "Üretim şu an engelli (OpenRouter kredi/bütçe onayı yok). Fırsat kaybolmadı — Entegrasyonlar'dan sağlayıcıyı açınca yeniden dene.",
      });
    }
    if (run.status !== "succeeded" || !run.output) {
      return fail(run.errorMessage ?? "Üretim başarısız oldu — fırsat bekliyor, yeniden deneyebilirsin.", 502, {
        code: "generation_failed",
      });
    }

    const result = run.output;
    if (result.usedMock) {
      // Mock çıktı = gerçek üretim DEĞİL; sahte taslak yazılmaz (dürüst engel).
      await opportunityHandoffService.markBlocked(handoff.id, "generation_mock_fallback");
      return ok({
        blocked: true,
        reason: "generation_mock_fallback",
        message:
          "Model gerçek üretim yapamadı (mock fallback). Sahte taslak oluşturulmadı — sağlayıcı düzelince yeniden dene.",
      });
    }

    // Phase 2D (ADR-033): bu akış EXPLICIT TWEET yazar (kapsam bilinçli dar) —
    // thread kazanan uzun içerik TWEET diye persist EDİLMEZ; thread-dışı en iyi
    // aday seçilir, hiç yoksa dürüst hata (fırsat pending kalır).
    const isThreadCandidate = (c: { mode?: string; threadSegments?: { text: string }[] | null }) =>
      (c.mode ?? "").toLowerCase() === "thread" ||
      (Array.isArray(c.threadSegments) && c.threadSegments.length > 0);
    const winnerIsThread = result.winner ? isThreadCandidate(result.winner) : false;
    const nonThreadAlt = winnerIsThread
      ? (result.rankedCandidates ?? []).find((c) => !isThreadCandidate(c)) ?? null
      : null;
    const chosenScores = nonThreadAlt
      ? {
          personaMatch: nonThreadAlt.accountFit,
          turkishNaturalness: nonThreadAlt.turkishNaturalness,
          hookStrength: nonThreadAlt.hookStrength,
          clarity: Math.round((nonThreadAlt.hookStrength + nonThreadAlt.turkishNaturalness) / 2),
          novelty: nonThreadAlt.noveltyScore ?? 0,
          risk: nonThreadAlt.risk,
          sourceFaithfulness: nonThreadAlt.sourceFaithfulness,
        }
      : {
          personaMatch: result.winner.personaMatch,
          turkishNaturalness: result.winner.turkishNaturalness,
          hookStrength: result.winner.hookStrength,
          clarity: result.winner.clarity,
          novelty: result.winner.novelty,
          risk: result.winner.risk,
          sourceFaithfulness: result.winner.sourceFaithfulness,
        };
    const content = ((winnerIsThread ? nonThreadAlt?.content : result.winner?.content) ?? "").trim();
    if (!content) {
      return fail(
        winnerIsThread
          ? "Üretim yalnız thread adayı döndürdü — bu akış tek tweet yazar; fırsat bekliyor, yeniden dene."
          : "Üretim boş içerik döndürdü — fırsat bekliyor.",
        502,
        { code: "generation_failed" }
      );
    }

    // Atomik: consume claim ÖNCE (yarışı kaybeden QueueItem YAZMAZ — duplicate
    // taslak imkânsız), sonra QueueItem + sonuç referansı. Ağ çağrısı DIŞARIDA.
    const txResult = await prisma.$transaction(async (tx) => {
      const consumed = await opportunityHandoffService.consume(handoff.id, {}, tx as never);
      if (consumed.alreadyConsumed) {
        return { queueItemId: consumed.handoff.resultQueueItemId, alreadyConsumed: true };
      }
      const created = await tx.queueItem.create({
        data: {
          accountId: handoff.accountId,
          content,
          draftType: "TWEET",
          mode: "opportunity",
          status: "new",
          estimatedCostUsd: run.costUsd,
          scores: JSON.stringify({
            fromHandoffId: handoff.id,
            sourceKind: handoff.sourceKind,
            sourceId: handoff.sourceId,
            judged: true,
            personaMatchScore: chosenScores.personaMatch,
            turkishNaturalness: chosenScores.turkishNaturalness,
            hookStrengthScore: chosenScores.hookStrength,
            clarityScore: chosenScores.clarity,
            noveltyScore: chosenScores.novelty,
            riskScore: chosenScores.risk,
            sourceFaithfulness: chosenScores.sourceFaithfulness,
            ...(nonThreadAlt ? { threadSelection: "tweet_intent_skipped_thread_winner" } : {}),
          }),
          candidatesJson: JSON.stringify(result.rankedCandidates ?? []),
        },
      });
      await tx.opportunityHandoff.update({
        where: { id: handoff.id },
        data: { resultQueueItemId: created.id },
      });
      return { queueItemId: created.id, alreadyConsumed: false };
    });

    return ok(txResult, { status: txResult.alreadyConsumed ? 200 : 201 });
  } catch (err) {
    if (err instanceof HandoffFlowError) {
      const r = handoffErrorResponse(err);
      return fail(r.error, r.status, { code: r.code });
    }
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Sunucu hatası", 500);
  }
}
