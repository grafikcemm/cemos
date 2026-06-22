/**
 * CemOS Learn — Gemini native YouTube transkript/özet üreticisi. OpenRouter videoyu
 * işleyemediği için (sadece metin+görsel), Gemini'nin native video desteğini kullanırız:
 * YouTube URL'sini file_data olarak verir, videoyu izleyip/dinleyip ZAMAN-DAMGALI ÖĞRENME
 * BLOKLARI üretir. Bloklar özet-yoğun (token-verimli) → uzun videolar da maxOutputTokens'a
 * sığar. Kesik JSON'a karşı regex-kurtarma. ASLA throw etmez → null fallback.
 */

import { getGeminiApiKey, getGeminiTranscriptModel } from "./learnConfig";
import type { TranscriptResult, TimedSegment } from "./pipeline/transcript-fetch";

const GEMINI_TIMEOUT_MS = 120_000;
// gemini-2.5-flash output tavanı 65536. 16384 uzun videoda segment listesini
// keser (finishReason=MAX_TOKENS → JSON truncation → salvage 0 → "empty" fallback).
// 65536 tam segment listesine yer açar (test: finishReason=STOP).
const MAX_OUTPUT_TOKENS = 65_536;

const TRANSCRIPT_PROMPT =
  "Bu eğitici videoyu ZAMAN-DAMGALI ÖĞRENME BLOKLARI halinde özetle. Videoyu baştan sona " +
  "izle; her ~60-90 saniyelik anlamlı bölüm için BİR blok üret. Her blok o bölümde " +
  "ANLATILAN ÖNEMLİ İÇERİĞİ 2-4 cümlede, bilgi kaybetmeden aktarsın (kendi yorumunu ekleme — " +
  "videoda söyleneni/gösterileni yaz). startSec o bölümün başladığı saniye olsun. Videonun " +
  "BAŞINDAN SONUNA kadar kapsa, sonu atlama.";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: { startSec: { type: "number" }, text: { type: "string" } },
        required: ["startSec", "text"],
      },
    },
  },
  required: ["segments"],
};

type RawSeg = { startSec?: number; text?: string };

/** Kesik JSON'dan tam {startSec,text} objelerini regex ile kurtar (MAX_TOKENS kesilmesi). */
function salvageSegments(text: string): RawSeg[] {
  const out: RawSeg[] = [];
  const re = /\{\s*"startSec"\s*:\s*([\d.]+)\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      out.push({ startSec: Number(m[1]), text: JSON.parse(`"${m[2]}"`) });
    } catch {
      /* tek bozuk objeyi atla */
    }
  }
  return out;
}

/**
 * Gemini ile bir YouTube videosundan zaman-damgalı içerik çıkarır. Key yoksa / hata
 * olursa null (orchestrator validate aşamasında sert durur). endSec bir sonraki bloğun
 * başlangıcından türetilir. İçeriksiz teşhis logu (status/finishReason/segs).
 */
export async function fetchTranscriptViaGemini(videoUrl: string): Promise<TranscriptResult | null> {
  const key = getGeminiApiKey();
  if (!key || !videoUrl) return null;

  const body = {
    contents: [{ parts: [{ file_data: { file_uri: videoUrl } }, { text: TRANSCRIPT_PROMPT }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      // Uzun videolar varsayılan çözünürlükte 1M-token bağlamı aşar (HTTP 400
      // "input token count exceeds maximum"). LOW çözünürlük video token'ını ~3x
      // düşürür (ses korunur → konuşma/eğitim içeriği etkilenmez), saatlik videolar sığar.
      mediaResolution: "MEDIA_RESOLUTION_LOW",
    },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
  try {
    const model = getGeminiTranscriptModel();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      }
    );
    if (!res.ok) {
      console.warn(`[learn] gemini transcript HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    const cand = json?.candidates?.[0];
    const text: string | undefined = cand?.content?.parts?.[0]?.text;
    const finishReason = cand?.finishReason;
    if (!text) {
      console.warn(`[learn] gemini transcript empty (finishReason=${finishReason})`);
      return null;
    }

    // Önce tam parse; başarısızsa (MAX_TOKENS kesilmesi) regex-kurtarma.
    let rawSegs: RawSeg[];
    try {
      rawSegs = (JSON.parse(text).segments ?? []) as RawSeg[];
    } catch {
      rawSegs = salvageSegments(text);
    }
    rawSegs = rawSegs.filter((s) => typeof s.text === "string" && s.text.trim() !== "");
    console.warn(`[learn] gemini transcript ok finishReason=${finishReason} segs=${rawSegs.length}`);
    if (rawSegs.length === 0) return null;

    const segments: TimedSegment[] = rawSegs.map((s, i, arr) => {
      const startSec = Number.isFinite(s.startSec) ? Math.max(0, Number(s.startSec)) : i * 60;
      const next = arr[i + 1];
      const endSec =
        next && Number.isFinite(next.startSec) ? Math.max(startSec, Number(next.startSec)) : startSec + 60;
      return { startSec, endSec, text: (s.text ?? "").trim() };
    });

    return {
      provider: "gemini",
      lang: null,
      segments,
      fullText: segments.map((s) => s.text).join(" ").trim(),
    };
  } catch (err) {
    console.warn(`[learn] gemini transcript error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
