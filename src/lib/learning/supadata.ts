/**
 * CemOS Learn — Supadata 3rd-party transkript fallback. Innertube/timedtext Vercel
 * datacenter IP'sinde bloklu, Gemini bazı videoları PROHIBITED_CONTENT ile reddeder.
 * Supadata kendi altyapısından GERÇEK YouTube altyazısını çeker → her ikisini de atlatır.
 * transcript-fetch.ts deseni: zaman-damgalı segment KORUR, ASLA throw etmez → null fallback.
 */

import { getSupadataApiKey } from "./learnConfig";
import type { TranscriptResult, TimedSegment } from "./pipeline/transcript-fetch";

const SUPADATA_TIMEOUT_MS = 30_000;
const SUPADATA_URL = "https://api.supadata.ai/v1/youtube/transcript";

type SupadataSeg = { text?: string; offset?: number; duration?: number; lang?: string };

/**
 * Supadata ile bir YouTube videosundan zaman-kodlu altyazı çeker. Key yoksa / hata
 * olursa null (orchestrator bir sonraki fallback'e —Gemini— düşer). offset/duration
 * ms cinsinden gelir → saniyeye çevrilir. Segment modu (düz-metin değil): grounding
 * chunk'ları için timestamp şart.
 */
export async function fetchTranscriptViaSupadata(videoId: string): Promise<TranscriptResult | null> {
  const key = getSupadataApiKey();
  if (!key || !videoId) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SUPADATA_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPADATA_URL}?videoId=${encodeURIComponent(videoId)}`, {
      headers: { "x-api-key": key },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`[learn] supadata transcript HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    // Uzun videolarda bazı planlar 202 + async job döndürür (content array yok) →
    // segment çıkmaz → null → Gemini fallback (uzun videoyu LOW-res ile kapsıyor).
    const raw: SupadataSeg[] = Array.isArray(json?.content) ? json.content : [];
    const segments: TimedSegment[] = [];
    for (const s of raw) {
      const text = (s?.text ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const startSec = Number.isFinite(s.offset) ? Math.max(0, Number(s.offset) / 1000) : 0;
      const dur = Number.isFinite(s.duration) ? Number(s.duration) / 1000 : 0;
      segments.push({ startSec, endSec: startSec + dur, text });
    }
    if (segments.length === 0) {
      console.warn(`[learn] supadata transcript empty (videoId=${videoId})`);
      return null;
    }
    return {
      provider: "supadata",
      lang: typeof json?.lang === "string" ? json.lang : null,
      segments,
      fullText: segments.map((s) => s.text).join(" ").trim(),
    };
  } catch (err) {
    console.warn(`[learn] supadata transcript error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
