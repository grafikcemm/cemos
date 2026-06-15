import {
  validateAccountHandle,
} from "@/lib/growth-engine/account-profiles";
import {
  extractPattern,
  patternExtractionToViralPatternInput,
} from "@/lib/growth-engine/pattern-extractor";
import { scoreDraft } from "@/lib/growth-engine/scorer";
import { feedbackEventRepo } from "@/lib/db/feedbackEventRepo";
import { trainingExampleRepo } from "@/lib/db/trainingExampleRepo";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
import { embedTrainingExample } from "@/lib/growth-engine/vector-memory";
import {
  FeedbackApiInputSchema,
  type FeedbackApiInput,
  type FeedbackApiResponse,
  type FeedbackType,
  type TrainingLabel,
  type DraftScore,
  type PatternExtractionResult,
} from "@/lib/growth-engine/types";

/**
 * Maps FeedbackType to TrainingLabel.
 */
export function feedbackToTrainingLabel(feedbackType: FeedbackType): TrainingLabel {
  switch (feedbackType) {
    case "approved":
      return "good";
    case "saved_as_pattern":
      return "good";
    case "edited":
    case "make_stronger":
    case "make_clearer":
      return "edited";
    case "rejected":
    case "not_my_tone":
    case "hook_weak":
    case "too_ai":
      return "bad";
    default:
      return "good";
  }
}

/**
 * Determines whether we should create a training example for this feedback event.
 */
export function shouldCreateTrainingExample(input: FeedbackApiInput): boolean {
  if (input.saveTrainingExample === false) {
    return false;
  }
  const type = input.feedbackType;
  const hasEditedContent = typeof input.editedContent === "string" && input.editedContent.trim().length > 0;
  
  return (
    type === "approved" ||
    type === "rejected" ||
    type === "edited" ||
    type === "saved_as_pattern" ||
    hasEditedContent
  );
}

/**
 * Determines whether we should save this feedback event as a viral pattern.
 */
export function shouldSaveAsPattern(input: FeedbackApiInput): boolean {
  return input.saveAsPattern === true || input.feedbackType === "saved_as_pattern";
}

/**
 * Builds the database-level input for a FeedbackEvent.
 */
export function buildFeedbackEventInput(input: FeedbackApiInput) {
  const originalContent =
    input.originalContent?.trim() ||
    input.editedContent?.trim() ||
    input.sourceContent?.trim() ||
    "";

  return {
    accountId: input.accountId,
    queueItemId: input.queueItemId,
    sourcePostId: input.sourcePostId,
    feedbackType: input.feedbackType,
    originalContent,
    editedContent: input.editedContent ?? "",
    reason: input.reason ?? "",
  };
}

/**
 * Builds the database-level input for a TrainingExample.
 */
export function buildTrainingExampleFromFeedback(
  input: FeedbackApiInput,
  score?: DraftScore
) {
  const label = feedbackToTrainingLabel(input.feedbackType);
  const outputContent = input.editedContent?.trim() || input.originalContent?.trim() || "";
  
  const metricsJson: Record<string, unknown> = {};
  if (score) {
    metricsJson.draftScore = score;
  }

  return {
    accountId: input.accountId,
    inputType: input.modeId || "tweet_draft",
    sourceContent: input.sourceContent || "",
    outputContent,
    label,
    reason: input.reason ?? "",
    metricsJson,
  };
}

/**
 * Processes feedback by creating feedback event, training example, and viral pattern as required.
 */
export async function processFeedback(rawInput: unknown): Promise<FeedbackApiResponse> {
  const warnings: string[] = [];

  // 1. Zod validation
  const input = FeedbackApiInputSchema.parse(rawInput);

  // 2. Account handle validation
  if (!validateAccountHandle(input.accountHandle)) {
    throw new Error(`Invalid accountHandle: ${input.accountHandle}`);
  }

  // 3. Ensure content exists
  const hasContent = Boolean(
    input.originalContent?.trim() ||
    input.editedContent?.trim() ||
    input.sourceContent?.trim()
  );
  if (!hasContent) {
    throw new Error("No content provided in feedback input");
  }

  // 4. Create FeedbackEvent (Mandatory)
  const feedbackInput = buildFeedbackEventInput(input);
  const feedbackEvent = await feedbackEventRepo.create(feedbackInput);

  // 5. scoreDraft (Optional)
  let draftScore: DraftScore | undefined;
  if (input.feedbackType === "approved" || input.feedbackType === "edited") {
    try {
      draftScore = await scoreDraft({
        content: input.editedContent || input.originalContent || "",
        accountHandle: input.accountHandle,
        modeId: input.modeId,
        sourceContent: input.sourceContent,
      });
    } catch (err) {
      warnings.push(`Scoring failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  // 6. Create TrainingExample (Optional)
  let trainingExampleId: string | undefined;
  if (shouldCreateTrainingExample(input)) {
    try {
      const trainingInput = buildTrainingExampleFromFeedback(input, draftScore);
      const trainingExample = await trainingExampleRepo.create(trainingInput);
      trainingExampleId = trainingExample.id;
      // Close the learning loop: embed so this example becomes searchable in
      // vector memory and improves future grounded generation. Best-effort.
      await embedTrainingExample(trainingExample.id).catch(() => {});
    } catch (err) {
      warnings.push(`Failed to save training example: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  // 7. Create ViralPattern (Optional)
  let viralPatternId: string | undefined;
  let patternExtraction: PatternExtractionResult | undefined;
  if (shouldSaveAsPattern(input)) {
    try {
      patternExtraction = await extractPattern({
        text: input.editedContent || input.originalContent || input.sourceContent || "",
        accountHandle: input.accountHandle,
        sourceType: "manual",
        language: "TR",
      });

      const viralInput = patternExtractionToViralPatternInput(patternExtraction, input.accountId);
      const createdPattern = await viralPatternRepo.create(viralInput);
      viralPatternId = createdPattern.id;
    } catch (err) {
      warnings.push(`Pattern extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return {
    success: true,
    feedbackEventId: feedbackEvent.id,
    trainingExampleId,
    viralPatternId,
    draftScore,
    patternExtraction,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
