export function normalizeTurkish(text: string): string {
  return text
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9\s]/gi, "") // remove punctuation
    .replace(/\s+/g, " ") // collapse whitespaces
    .trim();
}

function removeUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, "").replace(/t\.co\/\S+/gi, "");
}

export function calculateJaccardSimilarity(textA: string, textB: string): number {
  const normA = normalizeTurkish(removeUrls(textA));
  const normB = normalizeTurkish(removeUrls(textB));

  const tokensA = new Set(normA.split(" ").filter(Boolean));
  const tokensB = new Set(normB.split(" ").filter(Boolean));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

export function calculateLevenshteinSimilarity(textA: string, textB: string): number {
  const s1 = normalizeTurkish(removeUrls(textA));
  const s2 = normalizeTurkish(removeUrls(textB));

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const track = Array(s2.length + 1)
    .fill(null)
    .map(() => Array(s1.length + 1).fill(null));

  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;

  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  const distance = track[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  return 1.0 - distance / maxLength;
}

export function isNearDuplicate(textA: string, textB: string, threshold = 0.85): boolean {
  const jaccard = calculateJaccardSimilarity(textA, textB);
  if (jaccard >= threshold) return true;

  const levenshtein = calculateLevenshteinSimilarity(textA, textB);
  return levenshtein >= threshold;
}
