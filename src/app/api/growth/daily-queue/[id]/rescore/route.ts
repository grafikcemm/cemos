import type { NextRequest } from "next/server";
import { z } from "zod";
import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";
import { scoreDraftWithAI, scoreDraftFallback } from "@/lib/growth-engine/scorer";
import { detectLeaks, conceptKeywordsFrom } from "@/lib/growth-engine/leak-detector";
import { accountProfiles } from "@/lib/accounts";
import { normalizeNextMove } from "@/lib/ai/next-move";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import { getBudgetStatus, inferAiBudgetClass } from "@/lib/config/costGate";

const RescoreSchema = z.object({
  content: z.string().max(10000).optional(),
});

/**
 * Operatör-tetikli yeniden değerlendirme (Phase 5A / ADR-044). Üretim
 * pipeline'ından FARKI: burada AI bütçesi tükenmişse SESSİZCE heuristik'e düşüp
 * "değerlendirildi" gibi göstermeyiz — dürüst blocked-external (402) veririz. AI
 * gerçekten koştuysa `judged=true`; kısmi blok / sağlayıcı hatasıyla koşmadıysa
 * `degraded=true` (heuristik sonuç, açık etiket). Eski bug düzeltmesi:
 * `telemetry.judged` artık YAZILIR (rescore önce yazmıyordu → judge koşsa bile
 * liste/drawer "judge koşmadı" gösteriyordu) + `judgeModel` dürüst etiketlenir.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const { id } = await params;
    const body = await parseJsonBody(req);
    if (!body.ok) return fail("Geçersiz JSON", 400);

    const parsed = RescoreSchema.safeParse(body.data);
    if (!parsed.success) return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
    const { content } = parsed.data;

    const existing = await queueRepo.findById(id);
    if (!existing) return fail("Queue item not found", 404);

    const account = await accountRepo.findById(existing.accountId);
    if (!account) return fail("Account not found", 404);

    const textToScore = content || existing.editedContent || existing.content;

    // AI değerlendirme bütçesi tamamen tükendiyse dürüst blocked-external ver
    // (sessizce heuristik'e düşüp "değerlendirildi" GÖSTERMEYİZ). getBudgetStatus
    // fırlatmaz — pre-check niyet-belirleyicidir; kesin gate scoreDraftWithAI içinde.
    const budget = await getBudgetStatus({
      budgetClass: inferAiBudgetClass("judge_draft_score"),
    });
    if (!budget.allowed) {
      return fail(
        "AI değerlendirme bütçesi tükendi — yeniden değerlendirilemedi. Kredi eklenince tekrar deneyebilirsin.",
        402,
        { code: "budget", reason: budget.reason },
      );
    }

    // AI judge dene. non-null = gerçekten AI değerlendirdi (judged). null = koşmadı
    // (kısmi bütçe / sağlayıcı hatası; scoreDraftWithAI içte yutar) → dürüst degraded
    // heuristik. Not: scoreDraftWithAI ASLA fırlatmaz (içte catch→null).
    const aiScore = await scoreDraftWithAI({
      content: textToScore,
      accountHandle: account.handle,
      modeId: existing.mode,
    });
    const judged = aiScore !== null;
    const critic =
      aiScore ??
      scoreDraftFallback({
        content: textToScore,
        accountHandle: account.handle,
        modeId: existing.mode,
      });

    // payoff'u koru (string taslak yeniden türetemez); leak'leri taze critic
    // skoruna karşı yeniden hesapla.
    let priorPayoff = "none";
    try {
      const prev = existing.scores ? JSON.parse(existing.scores) : {};
      priorPayoff = normalizeNextMove(prev?.payoff);
    } catch {}

    const profile = accountProfiles[account.handle as keyof typeof accountProfiles];
    const leaks = detectLeaks({
      content: textToScore,
      mode: existing.mode,
      payoff: normalizeNextMove(priorPayoff),
      hookStrength: critic.hookStrengthScore,
      knownPillars: profile ? profile.modes.map((m) => m.id) : [],
      conceptKeywords: profile ? conceptKeywordsFrom(profile.concept) : [],
      requireConcreteAnchor: account.handle === "grafikcem",
    });

    // telemetry.judged'i YAZ (eski bug: rescore telemetry yazmıyordu) + judgeModel'i
    // dürüst etiketle (AI koştu ↔ heuristik). Liste route'u `telemetry?.judged` +
    // `judgeModel` okur → drawer artık doğru "judged"/"heuristik" gösterir.
    const scoresJson = JSON.stringify({
      ...critic,
      payoff: priorPayoff,
      leaks,
      telemetry: { judged },
      judgeModel: judged ? "ai" : "heuristic",
    });
    await queueRepo.update(id, {
      scores: scoresJson,
      // İçerik açıkça gönderildiyse (düzenlenmiş) editedContent'i de güncelle.
      editedContent: content ? content.trim() : undefined,
    });

    return ok({
      critic: { ...critic, payoff: priorPayoff, leaks },
      judged,
      degraded: !judged,
    });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg =
      err instanceof Error ? err.message : "Unexpected system error during daily queue rescoring.";
    return fail(msg, 500);
  }
}
