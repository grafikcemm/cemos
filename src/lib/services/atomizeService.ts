/**
 * Atomize service (Faz C) — the article's "one idea should not die after one
 * post." When a strong signal produces a winning draft, we spawn a linked
 * content PACKAGE: the winner becomes `main`, and the next-best ranked
 * candidates (already generated, so NO extra LLM spend) become sibling assets
 * (thread / quote_bait / reply_angle) sharing one packageId. Each sibling
 * carries the same payoff + leak signals as the main path.
 */

import { queueRepo } from "@/lib/db/queueRepo";
import { accountProfiles } from "@/lib/accounts";
import { detectLeaks, conceptKeywordsFrom } from "@/lib/growth-engine/leak-detector";
import { normalizeNextMove } from "@/lib/ai/next-move";
import type { RankedCandidate } from "@/lib/ai/prompts";
import type { QueueItem } from "@/generated/prisma/client";

/** Sibling roles assigned in rank order after the winner. */
const PACKAGE_ROLES = ["thread", "quote_bait", "reply_angle"] as const;

export type AtomizeInput = {
  accountHandle: string;
  /** Already-created winning draft — becomes packageRole "main". */
  mainQueueItem: QueueItem;
  /** Ranked candidates from the pipeline (candidates[0] is the winner). */
  candidates: RankedCandidate[];
  /** Whether the judge produced trustworthy hook scores. */
  judged: boolean;
  maxSiblings?: number;
};

export type AtomizeResult = { packageId: string; created: number };

export const atomizeService = {
  /**
   * Link the winner + distinct sibling candidates into one package.
   * Reuses the main item's id as the packageId (stable + unique).
   * Fail-soft: callers should treat a throw as "no package, keep the main draft".
   */
  async atomizePackage(input: AtomizeInput): Promise<AtomizeResult> {
    const { accountHandle, mainQueueItem } = input;
    const profile = accountProfiles[accountHandle as keyof typeof accountProfiles];
    const knownPillars = profile ? profile.modes.map((m) => m.id) : [];
    const conceptKeywords = profile ? conceptKeywordsFrom(profile.concept) : [];
    const requireConcreteAnchor = accountHandle === "grafikcem";

    const packageId = mainQueueItem.id;
    await queueRepo.update(mainQueueItem.id, { packageId, packageRole: "main" });

    const maxSiblings = input.maxSiblings ?? 2;
    const mainContent = mainQueueItem.content.trim();
    const seen = new Set<string>([mainContent]);

    const siblings = input.candidates
      .slice(1)
      .map((c) => ({ ...c, content: (c.content ?? "").trim() }))
      .filter((c) => {
        if (c.content.length === 0 || seen.has(c.content)) return false;
        seen.add(c.content);
        return true;
      })
      .slice(0, maxSiblings);

    let created = 0;
    for (let i = 0; i < siblings.length; i++) {
      const c = siblings[i];
      const role = PACKAGE_ROLES[i] ?? "variant";
      const payoff = normalizeNextMove(c.payoff);
      const leaks = detectLeaks({
        content: c.content,
        mode: c.mode,
        payoff,
        hookStrength: input.judged && c.hookStrength > 0 ? c.hookStrength : undefined,
        knownPillars,
        conceptKeywords,
        requireConcreteAnchor,
      });

      await queueRepo.create({
        accountId: mainQueueItem.accountId,
        sourcePostId: mainQueueItem.sourcePostId ?? undefined,
        content: c.content,
        draftType: mainQueueItem.draftType,
        mode: c.mode || mainQueueItem.mode,
        estimatedCostUsd: 0, // reused candidate — no new LLM spend
        usedMock: false,
        packageId,
        packageRole: role,
        scores: JSON.stringify({
          content: c.content,
          mode: c.mode,
          personaMatch: c.accountFit,
          hookStrength: c.hookStrength,
          viralPotential: c.viralPotential,
          risk: c.risk,
          verdict: c.verdict,
          reason: c.reason,
          payoff,
          leaks,
        }),
      });
      created++;
    }

    return { packageId, created };
  },
};
