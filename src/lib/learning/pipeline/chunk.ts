/**
 * CemOS Learn — LLM'siz transkript chunking. Segmentleri ~CHUNK_TARGET_CHARS'lık
 * zaman-kodlu pencerelere böler; CHUNKS_PER_SECTION chunk = bir section (map-reduce
 * gruplaması). Saf fonksiyon → deterministik, test edilebilir.
 */

import { CHUNK_TARGET_CHARS, CHUNKS_PER_SECTION } from "@/lib/learning/learnConfig";
import type { TimedSegment } from "./transcript-fetch";
import type { ChunkInput } from "@/lib/db/learnTranscriptRepo";

export function chunkSegments(
  segments: readonly TimedSegment[],
  targetChars = CHUNK_TARGET_CHARS,
  perSection = CHUNKS_PER_SECTION
): ChunkInput[] {
  const chunks: ChunkInput[] = [];
  let buf: string[] = [];
  let bufLen = 0;
  let startSec = 0;
  let endSec = 0;
  let idx = 0;

  const flush = () => {
    if (buf.length === 0) return;
    chunks.push({
      idx,
      startSec,
      endSec,
      text: buf.join(" ").trim(),
      sectionIdx: Math.floor(idx / perSection),
    });
    idx += 1;
    buf = [];
    bufLen = 0;
  };

  for (const seg of segments) {
    if (buf.length === 0) startSec = seg.startSec;
    buf.push(seg.text);
    bufLen += seg.text.length + 1;
    endSec = seg.endSec;
    if (bufLen >= targetChars) flush();
  }
  flush();
  return chunks;
}

/**
 * Zaman-kodsuz düz metni (manuel transkript / NotebookLM özeti) pseudo-segment'lere
 * böler. startSec=endSec=0 → "gerçek zaman damgası YOK" işareti (UI timestamp göstermez).
 * Cümle sınırında böler; grounding chunkIdx yine çalışır. Sahte zaman damgası ÜRETİLMEZ.
 */
export function plainTextSegments(
  fullText: string,
  targetChars = CHUNK_TARGET_CHARS
): TimedSegment[] {
  const clean = fullText.replace(/\s+/g, " ").trim();
  if (clean === "") return [];
  // Cümle sınırı (., !, ?, …, satır sonu) — yoksa tüm metin tek parça.
  const sentences = clean.match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g) ?? [clean];
  const segments: TimedSegment[] = [];
  let buf = "";
  for (const s of sentences) {
    const piece = s.trim();
    if (piece === "") continue;
    if (buf !== "" && buf.length + piece.length + 1 > targetChars) {
      segments.push({ startSec: 0, endSec: 0, text: buf.trim() });
      buf = "";
    }
    buf = buf === "" ? piece : `${buf} ${piece}`;
  }
  if (buf.trim() !== "") segments.push({ startSec: 0, endSec: 0, text: buf.trim() });
  return segments;
}

/** mm:ss biçimi (timestamp chip + prompt çapası). */
export function formatTimestamp(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function sectionCount(chunks: readonly ChunkInput[]): number {
  if (chunks.length === 0) return 0;
  return Math.max(...chunks.map((c) => c.sectionIdx)) + 1;
}
