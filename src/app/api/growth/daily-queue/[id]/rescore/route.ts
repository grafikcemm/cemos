import { NextRequest, NextResponse } from "next/server";
import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";
import { critiqueDraft } from "@/lib/growth-engine/draft-critic";
import { detectLeaks, conceptKeywordsFrom } from "@/lib/growth-engine/leak-detector";
import { accountProfiles } from "@/lib/accounts";
import { normalizeNextMove } from "@/lib/ai/next-move";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = await req.json();

    const { content } = body;

    const existing = await queueRepo.findById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Queue item not found" }, { status: 404 });
    }

    const account = await accountRepo.findById(existing.accountId);
    if (!account) {
      return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
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

    return NextResponse.json({
      success: true,
      critic: { ...critic, payoff: priorPayoff, leaks },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error during daily queue rescoring.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
