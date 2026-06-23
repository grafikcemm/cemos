import { createLocalFallbackEmbedding } from "@/lib/growth-engine/vector-memory";

// Semantic discover (Faz CI-3) — searchable document + embedding + cosine rank.
// v1 embedder = repo'nun mevcut deterministik local fallback'i (API maliyeti yok,
// anahtar bağımlılığı yok, testlenebilir). pgvector sonraki perf optimizasyonu.

export type EmbedResult = { values: number[]; dim: number; model: string };

/** Aranabilir doküman: başlık + gövde + transkript + yazar + format birleşimi. */
export function buildSearchableDoc(item: {
  title?: string;
  body?: string;
  transcript?: string;
  author?: string;
  format?: string;
  platform?: string;
}): string {
  return [
    item.title ?? "",
    item.body ?? "",
    item.transcript ?? "",
    item.author ?? "",
    item.format ?? "",
    item.platform ?? "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** Deterministik local embedding (unit vector). */
export function embedText(text: string): EmbedResult {
  const e = createLocalFallbackEmbedding(text);
  return { values: e.values, dim: e.dimensions, model: e.provider };
}

/** Kosinüs benzerliği. Farklı uzunlukta/boş vektörlerde 0. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type RankCandidate = { id: string; values: number[] };
export type RankHit = { id: string; score: number };

/** Sorgu vektörüne göre adayları benzerliğe göre sırala (desc), limit uygula. */
export function rankBySimilarity(
  queryValues: readonly number[],
  candidates: readonly RankCandidate[],
  limit = 20,
): RankHit[] {
  return candidates
    .map((c) => ({ id: c.id, score: cosine(queryValues, c.values) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}
