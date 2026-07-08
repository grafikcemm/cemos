import {
  getGenerationProfile,
  getDefaultGenerationMode,
  isKnownAccountHandle as validateAccountHandle,
} from "./account-adapter";
import { sourcePostRepo } from "../db/sourcePostRepo";
import { viralPatternRepo } from "../db/viralPatternRepo";
import { accountRepo } from "../db/accountRepo";
import { scoreSourcePostFallback } from "./scorer";
import { extractPatternSyncFallback } from "./pattern-extractor";
import { buildMemoryContext } from "./vector-memory";
import type {
  GenerationContextInput,
  GenerationContext,
  SourcePostScore
} from "./types";

export async function buildGenerationContext(
  input: GenerationContextInput
): Promise<GenerationContext> {
  const accountHandle = input.accountHandle;
  if (!validateAccountHandle(accountHandle)) {
    throw new Error(`Invalid account handle: ${accountHandle}`);
  }

  const accountProfile = getGenerationProfile(accountHandle);
  const modeId = input.modeId || getDefaultGenerationMode(accountHandle).id;
  const selectedMode = accountProfile.modes.find((m) => m.id === modeId);

  // Resolve DB Account for patterns
  const dbAccount = await accountRepo.findByHandle(accountHandle);
  const accountId = dbAccount?.id;

  let sourceContent = input.sourceContent || input.manualIdea;
  let sourceUrl = input.sourceUrl;
  const sourceHandle = input.sourceHandle;
  let sourceScore: SourcePostScore | undefined;
  let patternExtraction: any;

  if (input.sourcePostId) {
    const sourcePost = await sourcePostRepo.findById(input.sourcePostId);
    if (sourcePost) {
      if (!sourceContent) {
        sourceContent = sourcePost.text;
      }
      if (!sourceUrl) {
        sourceUrl = sourcePost.url;
      }
      sourceScore = scoreSourcePostFallback({
        content: sourceContent || "",
        targetAccount: accountHandle,
        sourceHandle: sourceHandle || "unknown",
        sourceType: "tweet",
        publishedAt: sourcePost.publishedAt?.toISOString(),
        metrics: {
          likes: sourcePost.likeCount,
          reposts: sourcePost.retweetCount,
          views: sourcePost.viewCount,
        }
      });
      
      patternExtraction = extractPatternSyncFallback({
        text: sourceContent || "",
        accountHandle,
        sourceType: "source_post",
        language: "TR",
      });
    }
  }

  if (!sourceContent) {
    throw new Error("No source content or manual idea provided.");
  }

  if (sourceContent && !patternExtraction) {
    patternExtraction = extractPatternSyncFallback({
      text: sourceContent,
      accountHandle,
      sourceType: "manual",
      language: "TR",
    });
  }

  // Get relevant patterns from db
  let relevantPatterns: any[] = [];
  if (accountId) {
    relevantPatterns = await getRelevantPatterns(accountId, 5);
  }

  // Handle manual pattern selection override
  if (input.patternId || input.patternName) {
    let p = null;
    if (input.patternId) {
      p = await viralPatternRepo.findById(input.patternId);
    }
    if (p) {
      relevantPatterns = [
        {
          id: p.id,
          patternName: p.patternName,
          hookType: p.hookType || "",
          structureJson: p.structureJson ? JSON.stringify(p.structureJson) : "{}",
          successScore: p.successScore || 0,
          exampleGood: p.exampleGood || "",
        },
        ...relevantPatterns.filter((item) => item.id !== p!.id)
      ];
    } else if (input.patternName) {
      relevantPatterns = [
        {
          patternName: input.patternName,
          hookType: "",
          structureJson: "{}",
          successScore: 80,
          exampleGood: "",
        },
        ...relevantPatterns
      ];
    }
  }

  let memoryContext: any = undefined;
  if (sourceContent || input.manualIdea) {
    try {
      memoryContext = await buildMemoryContext({
        accountHandle,
        sourceContent,
        manualIdea: input.manualIdea,
      });
    } catch (err) {
      memoryContext = {
        positiveExamples: [],
        negativeExamples: [],
        editedExamples: [],
        patternExamples: [],
        warnings: ["Memory context unavailable due to an unexpected error"],
      };
    }
  }

  const constraints = {
    maxChars: accountProfile.maxChars || 280,
    forbidden: accountProfile.forbidden || [],
    tone: accountProfile.tone,
    language: "Turkish",
  };

  return {
    accountProfile,
    actionType: input.actionType,
    sourceContent,
    sourceUrl,
    sourceHandle,
    modeId,
    selectedMode,
    sourceScore,
    patternExtraction,
    relevantPatterns,
    constraints,
    memoryContext,
  };
}

export function buildGenerationContextFallback(
  input: GenerationContextInput
): GenerationContext {
  const accountHandle = input.accountHandle;
  let accountProfile = {
    handle: accountHandle,
    displayName: accountHandle === "grafikcem" ? "GrafikCem" : "MaskulenKod",
    persona: accountHandle === "grafikcem" ? "Bilge Editör" : "Maskülen Ayna",
    maxChars: 280,
    forbidden: [],
    tone: "sade",
    modes: [{ id: "fallback", label: "Fallback", instruction: "Write simple" }],
  } as any;

  try {
    if (validateAccountHandle(accountHandle)) {
      accountProfile = getGenerationProfile(accountHandle);
    }
  } catch {}

  const sourceContent = input.sourceContent || input.manualIdea || "";
  
  return {
    accountProfile,
    actionType: input.actionType,
    sourceContent,
    sourceUrl: input.sourceUrl,
    sourceHandle: input.sourceHandle,
    modeId: input.modeId || "fallback",
    selectedMode: accountProfile.modes?.[0],
    relevantPatterns: [],
    constraints: {
      maxChars: accountProfile.maxChars || 280,
      forbidden: accountProfile.forbidden || [],
      tone: accountProfile.tone || "sade",
      language: "Turkish",
    },
  };
}

export async function getRelevantPatterns(
  accountIdOrHandle: string,
  limit = 5
): Promise<Array<any>> {
  let accountId = accountIdOrHandle;
  if (["grafikcem", "maskulenkod"].includes(accountIdOrHandle)) {
    const acc = await accountRepo.findByHandle(accountIdOrHandle);
    if (!acc) return [];
    accountId = acc.id;
  }

  try {
    const list = await viralPatternRepo.listByAccount(accountId, true);
    return list.slice(0, limit).map((p) => ({
      id: p.id,
      patternName: p.patternName,
      hookType: p.hookType || "",
      structureJson: p.structureJson ? JSON.stringify(p.structureJson) : "{}",
      successScore: p.successScore || 0,
      exampleGood: p.exampleGood || "",
    }));
  } catch {
    return [];
  }
}

export function resolveSourceContent(input: GenerationContextInput): string {
  const content = input.sourceContent || input.manualIdea;
  if (content && content.trim().length > 0) {
    return content.trim();
  }
  if (input.sourcePostId) {
    return "source-post-placeholder";
  }
  throw new Error("No source content or manual idea provided.");
}
