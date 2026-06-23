import type { NextRequest } from "next/server";
import { z } from "zod";
import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";
import { critiqueDraft } from "@/lib/growth-engine/draft-critic";
import { detectLeaks, conceptKeywordsFrom } from "@/lib/growth-engine/leak-detector";
import { accountProfiles } from "@/lib/accounts";
import { normalizeNextMove } from "@/lib/ai/next-move";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

const RescoreSchema = z.object({
  content: z.string().max(10000).optional(),
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

    const parsed = RescoreSchema.safeParse(body.data);
    if (!parsed.success) return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });

    const { content } = parsed.data;

    const existing = await queueRepo.findById(id);
    if (!existing) {
      return fail("Queue item not found", 404);
    }

    const account = await accountRepo.findById(existing.accountId);
    if (!account) {
      return fail("Account not found", 404);
    }

    const textToScore = content || existing.editedContent || existing.content;

    // Critique the content
    const critic = await critiqueDraft({
      draft: textToScore,
      accountHandle: account.handle,
      modeId: existing.mode,
    });

    // ── Faz B: preserve the writer's payoff (a string draft can't re-derive it)
    //    and recompute content-quality leaks against the fresh critic score. ──
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

    // Update scores JSON field with critic + carried payoff + recomputed leaks.
    const scoresJsonString = JSON.stringify({ ...critic, payoff: priorPayoff, leaks });
    await queueRepo.update(id, {
      scores: scoresJsonString,
      // If content was explicitly sent (edited content), update editedContent too
      editedContent: content ? content.trim() : undefined,
    });

    return ok({
      critic: { ...critic, payoff: priorPayoff, leaks },
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const msg = err instanceof Error ? err.message : "Unexpected system error during daily queue rescoring.";
    return fail(msg, 500);
  }
}
