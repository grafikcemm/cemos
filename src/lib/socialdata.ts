const BASE = "https://api.socialdata.tools";
const KEY = process.env.SOCIALDATA_API_KEY;

// User ID cache — tarama başına tekrar user lookup'u önler
const userIdCache = new Map<string, string>();

export interface SocialDataTweet {
  id: string;
  handle: string;
  text: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  viewCount: number;
  url: string;
  viralScore: number;
  mediaUrl?: string;
  mediaType?: "photo" | "video" | "animated_gif";
  /** All media URLs extracted from the tweet (photos + best-bitrate videos), in order. */
  mediaUrls: string[];
}

type SocialDataUser = {
  id?: string;
  id_str?: string;
};

type SocialDataMediaVariant = {
  content_type?: string;
  bitrate?: number;
  url?: string;
};

type SocialDataMediaEntity = {
  media_url_https?: string;
  type?: string;
  video_info?: { variants?: SocialDataMediaVariant[] };
};

type SocialDataRawTweet = {
  id?: string;
  id_str?: string;
  full_text?: string;
  text?: string;
  created_at?: string;
  favorite_count?: number;
  retweet_count?: number;
  reply_count?: number;
  quote_count?: number;
  views_count?: number;
  extended_entities?: { media?: SocialDataMediaEntity[] };
  entities?: { media?: SocialDataMediaEntity[] };
};

type SocialDataTweetsResponse = {
  tweets?: SocialDataRawTweet[];
};

function getApiKey() {
  if (!KEY) {
    throw new Error("SOCIALDATA_API_KEY eksik.");
  }

  return KEY;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export type FetchUserTweetsResult = {
  tweets: SocialDataTweet[];
  twitterUserId: string;
  lookupPerformed: boolean;
  retweetsFiltered: number;
};

export async function fetchUserTweets(
  handle: string,
  maxTweets = 20,
  cachedUserId?: string | null
): Promise<FetchUserTweetsResult> {
  const cleanHandle = handle.replace("@", "").toLowerCase();
  const headers = {
    Authorization: `Bearer ${getApiKey()}`,
    Accept: "application/json",
  };

  // Cache'den veya parametreden gelen ID'yi kullan, yoksa API'ye sor
  let userId = cachedUserId || userIdCache.get(cleanHandle);
  let lookupPerformed = false;

  if (!userId) {
    const userRes = await fetch(`${BASE}/twitter/user/${cleanHandle}`, {
      headers,
      cache: "no-store",
    });

    if (!userRes.ok) {
      throw new Error(`Kullanici bulunamadi: ${cleanHandle} (${userRes.status})`);
    }

    const user = await readJson<SocialDataUser>(userRes);
    userId = user.id_str || user.id;

    if (!userId) {
      throw new Error(`Kullanici ID bulunamadi: ${cleanHandle}`);
    }
    userIdCache.set(cleanHandle, userId);
    lookupPerformed = true;
  }

  const tweetsRes = await fetch(`${BASE}/twitter/user/${userId}/tweets?type=tweets`, {
    headers,
    cache: "no-store",
  });

  if (!tweetsRes.ok) {
    // Kullanıcı silinmiş/değişmiş olabilir, cache'i temizle
    userIdCache.delete(cleanHandle);
    throw new Error(`Tweetler cekilemedi: ${cleanHandle} (${tweetsRes.status})`);
  }

  const data = await readJson<SocialDataTweetsResponse>(tweetsRes);
  const tweets = data.tweets || [];
  const includeRetweets = process.env.INCLUDE_RETWEETS === "true";

  const sliced = tweets.slice(0, maxTweets);
  const retweetsFiltered = includeRetweets
    ? 0
    : sliced.filter((t) => (t.full_text || t.text || "").trim().startsWith("RT @")).length;

  const mappedTweets = sliced
    .filter((tweet) => {
      const text = tweet.full_text || tweet.text || "";
      if (text.length <= 10) return false;
      if (!includeRetweets && text.trim().startsWith("RT @")) return false;
      return true;
    })
    .map((tweet) => {
      const likes = tweet.favorite_count || 0;
      const retweets = tweet.retweet_count || 0;
      const views = tweet.views_count || 1000;
      const replies = tweet.reply_count || 0;
      const engagement = likes + retweets * 2 + replies;
      const rate = (engagement / views) * 100;
      const viralScore = Math.min(99, Math.max(10, Math.round(rate * 8 + Math.log10(engagement + 1) * 12)));
      const id = tweet.id_str || tweet.id || "";

      // Medya URL'si çıkar (önce extended_entities, sonra entities)
      const mediaEntities =
        tweet.extended_entities?.media || tweet.entities?.media || [];

      // Resolve a single best URL per media entity (photo URL, or top-bitrate mp4).
      const resolveMediaUrl = (entity: SocialDataMediaEntity): string | undefined => {
        const type = entity.type as "photo" | "video" | "animated_gif" | undefined;
        if (type === "video" || type === "animated_gif") {
          const variants = entity.video_info?.variants || [];
          const mp4 = variants
            .filter((v) => v.content_type === "video/mp4")
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
          return mp4?.url || entity.media_url_https;
        }
        // photo (and any unknown type) → still image URL
        return entity.media_url_https;
      };

      const mediaUrls = mediaEntities
        .map(resolveMediaUrl)
        .filter((u): u is string => typeof u === "string" && u.length > 0);

      const firstMedia = mediaEntities[0];
      const mediaUrl = mediaUrls[0];
      const mediaType = firstMedia?.type as "photo" | "video" | "animated_gif" | undefined;

      return {
        id,
        handle: cleanHandle,
        text: tweet.full_text || tweet.text || "",
        createdAt: tweet.created_at || new Date().toISOString(),
        likeCount: likes,
        retweetCount: retweets,
        replyCount: replies,
        quoteCount: tweet.quote_count || 0,
        viewCount: views,
        url: `https://x.com/${cleanHandle}/status/${id}`,
        viralScore,
        mediaUrls,
        ...(mediaUrl && { mediaUrl, mediaType }),
      };
    });

  return {
    tweets: mappedTweets,
    twitterUserId: userId,
    lookupPerformed,
    retweetsFiltered,
  };
}

export function meetsThreshold(tweet: SocialDataTweet, thresholdLikes: number): boolean {
  if (tweet.likeCount === 0) return true;
  return tweet.likeCount >= thresholdLikes;
}

export function calculateCost(itemCount: number): number {
  return itemCount * 0.0002;
}
