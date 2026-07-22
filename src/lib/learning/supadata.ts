/**
 * CemOS Learn — Supadata 3rd-party transkript fallback. Innertube/timedtext Vercel
 * datacenter IP'sinde bloklu, Gemini bazı videoları PROHIBITED_CONTENT ile reddeder.
 * Supadata kendi altyapısından GERÇEK YouTube altyazısını çeker → her ikisini de atlatır.
 * transcript-fetch.ts deseni: zaman-damgalı segment KORUR, ASLA throw etmez → null fallback.
 *
 * Uzun videolar: Supadata 202 + async job döndürür (content yerine jobId). Eskiden bu
 * doğrudan null'a düşüyordu ("çoğu videoyu algılamıyor" şikâyetinin kökü). Artık job
 * tamamlanana dek poll edilir; timeout/failed yine null (Gemini fallback sözleşmesi).
 */

import { getSupadataApiKey } from "./learnConfig";
import type { TranscriptResult, TimedSegment } from "./pipeline/transcript-fetch";

const SUPADATA_TIMEOUT_MS = 30_000;
const SUPADATA_URL = "https://api.supadata.ai/v1/youtube/transcript";
const SUPADATA_JOB_URL = "https://api.supadata.ai/v1/transcript";

// Async job poll bütçesi: uzun videolar dakikalar sürebilir ama orchestrator stage
// bütçesini de bloklamamalı. ~90s toplam, 3s aralık.
const JOB_POLL_INTERVAL_MS = 3_000;
const JOB_POLL_TOTAL_MS = 90_000;

type SupadataSeg = { text?: string; offset?: number; duration?: number; lang?: string };
type SupadataPayload = {
  content?: unknown;
  lang?: unknown;
  jobId?: unknown;
  status?: unknown;
  error?: unknown;
};

function parseSegments(json: SupadataPayload): { segments: TimedSegment[]; lang: string | null } {
  const raw: SupadataSeg[] = Array.isArray(json?.content) ? (json.content as SupadataSeg[]) : [];
  const segments: TimedSegment[] = [];
  for (const s of raw) {
    const text = (s?.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const startSec = Number.isFinite(s.offset) ? Math.max(0, Number(s.offset) / 1000) : 0;
    const dur = Number.isFinite(s.duration) ? Number(s.duration) / 1000 : 0;
    segments.push({ startSec, endSec: startSec + dur, text });
  }
  return { segments, lang: typeof json?.lang === "string" ? json.lang : null };
}

function toResult(segments: TimedSegment[], lang: string | null): TranscriptResult {
  return {
    provider: "supadata",
    lang,
    segments,
    fullText: segments.map((s) => s.text).join(" ").trim(),
  };
}

async function fetchJsonWithTimeout(url: string, key: string): Promise<{ status: number; json: SupadataPayload } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SUPADATA_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "x-api-key": key }, signal: ctrl.signal });
    const json = (await res.json().catch(() => ({}))) as SupadataPayload;
    return { status: res.status, json };
  } catch (err) {
    console.warn(`[learn] supadata fetch error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Async job'ı tamamlanana / bütçe bitene dek poll eder. Başarısızlıkta null. */
async function pollJob(jobId: string, key: string): Promise<TranscriptResult | null> {
  const deadline = Date.now() + JOB_POLL_TOTAL_MS;
  while (Date.now() < deadline) {
    await sleep(JOB_POLL_INTERVAL_MS);
    const out = await fetchJsonWithTimeout(`${SUPADATA_JOB_URL}/${encodeURIComponent(jobId)}`, key);
    if (!out) return null;
    const status = typeof out.json.status === "string" ? out.json.status : "";
    if (status === "failed" || out.status >= 400) {
      console.warn(`[learn] supadata job failed (jobId=${jobId}, http=${out.status})`);
      return null;
    }
    // Bazı cevaplar status alanı olmadan doğrudan content taşır — her turda dene.
    const { segments, lang } = parseSegments(out.json);
    if (segments.length > 0) return toResult(segments, lang);
    if (status === "completed") {
      // Tamamlandı ama segment yok → içerik gerçekten boş.
      console.warn(`[learn] supadata job completed but empty (jobId=${jobId})`);
      return null;
    }
    // queued/active → beklemeye devam
  }
  console.warn(`[learn] supadata job poll timeout (jobId=${jobId})`);
  return null;
}

/**
 * Supadata ile bir YouTube videosundan zaman-kodlu altyazı çeker. Key yoksa / hata
 * olursa null (orchestrator bir sonraki fallback'e —Gemini— düşer). offset/duration
 * ms cinsinden gelir → saniyeye çevrilir. Segment modu (düz-metin değil): grounding
 * chunk'ları için timestamp şart.
 */
export async function fetchTranscriptViaSupadata(videoId: string): Promise<TranscriptResult | null> {
  const key = getSupadataApiKey();
  if (!key || !videoId) return null;

  const out = await fetchJsonWithTimeout(`${SUPADATA_URL}?videoId=${encodeURIComponent(videoId)}`, key);
  if (!out) return null;

  const jobId = typeof out.json.jobId === "string" ? out.json.jobId : null;
  if (out.status === 202 || (jobId && !Array.isArray(out.json.content))) {
    if (!jobId) {
      console.warn(`[learn] supadata 202 without jobId (videoId=${videoId})`);
      return null;
    }
    return pollJob(jobId, key);
  }

  if (out.status < 200 || out.status >= 300) {
    console.warn(`[learn] supadata transcript HTTP ${out.status}`);
    return null;
  }

  const { segments, lang } = parseSegments(out.json);
  if (segments.length === 0) {
    console.warn(`[learn] supadata transcript empty (videoId=${videoId})`);
    return null;
  }
  return toResult(segments, lang);
}
