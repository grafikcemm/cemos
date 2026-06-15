// Turkish language detection + similarity check, ported from
// grafikcem-news-ai/src/lib/language-detector.ts. Used to reject untranslated
// English leaks and validate that a "translation" is actually Turkish.

const TURKISH_CHARS = /[çğışöüÇĞİŞÖÜ]/;

const TURKISH_KEYWORDS = new Set([
  "ve", "veya", "bir", "bu", "da", "de", "ile", "için", "olan", "olarak", "en", "çok", "daha",
  "ama", "fakat", "ancak", "lakin", "ise", "ki", "çünkü", "dolayı", "yüzden", "her", "hiç",
  "bazı", "tüm", "bütün", "şimdi", "sonra", "önce", "yeni", "gibi", "kadar", "tarafından",
  "yapılan", "edilen", "yılda", "günü", "kendi", "biz", "siz", "onlar", "bunu",
  "buna", "bunda", "burada", "şurada", "orada",
]);

const ENGLISH_KEYWORDS = new Set([
  "the", "and", "of", "to", "in", "is", "that", "for", "it", "on", "with",
  "as", "at", "by", "an", "this", "about",
]);

export function getLevenshteinDistance(a: string, b: string): number {
  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();

  if (normA === normB) return 0;
  if (normA.length === 0) return normB.length;
  if (normB.length === 0) return normA.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= normB.length; i++) matrix[i] = [i];
  for (let j = 0; j <= normA.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= normB.length; i++) {
    for (let j = 1; j <= normA.length; j++) {
      if (normB[i - 1] === normA[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[normB.length][normA.length];
}

export function isTooSimilar(original: string, translation: string, threshold = 0.85): boolean {
  const orig = original.toLowerCase().trim();
  const trans = translation.toLowerCase().trim();
  if (orig === trans) return true;

  const distance = getLevenshteinDistance(orig, trans);
  const maxLength = Math.max(orig.length, trans.length);
  if (maxLength === 0) return true;

  return 1 - distance / maxLength >= threshold;
}

export type LanguageDetection = {
  isTurkish: boolean;
  confidence: number;
  reason: string;
};

export function detectLanguage(text: string): LanguageDetection {
  if (!text || text.trim().length === 0) {
    return { isTurkish: false, confidence: 0, reason: "Empty text" };
  }

  const cleanText = text.toLowerCase().trim();
  const words = cleanText.split(/[\s,.\-;:!?()"/]+/);

  let turkishCharCount = 0;
  for (const char of cleanText) {
    if (TURKISH_CHARS.test(char)) turkishCharCount++;
  }

  let turkishWordCount = 0;
  let totalWords = 0;
  let englishWordCount = 0;
  for (const word of words) {
    if (word.length > 1) {
      totalWords++;
      if (TURKISH_KEYWORDS.has(word)) turkishWordCount++;
    }
    if (ENGLISH_KEYWORDS.has(word)) englishWordCount++;
  }

  const charDensity = cleanText.length > 0 ? turkishCharCount / cleanText.length : 0;
  const keywordRatio = totalWords > 0 ? turkishWordCount / totalWords : 0;

  let confidence = 0;
  if (turkishCharCount > 0) {
    confidence += 40;
    confidence += Math.min(40, charDensity * 300);
  }
  if (turkishWordCount > 0) {
    confidence += 30;
    confidence += Math.min(30, keywordRatio * 200);
  }
  if (englishWordCount > 0 && turkishWordCount === 0 && turkishCharCount === 0) {
    confidence = Math.max(0, confidence - englishWordCount * 15);
  }

  confidence = Math.min(100, Math.max(0, Math.round(confidence)));
  const isTurkish = confidence >= 20 || turkishCharCount > 0;

  return {
    isTurkish,
    confidence,
    reason: `tr-chars:${turkishCharCount} tr-words:${turkishWordCount} en-words:${englishWordCount} conf:${confidence}%`,
  };
}
