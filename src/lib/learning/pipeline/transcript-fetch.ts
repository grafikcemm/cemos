/**
 * CemOS Learn — zaman-kodlu transkript + video metadata. youtubei.js (Innertube)
 * birincil, timedtext fallback. youtube/transcript.ts'in aksine timestamp KORUR
 * (grounding chunk'ları için şart). ASLA throw etmez → null döner.
 */

import { Innertube } from "youtubei.js";

export type TimedSegment = { startSec: number; endSec: number; text: string };

export type TranscriptResult = {
  provider: "innertube" | "timedtext" | "gemini" | "supadata";
  lang: string | null;
  segments: TimedSegment[];
  fullText: string;
};

export type VideoMetadata = {
  title: string;
  channelTitle: string;
  durationSec: number;
  lang: string | null;
};

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** YouTube URL/ID → 11-karakter videoId, ya da null. */
export function extractVideoId(input: string): string | null {
  const raw = input.trim();
  if (YT_ID_RE.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return YT_ID_RE.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && YT_ID_RE.test(v)) return v;
    const parts = url.pathname.split("/").filter(Boolean); // shorts/<id>, embed/<id>, live/<id>
    if (parts.length >= 2 && ["shorts", "embed", "live", "v"].includes(parts[0])) {
      return YT_ID_RE.test(parts[1]) ? parts[1] : null;
    }
  }
  return null;
}

function cleanup(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function toSec(ms: unknown): number {
  const n = Number(ms);
  return Number.isFinite(n) ? n / 1000 : 0;
}

type RawSegment = {
  start_ms?: string | number;
  end_ms?: string | number;
  snippet?: { text?: string };
};
type RawTranscript = {
  transcript?: { content?: { body?: { initial_segments?: RawSegment[] } } };
};
type RawInfo = {
  basic_info?: { title?: string; author?: string; duration?: number };
};

/** Innertube basic_info'dan metadata. API key gerekmez. */
export async function fetchVideoMetadata(videoId: string): Promise<VideoMetadata | null> {
  try {
    const yt = await Innertube.create({ retrieve_player: false });
    const info = (await yt.getInfo(videoId)) as unknown as RawInfo;
    const bi = info.basic_info ?? {};
    return {
      title: cleanup(bi.title ?? ""),
      channelTitle: cleanup(bi.author ?? ""),
      durationSec: Math.max(0, Math.floor(Number(bi.duration) || 0)),
      lang: null,
    };
  } catch {
    return null;
  }
}

async function fromInnertube(videoId: string): Promise<TranscriptResult | null> {
  const yt = await Innertube.create({ retrieve_player: false });
  const info = await yt.getInfo(videoId);
  const data = (await info.getTranscript()) as unknown as RawTranscript;
  const raw = data?.transcript?.content?.body?.initial_segments ?? [];
  const segments: TimedSegment[] = [];
  for (const s of raw) {
    const text = cleanup(s?.snippet?.text ?? "");
    if (!text) continue;
    segments.push({ startSec: toSec(s.start_ms), endSec: toSec(s.end_ms), text });
  }
  if (segments.length === 0) return null;
  return {
    provider: "innertube",
    lang: null,
    segments,
    fullText: cleanup(segments.map((s) => s.text).join(" ")),
  };
}

async function fromTimedText(videoId: string): Promise<TranscriptResult | null> {
  for (const lang of ["tr", "en"]) {
    try {
      const res = await fetch(`https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}`);
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml) continue;
      const segments: TimedSegment[] = [];
      const re = /<text start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null) {
        const start = Number(m[1]) || 0;
        const dur = Number(m[2]) || 0;
        const text = cleanup(
          m[3]
            .replace(/<[^>]+>/g, " ")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&")
        );
        if (text) segments.push({ startSec: start, endSec: start + dur, text });
      }
      if (segments.length > 0) {
        return {
          provider: "timedtext",
          lang,
          segments,
          fullText: cleanup(segments.map((s) => s.text).join(" ")),
        };
      }
    } catch {
      // sonraki dili dene
    }
  }
  return null;
}

/** Zaman-kodlu transkript ya da null. ASLA throw etmez. */
export async function fetchTimedTranscript(videoId: string): Promise<TranscriptResult | null> {
  if (!videoId) return null;
  try {
    const viaInnertube = await fromInnertube(videoId);
    if (viaInnertube) return viaInnertube;
  } catch {
    // Innertube patladı → timedtext
  }
  try {
    return await fromTimedText(videoId);
  } catch {
    return null;
  }
}
