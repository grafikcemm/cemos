import { scoreDraft, scoreDraftFallback } from "./scorer";
import type { CritiqueDraftInput, DraftScore, DraftVariant, GenerationContext } from "./types";

export async function critiqueDraft(input: CritiqueDraftInput): Promise<DraftScore> {
  const content = typeof input.draft === "string" ? input.draft : input.draft.content;
  // payoff is a property of the DRAFT (writer); the critic echoes it through.
  const payoff = typeof input.draft === "string" ? undefined : input.draft.payoff;

  try {
    const score = await scoreDraft({
      content,
      accountHandle: input.accountHandle,
      modeId: input.modeId,
      sourceContent: input.sourceContent,
    });
    return { ...normalizeCriticResult(score), payoff };
  } catch (err) {
    return critiqueDraftFallback(input);
  }
}

export function critiqueDraftFallback(input: CritiqueDraftInput): DraftScore {
  const content = typeof input.draft === "string" ? input.draft : input.draft.content;
  const payoff = typeof input.draft === "string" ? undefined : input.draft.payoff;
  const score = scoreDraftFallback({
    content,
    accountHandle: input.accountHandle,
    modeId: input.modeId,
    sourceContent: input.sourceContent,
  });
  return { ...normalizeCriticResult(score), payoff };
}

export async function critiqueDrafts(
  drafts: Array<DraftVariant | string>,
  context: GenerationContext
): Promise<Array<{ draft: DraftVariant; critic: DraftScore }>> {
  const results: Array<{ draft: DraftVariant; critic: DraftScore }> = [];
  
  for (let i = 0; i < drafts.length; i++) {
    const item = drafts[i];
    const draftVariant: DraftVariant = typeof item === "string" ? {
      id: `draft-${Date.now()}-${i}`,
      content: item,
      angle: i === 0 ? "safe" : i === 1 ? "strong" : "provocative",
      actionType: context.actionType,
      accountHandle: context.accountProfile.handle,
      modeId: context.modeId,
      reasoning: "Generated variant by critic flow",
    } : item;

    const critic = await critiqueDraft({
      draft: draftVariant,
      accountHandle: context.accountProfile.handle,
      sourceContent: context.sourceContent,
      actionType: context.actionType,
      modeId: context.modeId,
    });

    results.push({ draft: draftVariant, critic });
  }

  return results;
}

export function buildCriticPrompt(input: CritiqueDraftInput): string {
  const content = typeof input.draft === "string" ? input.draft : input.draft.content;
  return `Değerlendirilecek taslak: "${content}"\nHesap: ${input.accountHandle}\nYayın Türü: ${input.actionType || "tweet"}`;
}

export function normalizeCriticResult(raw: any): DraftScore {
  return {
    personaMatchScore: typeof raw?.personaMatchScore === "number" ? raw.personaMatchScore : 75,
    hookStrengthScore: typeof raw?.hookStrengthScore === "number" ? raw.hookStrengthScore : 75,
    clarityScore: typeof raw?.clarityScore === "number" ? raw.clarityScore : 75,
    viralityScore: typeof raw?.viralityScore === "number" ? raw.viralityScore : 75,
    noveltyScore: typeof raw?.noveltyScore === "number" ? raw.noveltyScore : 75,
    riskScore: typeof raw?.riskScore === "number" ? raw.riskScore : 20,
    publishScore: typeof raw?.publishScore === "number" ? raw.publishScore : 75,
    publishRecommendation: raw?.publishRecommendation === "reject" ? "reject" : raw?.publishRecommendation === "rewrite" ? "rewrite" : "publish",
    rewriteSuggestion: typeof raw?.rewriteSuggestion === "string" ? raw.rewriteSuggestion : "",
    reason: typeof raw?.reason === "string" ? raw.reason : "Validation passed",
    confidence: typeof raw?.confidence === "number" ? raw.confidence : 80,
  };
}
