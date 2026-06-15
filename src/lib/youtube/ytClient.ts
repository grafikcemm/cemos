/**
 * YouTube Data API v3 ince sarmalayıcı (Faz C).
 *
 * Kota disiplini (günlük 10.000 birim): her fn maliyeti yorumda. search.list 100u
 * → SADECE discovery.ts kullanır; rutin sync ASLA. API key yoksa her fn fetch
 * yapmadan fail-open boş/null döner (motor anahtarsız boş durumda kalır).
 */

import { getYoutubeApiKey } from "./ytConfig";
import type { YtChannelRaw, YtVideoRaw } from "./ytTypes";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const FETCH_TIMEOUT_MS = 30_000;

export type YtClientResult<T> = {
  ok: boolean;
  data: T;
  quotaUnits: number;
  error?: string;
};

type ApiChannelItem = {
  id?: string;
  snippet?: { title?: string };
  statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

type ApiVideoItem = {
  id?: string;
  snippet?: { channelId?: string; title?: string; description?: string; publishedAt?: string };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

type ApiPlaylistItem = {
  contentDetails?: { videoId?: string; videoPublishedAt?: string };
};

type ApiSearchItem = {
  id?: { channelId?: string };
  snippet?: { channelId?: string; title?: string; channelTitle?: string };
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function makeAbortSignal(): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  return ctrl.signal;
}

/** PT#H#M#S → saniye. Geçersiz/boş → 0. */
export function parseDurationToSec(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "");
  if (!m) return 0;
  return num(m[1]) * 3600 + num(m[2]) * 60 + num(m[3]);
}

export function mapChannelRaw(item: ApiChannelItem): YtChannelRaw {
  return {
    channelId: String(item?.id ?? ""),
    title: String(item?.snippet?.title ?? ""),
    subscriberCount: num(item?.statistics?.subscriberCount),
    videoCount: num(item?.statistics?.videoCount),
    viewCountTotal: num(item?.statistics?.viewCount),
    uploadsPlaylistId: String(item?.contentDetails?.relatedPlaylists?.uploads ?? ""),
  };
}

export function mapVideoRaw(item: ApiVideoItem): YtVideoRaw {
  const durationSec = parseDurationToSec(String(item?.contentDetails?.duration ?? ""));
  return {
    videoId: String(item?.id ?? ""),
    channelId: String(item?.snippet?.channelId ?? ""),
    title: String(item?.snippet?.title ?? ""),
    description: String(item?.snippet?.description ?? ""),
    publishedAt: item?.snippet?.publishedAt ? String(item.snippet.publishedAt) : null,
    durationSec,
    isShort: durationSec > 0 && durationSec <= 60,
    viewCount: num(item?.statistics?.viewCount),
    likeCount: num(item?.statistics?.likeCount),
    commentCount: num(item?.statistics?.commentCount),
  };
}

async function ytGet<I>(path: string, params: Record<string, string>): Promise<I[]> {
  const key = getYoutubeApiKey();
  if (!key) return [];
  const qs = new URLSearchParams({ ...params, key });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`, { signal: makeAbortSignal() });
  if (!res.ok) {
    throw new Error(`YouTube ${path} ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { items?: I[] };
  return json.items ?? [];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** channels.list?forHandle — 1u. Handle çözülemezse data:null. */
export async function resolveHandle(handle: string): Promise<YtClientResult<YtChannelRaw | null>> {
  if (!getYoutubeApiKey()) return { ok: false, data: null, quotaUnits: 0, error: "no_api_key" };
  const clean = handle.startsWith("@") ? handle.slice(1) : handle;
  try {
    const items = await ytGet<ApiChannelItem>("channels", {
      forHandle: clean,
      part: "snippet,statistics,contentDetails",
    });
    const item = items[0];
    return { ok: true, data: item ? mapChannelRaw(item) : null, quotaUnits: 1 };
  } catch (e) {
    return { ok: false, data: null, quotaUnits: 1, error: errMsg(e) };
  }
}

/** channels.list?id=... (≤50/çağrı) — 1u/çağrı. */
export async function batchChannels(channelIds: string[]): Promise<YtClientResult<YtChannelRaw[]>> {
  if (!getYoutubeApiKey()) return { ok: false, data: [], quotaUnits: 0, error: "no_api_key" };
  const ids = channelIds.filter(Boolean);
  if (!ids.length) return { ok: true, data: [], quotaUnits: 0 };
  let quota = 0;
  const out: YtChannelRaw[] = [];
  try {
    for (const group of chunk(ids, 50)) {
      quota += 1;
      const items = await ytGet<ApiChannelItem>("channels", {
        id: group.join(","),
        part: "snippet,statistics,contentDetails",
        maxResults: "50",
      });
      out.push(...items.map(mapChannelRaw));
    }
    return { ok: true, data: out, quotaUnits: quota };
  } catch (e) {
    return { ok: false, data: out, quotaUnits: quota, error: errMsg(e) };
  }
}

/** playlistItems.list (uploads) — 1u/sayfa. Tek sayfa (en yeni maxResults video). */
export async function listUploads(
  uploadsPlaylistId: string,
  opts?: { maxResults?: number }
): Promise<YtClientResult<Array<{ videoId: string; publishedAt: string | null }>>> {
  if (!getYoutubeApiKey()) return { ok: false, data: [], quotaUnits: 0, error: "no_api_key" };
  if (!uploadsPlaylistId) return { ok: true, data: [], quotaUnits: 0 };
  const maxResults = Math.min(Math.max(opts?.maxResults ?? 50, 1), 50);
  try {
    const items = await ytGet<ApiPlaylistItem>("playlistItems", {
      playlistId: uploadsPlaylistId,
      part: "contentDetails",
      maxResults: String(maxResults),
    });
    const data = items
      .map((i) => ({
        videoId: String(i?.contentDetails?.videoId ?? ""),
        publishedAt: i?.contentDetails?.videoPublishedAt
          ? String(i.contentDetails.videoPublishedAt)
          : null,
      }))
      .filter((v) => v.videoId !== "");
    return { ok: true, data, quotaUnits: 1 };
  } catch (e) {
    return { ok: false, data: [], quotaUnits: 1, error: errMsg(e) };
  }
}

/** videos.list?id=... (≤50/çağrı) — 1u/çağrı. */
export async function batchVideoStats(videoIds: string[]): Promise<YtClientResult<YtVideoRaw[]>> {
  if (!getYoutubeApiKey()) return { ok: false, data: [], quotaUnits: 0, error: "no_api_key" };
  const ids = videoIds.filter(Boolean);
  if (!ids.length) return { ok: true, data: [], quotaUnits: 0 };
  let quota = 0;
  const out: YtVideoRaw[] = [];
  try {
    for (const group of chunk(ids, 50)) {
      quota += 1;
      const items = await ytGet<ApiVideoItem>("videos", {
        id: group.join(","),
        part: "snippet,statistics,contentDetails",
        maxResults: "50",
      });
      out.push(...items.map(mapVideoRaw));
    }
    return { ok: true, data: out, quotaUnits: quota };
  } catch (e) {
    return { ok: false, data: out, quotaUnits: quota, error: errMsg(e) };
  }
}

/**
 * search.list — 100u. PAHALI. SADECE discovery.ts (manuel, günlük kapalı).
 * youtubeService rutin sync'i bunu ASLA import etmez (youtubeService.test guard'lar).
 */
export async function searchChannels(
  query: string,
  opts?: { maxResults?: number }
): Promise<YtClientResult<Array<{ channelId: string; title: string }>>> {
  if (!getYoutubeApiKey()) return { ok: false, data: [], quotaUnits: 0, error: "no_api_key" };
  const maxResults = Math.min(Math.max(opts?.maxResults ?? 10, 1), 50);
  try {
    const items = await ytGet<ApiSearchItem>("search", {
      q: query,
      type: "channel",
      part: "snippet",
      maxResults: String(maxResults),
    });
    const data = items
      .map((i) => ({
        channelId: String(i?.id?.channelId ?? i?.snippet?.channelId ?? ""),
        title: String(i?.snippet?.channelTitle ?? i?.snippet?.title ?? ""),
      }))
      .filter((c) => c.channelId !== "");
    return { ok: true, data, quotaUnits: 100 };
  } catch (e) {
    return { ok: false, data: [], quotaUnits: 100, error: errMsg(e) };
  }
}
