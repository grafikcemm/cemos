import { z } from "zod";

/**
 * Instagram read-provider sözleşmesi (ADR-032). Ham provider yanıtları
 * UI/servis katmanına SIZMAZ — her provider bu normalize Zod tiplerine map
 * eder. İki implementasyon: ComposioInstagramReadProvider (birincil, MCP) ve
 * MetaGraphInstagramReadProvider (mevcut direct Meta, fallback — SİLİNMEDİ).
 */

export const IgProfileSchema = z.object({
  igUserId: z.string().default(""),
  username: z.string().default(""),
  name: z.string().default(""),
  followersCount: z.number().default(0),
  mediaCount: z.number().default(0),
});
export type IgProfile = z.infer<typeof IgProfileSchema>;

export const IgMediaItemSchema = z.object({
  mediaId: z.string().min(1),
  caption: z.string().default(""),
  mediaType: z.string().default(""),
  mediaProductType: z.string().default(""),
  permalink: z.string().default(""),
  timestamp: z.string().default(""),
  likeCount: z.number().default(0),
  commentsCount: z.number().default(0),
});
export type IgMediaItem = z.infer<typeof IgMediaItemSchema>;

export const IgCommentItemSchema = z.object({
  commentId: z.string().min(1),
  mediaId: z.string().default(""),
  parentCommentId: z.string().nullable().default(null),
  username: z.string().default(""),
  text: z.string().default(""),
  timestamp: z.string().default(""),
});
export type IgCommentItem = z.infer<typeof IgCommentItemSchema>;

export const IgMediaInsightsSchema = z.object({
  mediaId: z.string(),
  reach: z.number().default(0),
  views: z.number().default(0),
  likes: z.number().default(0),
  comments: z.number().default(0),
  saves: z.number().default(0),
  shares: z.number().default(0),
});
export type IgMediaInsights = z.infer<typeof IgMediaInsightsSchema>;

export const IgAccountInsightsSchema = z.object({
  reach: z.number().default(0),
  views: z.number().default(0),
  accountsEngaged: z.number().default(0),
  likes: z.number().default(0),
  comments: z.number().default(0),
  saves: z.number().default(0),
  shares: z.number().default(0),
  followersCount: z.number().default(0),
});
export type IgAccountInsights = z.infer<typeof IgAccountInsightsSchema>;

export type ProviderHealth = {
  healthy: boolean;
  /** "connected" | "degraded" | "blocked" | "unconfigured" */
  connectionState: string;
  errorClass?: string;
  detail?: string;
};

export type InstagramProviderId = "composio" | "meta";

/**
 * Read-only sözleşme. Yazma/DM metodu YOKTUR ve eklenemez — testler interface
 * yüzeyini kilitler.
 */
export type InstagramReadProvider = {
  readonly id: InstagramProviderId;
  healthCheck(): Promise<ProviderHealth>;
  getOwnProfile(): Promise<IgProfile>;
  listOwnMedia(opts?: { limit?: number }): Promise<IgMediaItem[]>;
  getMediaInsights(mediaId: string): Promise<IgMediaInsights | null>;
  getAccountInsights(): Promise<IgAccountInsights | null>;
  listMediaComments(mediaId: string, opts?: { limit?: number }): Promise<IgCommentItem[]>;
};

export class InstagramProviderError extends Error {
  readonly provider: InstagramProviderId;
  readonly errorClass: string;
  constructor(provider: InstagramProviderId, errorClass: string, message: string) {
    super(message);
    this.name = "InstagramProviderError";
    this.provider = provider;
    this.errorClass = errorClass;
  }
}

/** Ortak sınırlar — her iki provider da uyar. */
export const MEDIA_FETCH_MAX = 25;
export const COMMENTS_PER_MEDIA_MAX = 50;
