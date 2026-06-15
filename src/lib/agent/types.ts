import type { AccountHandle } from "@/lib/accounts";
import type { DraftScore } from "@/lib/ai/prompts";

export type SourcePost = {
  id: string;
  account: AccountHandle;
  sourceHandle: string;
  sourceName: string;
  sourceCategory: string;
  sourceLanguage: string;
  sourceText: string;
  publishedAgo: string;
  suggestedAction: "tweet" | "reply" | "quote" | "ignore";
  opportunityScore: number;
  relevanceScore: number;
  freshnessScore: number;
  controversyScore: number;
  riskScore: number;
  status: "new" | "used" | "rejected";
};

export type QueueItem = {
  id: string;
  account: AccountHandle;
  sourcePostId: string;
  content: string;
  mode: string;
  status: "review" | "scheduled" | "published" | "rejected";
  scheduledAt?: string;
  scores: DraftScore;
  createdAt: string;
  estimatedCostUsd: number;
  usedMock: boolean;
};
