/**
 * CemOS — localStorage "savedTweets" → DB tek-seferlik göçü (4D, legacy emeklilik).
 * Eski ViralLibraryTab bu göçü mount'ta yapıyordu; component silinince göç KAYBOLMASIN
 * diye buraya taşındı ve AppShell mount bootstrap'ında koşar. İdempotent: POST
 * /api/viral-library id'ye göre upsert → yarım kalan göç güvenle tekrarlar. Başarıda
 * localStorage kopyası (store.savedTweets) drenaj edilir; başarısızsa korunur (retry).
 */

import type { FlowTweet } from "@/store/xagent";

export type SavedTweetDto = {
  id: string;
  channel: string | null;
  authorHandle: string;
  text: string;
  likeCount: number;
  retweetCount: number;
  viewCount: number;
  viralScore: number;
  url: string;
  source: string;
  mediaUrl: string | null;
  mediaType: string | null;
};

/** FlowTweet → API DTO (eski ViralLibraryTab eşlemesiyle birebir). */
export function toSavedTweetDto(t: FlowTweet): SavedTweetDto {
  return {
    id: t.id,
    channel: t.channel ?? null,
    authorHandle: t.handle,
    text: t.text,
    likeCount: t.likeCount,
    retweetCount: t.retweetCount,
    viewCount: t.viewCount,
    viralScore: t.viralScore,
    url: t.url,
    source: t.source,
    mediaUrl: t.mediaUrl ?? null,
    mediaType: t.mediaType ?? null,
  };
}

export type DrainOutcome = "empty" | "drained" | "failed";

/**
 * İdempotent drenaj: savedTweets varsa DB'ye bulk upsert, başarıda her biri store'dan
 * silinir. Boşsa "empty" (no-op). Başarısızsa "failed" (kopya korunur → sonraki mount
 * yeniden dener). fetchImpl test için enjekte edilebilir.
 */
export async function drainSavedTweetsToDb(
  savedTweets: FlowTweet[],
  removeSavedTweet: (id: string) => void,
  fetchImpl: typeof fetch = fetch
): Promise<DrainOutcome> {
  if (savedTweets.length === 0) return "empty";
  try {
    const res = await fetchImpl("/api/viral-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tweets: savedTweets.map(toSavedTweetDto) }),
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean };
    if (!data.success) return "failed";
    for (const t of savedTweets) removeSavedTweet(t.id);
    return "drained";
  } catch {
    return "failed";
  }
}
