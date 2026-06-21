/**
 * Trend aggregator (Faz D) — the article's "find the signal": the feed is
 * telling you where attention is. This finds RECURRING topics across recent
 * source posts (a term that keeps coming back is a signal) by document
 * frequency. Pure, deterministic, no external calls — a reusable brain piece
 * for mining / "what should we write about" context.
 */

const TREND_STOPWORDS = new Set([
  "için", "gibi", "olarak", "ile", "veya", "yani", "ama", "çok", "daha", "kadar",
  "sonra", "önce", "bir", "bu", "şu", "hem", "her", "ben", "sen", "biz", "siz",
  "the", "and", "for", "with", "you", "your", "that", "this", "are", "was",
  "https", "http", "www", "com",
]);

export type TrendTopic = { term: string; count: number; score: number };

function tokensOf(text: string): string[] {
  const tokens = (text ?? "")
    .toLowerCase()
    .split(/[^a-zçğıöşü0-9]+/i)
    .filter((t) => t.length > 3 && !TREND_STOPWORDS.has(t));
  return Array.from(new Set(tokens)); // distinct per document → document frequency
}

/**
 * Rank recurring terms by how many distinct items mention them. Returns the
 * top `topN` terms that appear in at least `minCount` items.
 */
export function aggregateTrends(input: {
  items: Array<{ text: string }>;
  topN?: number;
  minCount?: number;
}): TrendTopic[] {
  const topN = input.topN ?? 8;
  const minCount = input.minCount ?? 2;

  const docFreq = new Map<string, number>();
  for (const item of input.items) {
    for (const term of tokensOf(item.text)) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  const total = Math.max(1, input.items.length);
  return Array.from(docFreq.entries())
    .filter(([, count]) => count >= minCount)
    .map(([term, count]) => ({ term, count, score: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, topN);
}
