import type { AccountHandle } from "@/lib/accounts";

export type SourceType = "x" | "reddit" | "youtube" | "rss";

/**
 * The örn1 unified content shape. Every connector normalizes its platform
 * payload into this so discovery, ranking, pre-filter and storage are
 * platform-agnostic downstream.
 */
export interface NormalizedItem {
  sourceType: SourceType;
  /** Raw platform id (tweet id, reddit post id, youtube video id, rss guid). */
  externalId: string;
  /** Title + body, plain text, trimmed. */
  text: string;
  url: string;
  /** Original author handle / channel title / subreddit / feed name. */
  author?: string;
  lang?: string;
  /** Platform-normalized engagement (likes+rt, ups, views...). 0 if unknown. */
  engagementScore: number;
  /** örn1 source weighting used for cross-platform ranking. */
  sourceWeight: number;
  publishedAt?: Date;
}

export interface SourceConnector {
  readonly type: SourceType;
  /** True when the connector has the credentials/config it needs to run. */
  isConfigured(): boolean;
  /**
   * Fetch candidate items for one account. MUST be fail-open: return [] on any
   * error or when unconfigured, never throw — one provider must not abort the
   * whole discovery run.
   */
  fetchForAccount(handle: AccountHandle, limit: number): Promise<NormalizedItem[]>;
}
