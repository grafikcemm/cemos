import { z } from "zod";
import { NEXT_MOVES } from "@/lib/ai/next-move";

// --- NextMove (payoff) — content-quality "path" signal (not a revenue CTA) ---

export const NextMoveSchema = z.enum(NEXT_MOVES);
export type NextMove = z.infer<typeof NextMoveSchema>;

// --- Safe JSON helpers ---

export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "{}";
  } catch {
    return "{}";
  }
}

// --- ViralPattern ---

export const CreateViralPatternSchema = z.object({
  accountId: z.string().min(1, "accountId required"),
  patternName: z.string().min(1, "patternName required"),
  category: z.string().optional(),
  hookType: z.string().optional(),
  structureJson: z.record(z.unknown()).optional(),
  emotion: z.string().optional(),
  viralityTrigger: z.string().optional(),
  exampleGood: z.string().optional(),
  exampleBad: z.string().optional(),
  usageCount: z.number().int().min(0).optional(),
  successScore: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  platform: z.string().optional()
});

export type CreateViralPatternInput = z.infer<typeof CreateViralPatternSchema>;

export const UpdateViralPatternSchema = CreateViralPatternSchema.omit({ accountId: true }).partial();
export type UpdateViralPatternInput = z.infer<typeof UpdateViralPatternSchema>;

// --- TrainingExample ---

export const CreateTrainingExampleSchema = z.object({
  accountId: z.string().min(1, "accountId required"),
  inputType: z.string().min(1, "inputType required"),
  sourceContent: z.string().optional(),
  outputContent: z.string().min(1, "outputContent required"),
  label: z.string().min(1, "label required"),
  reason: z.string().optional(),
  metricsJson: z.record(z.unknown()).optional(),
  embeddingJson: z.array(z.number()).optional(),
  platform: z.string().optional()
});

export type CreateTrainingExampleInput = z.infer<typeof CreateTrainingExampleSchema>;

// --- FeedbackEvent ---

export const CreateFeedbackEventSchema = z.object({
  accountId: z.string().min(1, "accountId required"),
  queueItemId: z.string().optional(),
  sourcePostId: z.string().optional(),
  feedbackType: z.string().min(1, "feedbackType required"),
  originalContent: z.string().optional(),
  editedContent: z.string().optional(),
  reason: z.string().optional(),
  // Normalize edit-distance (0..1) — queryable column; null/undefined = yok.
  editDistance: z.number().nullable().optional(),
  platform: z.string().optional()
});

export type CreateFeedbackEventInput = z.infer<typeof CreateFeedbackEventSchema>;

// --- EvalTest ---

export const CreateEvalTestSchema = z.object({
  accountId: z.string().min(1, "accountId required"),
  testName: z.string().min(1, "testName required"),
  sourceContent: z.string().optional(),
  expectedBehavior: z.string().optional(),
  generatedOutput: z.string().optional(),
  score: z.number().min(0).max(100).optional(),
  failureReason: z.string().optional(),
  platform: z.string().optional(),
  pipelineId: z.string().optional()
});

export type CreateEvalTestInput = z.infer<typeof CreateEvalTestSchema>;

export const UpdateEvalTestSchema = CreateEvalTestSchema.omit({ accountId: true }).partial();
export type UpdateEvalTestInput = z.infer<typeof UpdateEvalTestSchema>;

// --- Pattern Extraction (Sprint 3) ---

export const PatternExtractionSourceType = z.enum(["tweet", "news", "source_post", "manual"]);
export type PatternExtractionSourceType = z.infer<typeof PatternExtractionSourceType>;

export const PatternExtractionInputSchema = z.object({
  text: z.string().min(1, "text is required"),
  accountHandle: z.string().optional(),
  sourceType: PatternExtractionSourceType.optional().default("manual"),
  language: z.enum(["TR", "EN"]).optional().default("TR")
});
export type PatternExtractionInput = z.infer<typeof PatternExtractionInputSchema>;
/** Pre-parse input shape (schema-default fields optional) — for callers that pass raw args before `.parse()`. */
export type PatternExtractionInputRaw = z.input<typeof PatternExtractionInputSchema>;

export const PatternExtractionResultSchema = z.object({
  hook: z.string(),
  mainClaim: z.string(),
  emotionalTrigger: z.string(),
  structure: z.string(),
  tone: z.string(),
  audience: z.string(),
  viralityReason: z.string(),
  suggestedAccounts: z.array(z.string()),
  suggestedPatterns: z.array(z.string()),
  confidence: z.number().min(0).max(100),
  rawJson: z.unknown().optional()
});
export type PatternExtractionResult = z.infer<typeof PatternExtractionResultSchema>;

export const SuggestedPatternSchema = z.object({
  patternName: z.string().min(1),
  accountHandle: z.string().min(1),
  reason: z.string().optional()
});
export type SuggestedPattern = z.infer<typeof SuggestedPatternSchema>;

export type PatternExtractionConfidence = "high" | "medium" | "low";

export function classifyConfidence(score: number): PatternExtractionConfidence {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

// --- Scoring Engine (Sprint 4) ---

export const SourceActionSchema = z.enum(["tweet", "quote", "reply", "ignore"]);
export type SourceAction = z.infer<typeof SourceActionSchema>;

export const SourcePostMetricsSchema = z.object({
  likes: z.number().min(0).optional(),
  reposts: z.number().min(0).optional(),
  replies: z.number().min(0).optional(),
  quotes: z.number().min(0).optional(),
  views: z.number().min(0).optional()
});
export type SourcePostMetrics = z.infer<typeof SourcePostMetricsSchema>;

export const SourcePostScoringInputSchema = z.object({
  content: z.string().min(1, "content is required"),
  targetAccount: z.string().optional(),
  sourceHandle: z.string().optional(),
  sourceType: z.enum(["tweet", "news", "source_post", "manual"]).optional().default("tweet"),
  publishedAt: z.string().optional(),
  metrics: SourcePostMetricsSchema.optional(),
  metadata: z.record(z.unknown()).optional()
});
export type SourcePostScoringInput = z.infer<typeof SourcePostScoringInputSchema>;
/** Pre-parse input shape (schema-default fields optional). */
export type SourcePostScoringInputRaw = z.input<typeof SourcePostScoringInputSchema>;

export const SourcePostScoreSchema = z.object({
  relevanceScore: z.number().min(0).max(100),
  freshnessScore: z.number().min(0).max(100),
  controversyScore: z.number().min(0).max(100),
  audienceFitScore: z.number().min(0).max(100),
  quotePotentialScore: z.number().min(0).max(100),
  replyPotentialScore: z.number().min(0).max(100),
  standaloneTweetScore: z.number().min(0).max(100),
  opportunityScore: z.number().min(0).max(100),
  riskScore: z.number().min(0).max(100),
  suggestedAction: SourceActionSchema,
  reason: z.string(),
  suggestedAccounts: z.array(z.string()),
  confidence: z.number().min(0).max(100)
});
export type SourcePostScore = z.infer<typeof SourcePostScoreSchema>;

export const PublishRecommendationSchema = z.enum(["publish", "rewrite", "reject"]);
export type PublishRecommendation = z.infer<typeof PublishRecommendationSchema>;

export const DraftScoringInputSchema = z.object({
  content: z.string().min(1, "content is required"),
  accountHandle: z.string().min(1, "accountHandle is required"),
  modeId: z.string().optional(),
  sourceContent: z.string().optional(),
  patternName: z.string().optional()
});
export type DraftScoringInput = z.infer<typeof DraftScoringInputSchema>;

export const DraftScoreSchema = z.object({
  personaMatchScore: z.number().min(0).max(100),
  hookStrengthScore: z.number().min(0).max(100),
  clarityScore: z.number().min(0).max(100),
  viralityScore: z.number().min(0).max(100),
  noveltyScore: z.number().min(0).max(100),
  riskScore: z.number().min(0).max(100),
  publishScore: z.number().min(0).max(100),
  publishRecommendation: PublishRecommendationSchema,
  rewriteSuggestion: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(100),
  /** Taslaktan taşınan sonraki hareket (payoff) sinyali — kritik bunu echo'lar. */
  payoff: NextMoveSchema.optional()
});
export type DraftScore = z.infer<typeof DraftScoreSchema>;

// --- Feedback API (Sprint 5) ---

export const FeedbackType = z.enum([
  "approved",
  "rejected",
  "edited",
  "saved_as_pattern",
  "not_my_tone",
  "hook_weak",
  "too_ai",
  "make_stronger",
  "make_clearer"
]);
export type FeedbackType = z.infer<typeof FeedbackType>;

export const TrainingLabel = z.enum([
  "good",
  "bad",
  "edited",
  "published"
]);
export type TrainingLabel = z.infer<typeof TrainingLabel>;

export const FeedbackApiInputSchema = z
  .object({
    // ADR-031: literal z.enum kaldırıldı — otorite processFeedback içindeki
    // DB hesap doğrulamasıdır (fail-closed); şema yalnız şekil doğrular.
    accountHandle: z.string().min(1),
    accountId: z.string().min(1, "accountId required"),
    feedbackType: FeedbackType,
    originalContent: z.string().optional(),
    editedContent: z.string().optional(),
    reason: z.string().optional(),
    queueItemId: z.string().optional(),
    sourcePostId: z.string().optional(),
    sourceContent: z.string().optional(),
    modeId: z.string().optional(),
    saveTrainingExample: z.boolean().optional().default(true),
    saveAsPattern: z.boolean().optional().default(false)
  })
  .refine(
    (data) => {
      const orig = data.originalContent?.trim();
      const edit = data.editedContent?.trim();
      const src = data.sourceContent?.trim();
      return Boolean(orig || edit || src);
    },
    {
      message: "At least one content field (originalContent, editedContent, or sourceContent) must be non-empty",
      path: ["originalContent"]
    }
  );

export type FeedbackApiInput = z.infer<typeof FeedbackApiInputSchema>;

export const FeedbackApiResponseSchema = z.object({
  success: z.boolean(),
  feedbackEventId: z.string().optional(),
  trainingExampleId: z.string().optional(),
  viralPatternId: z.string().optional(),
  draftScore: DraftScoreSchema.optional(),
  patternExtraction: PatternExtractionResultSchema.optional(),
  warnings: z.array(z.string()).optional(),
  error: z.string().optional(),
  details: z.unknown().optional()
});

export type FeedbackApiResponse = z.infer<typeof FeedbackApiResponseSchema>;

// --- Draft Generator (Sprint 10) ---

export const DraftActionTypeSchema = z.enum(["tweet", "quote", "reply"]);
export type DraftActionType = z.infer<typeof DraftActionTypeSchema>;

export const GenerationContextInputSchema = z.object({
  accountHandle: z.string().min(1),
  actionType: DraftActionTypeSchema,
  sourcePostId: z.string().optional(),
  sourceContent: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceHandle: z.string().optional(),
  modeId: z.string().optional(),
  patternId: z.string().optional(),
  patternName: z.string().optional(),
  manualIdea: z.string().optional()
});
export type GenerationContextInput = z.infer<typeof GenerationContextInputSchema>;

export const GenerationContextSchema = z.object({
  accountProfile: z.any(),
  actionType: DraftActionTypeSchema,
  sourceContent: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceHandle: z.string().optional(),
  modeId: z.string().optional(),
  selectedMode: z.any().optional(),
  sourceScore: SourcePostScoreSchema.optional(),
  patternExtraction: PatternExtractionResultSchema.optional(),
  relevantPatterns: z.array(z.object({
    id: z.string().optional(),
    patternName: z.string(),
    hookType: z.string().optional(),
    structureJson: z.string().optional(),
    successScore: z.number().optional(),
    exampleGood: z.string().optional()
  })),
  constraints: z.object({
    maxChars: z.number(),
    forbidden: z.array(z.string()),
    tone: z.string(),
    language: z.string()
  }),
  memoryContext: z.any().optional(), // We'll define MemoryContextSchema below
});
export type GenerationContext = z.infer<typeof GenerationContextSchema>;

export const DraftVariantSchema = z.object({
  id: z.string(),
  content: z.string(),
  angle: z.enum(["safe", "strong", "provocative"]),
  actionType: DraftActionTypeSchema,
  accountHandle: z.string(),
  modeId: z.string().optional(),
  patternUsed: z.string().optional(),
  reasoning: z.string(),
  /** Görsel pillar'larında (örn. grafikcem visual_drop) üretilen image-gen promptu. Görsel üretimi motor dışında. */
  imagePrompt: z.string().optional(),
  /** İçeriğin okuyucuda tetiklediği tek somut sonraki hareket (payoff). */
  payoff: NextMoveSchema.optional()
});
export type DraftVariant = z.infer<typeof DraftVariantSchema>;

export const GenerateDraftsInputSchema = z.object({
  accountHandle: z.string(),
  actionType: DraftActionTypeSchema,
  sourcePostId: z.string().optional(),
  sourceContent: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceHandle: z.string().optional(),
  modeId: z.string().optional(),
  patternId: z.string().optional(),
  patternName: z.string().optional(),
  manualIdea: z.string().optional(),
  count: z.number().optional().default(3)
});
export type GenerateDraftsInput = z.infer<typeof GenerateDraftsInputSchema>;
/** Pre-parse input shape (schema-default fields optional). */
export type GenerateDraftsInputRaw = z.input<typeof GenerateDraftsInputSchema>;

export const GenerateDraftsResultSchema = z.object({
  success: z.boolean(),
  context: GenerationContextSchema,
  drafts: z.array(z.object({
    draft: DraftVariantSchema,
    critic: DraftScoreSchema
  })),
  warnings: z.array(z.string())
});
export type GenerateDraftsResult = z.infer<typeof GenerateDraftsResultSchema>;

export const CritiqueDraftInputSchema = z.object({
  draft: z.union([DraftVariantSchema, z.string()]),
  accountHandle: z.string(),
  sourceContent: z.string().optional(),
  actionType: DraftActionTypeSchema.optional(),
  modeId: z.string().optional()
});
export type CritiqueDraftInput = z.infer<typeof CritiqueDraftInputSchema>;

// --- Weekly Learning Report (Sprint 12) ---

export const LearningReportDateRangeSchema = z.enum([
  "last_7_days",
  "last_30_days",
  "this_week",
  "previous_week",
  "all",
  "custom"
]);
export type LearningReportDateRange = z.infer<typeof LearningReportDateRangeSchema>;

export const WeeklyLearningReportInputSchema = z.object({
  accountHandle: z.enum(["all", "grafikcem", "maskulenkod"]).optional().default("all"),
  dateRange: LearningReportDateRangeSchema.optional().default("last_7_days"),
  from: z.string().optional(),
  to: z.string().optional()
});
export type WeeklyLearningReportInput = z.infer<typeof WeeklyLearningReportInputSchema>;
/** Pre-parse input shape (schema-default fields optional). */
export type WeeklyLearningReportInputRaw = z.input<typeof WeeklyLearningReportInputSchema>;

export const AccountLearningSummarySchema = z.object({
  accountHandle: z.enum(["grafikcem", "maskulenkod"]),
  totalFeedbackEvents: z.number(),
  totalTrainingExamples: z.number(),
  approvedCount: z.number(),
  rejectedCount: z.number(),
  editedCount: z.number(),
  savedPatternCount: z.number(),
  tooAiCount: z.number(),
  notMyToneCount: z.number(),
  hookWeakCount: z.number(),
  averagePublishScore: z.number().nullable(),
  averageRiskScore: z.number().nullable(),
  bestPatternName: z.string().optional(),
  weakestSignal: z.string().optional(),
  recommendation: z.string()
});
export type AccountLearningSummary = z.infer<typeof AccountLearningSummarySchema>;

export const PatternLearningInsightSchema = z.object({
  patternId: z.string().optional(),
  patternName: z.string(),
  accountHandle: z.string(),
  usageCount: z.number(),
  successScore: z.number(),
  averagePublishScore: z.number().nullable().optional(),
  signal: z.enum(["rising", "stable", "weak", "unknown"]),
  reason: z.string()
});
export type PatternLearningInsight = z.infer<typeof PatternLearningInsightSchema>;

export const FeedbackLearningInsightSchema = z.object({
  feedbackType: z.string(),
  count: z.number(),
  accountHandle: z.enum(["all", "grafikcem", "maskulenkod"]).optional().default("all"),
  interpretation: z.string()
});
export type FeedbackLearningInsight = z.infer<typeof FeedbackLearningInsightSchema>;

export const QueueLearningInsightSchema = z.object({
  totalQueueItems: z.number(),
  draftCount: z.number(),
  approvedCount: z.number(),
  rejectedCount: z.number(),
  scheduledCount: z.number(),
  averagePublishScore: z.number().nullable(),
  averageRiskScore: z.number().nullable(),
  highRiskCount: z.number(),
  lowScoreCount: z.number()
});
export type QueueLearningInsight = z.infer<typeof QueueLearningInsightSchema>;

// Faz F — per-platform learning breakdown (x / instagram / youtube).
export const PlatformLearningSectionSchema = z.object({
  platform: z.enum(["x", "instagram", "youtube"]),
  totalFeedbackEvents: z.number(),
  totalTrainingExamples: z.number(),
  totalPatterns: z.number(),
  engagementHigh: z.number(),
  engagementLow: z.number()
});
export type PlatformLearningSection = z.infer<typeof PlatformLearningSectionSchema>;

export const WeeklyLearningReportSchema = z.object({
  success: z.boolean(),
  dateRange: z.object({
    label: z.string(),
    from: z.string().optional(),
    to: z.string().optional()
  }),
  summary: z.object({
    totalFeedbackEvents: z.number(),
    totalTrainingExamples: z.number(),
    totalPatterns: z.number(),
    totalQueueItems: z.number(),
    averagePublishScore: z.number().nullable(),
    averageRiskScore: z.number().nullable(),
    strongestAccount: z.enum(["grafikcem", "maskulenkod"]).optional(),
    weakestAccount: z.enum(["grafikcem", "maskulenkod"]).optional(),
    topRecommendation: z.string()
  }),
  accounts: z.array(AccountLearningSummarySchema),
  topPatterns: z.array(PatternLearningInsightSchema),
  weakPatterns: z.array(PatternLearningInsightSchema),
  feedbackInsights: z.array(FeedbackLearningInsightSchema),
  queueInsight: QueueLearningInsightSchema,
  nextWeekActions: z.array(z.string()),
  warnings: z.array(z.string()),
  platformSections: z.array(PlatformLearningSectionSchema).optional(),
  aiSummary: z.string().optional()
});
export type WeeklyLearningReport = z.infer<typeof WeeklyLearningReportSchema>;

// --- Sprint 13 - Vector Memory / RAG ---

export const MemoryLabelSchema = z.enum(["positive", "negative", "edited", "pattern", "unknown"]);
export type MemoryLabel = z.infer<typeof MemoryLabelSchema>;

export const VectorMemoryInputSchema = z.object({
  // ADR-031: hesap DB'de doğrulanır (searchSimilarExamples accountRepo lookup),
  // literal enum değil.
  accountHandle: z.string().min(1),
  text: z.string().min(1, "text is required"),
  label: MemoryLabelSchema.optional(),
  sourceType: z.enum(["training_example", "feedback_event", "viral_pattern", "queue_item", "manual"]).optional(),
  limit: z.number().int().min(1).optional()
});
export type VectorMemoryInput = z.infer<typeof VectorMemoryInputSchema>;

export const EmbeddingVectorSchema = z.object({
  provider: z.enum(["openrouter", "local_fallback"]),
  model: z.string().optional(),
  dimensions: z.number().int(),
  values: z.array(z.number()),
  createdAt: z.string()
});
export type EmbeddingVector = z.infer<typeof EmbeddingVectorSchema>;

export const MemorySearchResultSchema = z.object({
  id: z.string(),
  accountHandle: z.string(),
  label: MemoryLabelSchema,
  sourceType: z.string(),
  sourceContent: z.string().optional(),
  outputContent: z.string(),
  reason: z.string().optional(),
  similarity: z.number(),
  metadata: z.record(z.unknown()).optional()
});
export type MemorySearchResult = z.infer<typeof MemorySearchResultSchema>;

export const MemoryContextSchema = z.object({
  positiveExamples: z.array(MemorySearchResultSchema),
  negativeExamples: z.array(MemorySearchResultSchema),
  editedExamples: z.array(MemorySearchResultSchema),
  patternExamples: z.array(MemorySearchResultSchema),
  warnings: z.array(z.string())
});
export type MemoryContext = z.infer<typeof MemoryContextSchema>;

export const BuildMemoryContextInputSchema = z.object({
  // ADR-031: hesap DB'de doğrulanır (buildMemoryContext accountRepo lookup),
  // literal enum değil.
  accountHandle: z.string().min(1),
  sourceContent: z.string().optional(),
  manualIdea: z.string().optional(),
  draftContent: z.string().optional(),
  limitPerGroup: z.number().int().min(1).optional()
});
export type BuildMemoryContextInput = z.infer<typeof BuildMemoryContextInputSchema>;


