/**
 * Video transkripti — youtubei.js (Innertube) önce, timedtext fallback, her hata
 * null (fail-open). Brief Konseyi transcript yoksa metadata-temelli çalışır.
 */

import { Innertube } from "youtubei.js";

type TranscriptSegment = { snippet?: { text?: string } };
type TranscriptShape = {
  transcript?: { content?: { body?: { initial_segments?: TranscriptSegment[] } } };
};

function cleanup(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function fromInnertube(videoId: string): Promise<string | null> {
  const yt = await Innertube.create({ retrieve_player: false });
  const info = await yt.getInfo(videoId);
  const data = (await info.getTranscript()) as unknown as TranscriptShape;
  const segments = data?.transcript?.content?.body?.initial_segments ?? [];
  const text = cleanup(segments.map((s) => s?.snippet?.text ?? "").join(" "));
  return text.length > 0 ? text : null;
}

async function fromTimedText(videoId: string): Promise<string | null> {
  for (const lang of ["tr", "en"]) {
    try {
      const res = await fetch(`https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}`);
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml) continue;
      const text = cleanup(
        xml
          .replace(/<[^>]+>/g, " ")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
      );
      if (text.length > 0) return text;
    } catch {
      // sonraki dili dene
    }
  }
  return null;
}

/** Transkript metni ya da null. ASLA throw etmez. */
export async function fetchTranscript(videoId: string): Promise<string | null> {
  if (!videoId) return null;
  try {
    const viaInnertube = await fromInnertube(videoId);
    if (viaInnertube) return viaInnertube;
  } catch {
    // Innertube patladı → timedtext dene
  }
  try {
    return await fromTimedText(videoId);
  } catch {
    return null;
  }
}
