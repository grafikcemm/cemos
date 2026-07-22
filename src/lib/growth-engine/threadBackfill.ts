import {
  validateThreadSegments,
  type ThreadSegment,
} from "./threadSegments";

/**
 * Phase 2D (ADR-033) — deterministik, LLM'SİZ thread backfill ayrıştırıcısı.
 *
 * YALNIZ açık yapı ayrıştırılır:
 *  1. blank_blocks : boş satırla ayrılmış ≥2 blok, hepsi segment sınırında.
 *  2. numbered     : satır başında ardışık "1/", "2." veya "3)" işaretleri
 *                    (1'den başlayan kesintisiz dizi, ≥2 işaret); işaret metni
 *                    OLDUĞU GİBİ korunur — metin yeniden yazılmaz/özetlenmez.
 * Belirsiz metin OLDUĞU GİBİ bırakılır (needs_edit kalması doğrudur). Tek uzun
 * metin tek segment olarak backfill EDİLMEZ.
 */
export type BackfillSplitResult =
  | { ok: true; segments: ThreadSegment[]; strategy: "blank_blocks" | "numbered_markers" }
  | { ok: false; reason: "ambiguous" | "single_block" | "segment_over_limit" };

function tryBlankBlocks(text: string, segmentLimit: number): BackfillSplitResult | null {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  if (blocks.length < 2) return null;
  if (blocks.some((b) => b.length > segmentLimit)) return null;
  const segments = blocks.map((b) => ({ text: b }));
  if (!validateThreadSegments(segments, segmentLimit).ok) return null;
  return { ok: true, segments, strategy: "blank_blocks" };
}

const NUMBER_MARKER = /^(\d{1,2})[\/.)]\s/;

function tryNumberedMarkers(text: string, segmentLimit: number): BackfillSplitResult | null {
  const lines = text.split("\n");
  const markers: { lineIdx: number; n: number }[] = [];
  lines.forEach((line, i) => {
    const m = NUMBER_MARKER.exec(line.trim());
    if (m) markers.push({ lineIdx: i, n: Number(m[1]) });
  });
  if (markers.length < 2) return null;
  // Kesintisiz 1..n dizisi ŞART — "2024/12" gibi tesadüfi eşleşme dizi kuralını geçemez.
  for (let i = 0; i < markers.length; i++) {
    if (markers[i].n !== i + 1) return null;
  }
  const parts: string[] = [];
  const prefix = lines.slice(0, markers[0].lineIdx).join("\n").trim();
  if (prefix.length > 0) parts.push(prefix);
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].lineIdx;
    const end = i + 1 < markers.length ? markers[i + 1].lineIdx : lines.length;
    const part = lines.slice(start, end).join("\n").trim();
    if (part.length === 0) return null;
    parts.push(part);
  }
  if (parts.length < 2) return null;
  if (parts.some((p) => p.length > segmentLimit)) return null;
  const segments = parts.map((p) => ({ text: p }));
  if (!validateThreadSegments(segments, segmentLimit).ok) return null;
  return { ok: true, segments, strategy: "numbered_markers" };
}

export function deterministicThreadSplit(
  rawText: string,
  segmentLimit: number
): BackfillSplitResult {
  const text = (rawText ?? "").trim();
  if (text.length === 0) return { ok: false, reason: "ambiguous" };

  const blank = tryBlankBlocks(text, segmentLimit);
  if (blank) return blank;

  const numbered = tryNumberedMarkers(text, segmentLimit);
  if (numbered) return numbered;

  // Tanılayıcı neden: tek blok mu, blok var ama sınır aşımı mı, tamamen belirsiz mi.
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length < 2) return { ok: false, reason: "single_block" };
  if (blocks.some((b) => b.length > segmentLimit)) return { ok: false, reason: "segment_over_limit" };
  return { ok: false, reason: "ambiguous" };
}
