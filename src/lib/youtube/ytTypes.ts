/**
 * YouTube Fırsat Motoru — paylaşılan tipler (Faz C).
 * Saf TS: I/O yok. ytClient/outlier/brief-generator/youtubeService ortak kullanır.
 */

export type YtCategory = "ai_haber" | "kodlama" | "ai_tips" | "tasarim" | "yasam" | "global";

/** Data API channels.list'ten parse edilen ham kanal. */
export type YtChannelRaw = {
  channelId: string;
  title: string;
  subscriberCount: number;
  videoCount: number;
  viewCountTotal: number;
  uploadsPlaylistId: string;
};

/** Data API videos.list'ten parse edilen ham video. */
export type YtVideoRaw = {
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  publishedAt: string | null; // ISO 8601
  durationSec: number;
  isShort: boolean;
  viewCount: number;
  likeCount: number;
  commentCount: number;
};

/** yt-seed-channels.json satırı. */
export type SeedChannel = {
  handle: string; // '@' dahil
  category: YtCategory;
};

/** Brief konseyi 1. aşama (viralJudge) çıktısı — sonraki aşamalara grounding. */
export type ViralAnalysis = {
  whyItWorked: string;
  hookPattern: string;
  channelPersona: string;
  structure: string;
};

/** outline JSON öğesi. */
export type OutlineSection = {
  heading: string;
  targetSec: number;
  talkingPoints: string[];
};
