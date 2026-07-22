import { blocklist, forbiddenTokens } from "./blocklist";
import { BANNED_PHRASES, endsWithQuestionCta } from "./banned-phrases";

export type LintSeverity = "blocker" | "warning";

export type LintIssue = {
  code: string;
  severity: LintSeverity;
  message: string;
};

export type HeuristicResult = {
  passed: boolean;
  issues: LintIssue[];
};

const DANGLING_QUESTION_PATTERNS = [
  /bu ne anlama geliyor\?$/i,
  /ne anlama geliyor\?$/i,
  /peki bu ne demek\?$/i,
  /ders ne\?$/i,
  /sonu[cç]\?$/i,
  /neden mi\?$/i,
  /nas[ıi]l m[ıi]\?$/i,
];

export function runDeterministicHeuristics(
  text: string,
  draftType: string = "TWEET",
  maxCharsLimit: number = 280,
  accountHandle?: string,
  sourceText?: string,
  minCharsLimit: number = 0
): HeuristicResult {
  const issues: LintIssue[] = [];
  const trimmed = text.trim();

  // 1. Empty Text check
  if (!trimmed) {
    issues.push({
      code: "empty_text",
      severity: "blocker",
      message: "İçerik boş olamaz.",
    });
    return { passed: false, issues };
  }

  // 2. Character limit check
  let limit = maxCharsLimit;
  if (draftType === "QUOTE") {
    limit = 240;
  } else if (draftType === "REPLY") {
    limit = 180;
  }

  if (trimmed.length > limit) {
    issues.push({
      code: "char_limit",
      severity: "blocker",
      message: `İçerik ${limit} karakter sınırını aşıyor (Mevcut: ${trimmed.length}).`,
    });
  }

  // 2b. Format-tier lower bound: below the target band is a quality miss, not a
  // broken draft — warning only, so valid short content is never hard-blocked.
  if (minCharsLimit > 0 && trimmed.length < minCharsLimit) {
    issues.push({
      code: "below_min_chars",
      severity: "warning",
      message: `İçerik format alt sınırının altında (${trimmed.length}/${minCharsLimit} kar.). Tier hedefine ulaşmıyor.`,
    });
  }

  // 3. Half sentence end check
  const lastChar = trimmed[trimmed.length - 1];
  const halfSentenceChars = [",", ";", ":", "-", "(", "\"", "'"];
  if (halfSentenceChars.includes(lastChar)) {
    issues.push({
      code: "half_sentence_end",
      severity: "blocker",
      message: `İçerik yarım cümle bitiş karakteri (${lastChar}) ile bitemez.`,
    });
  }

  // 4. Unmatched parentheses or double quotes
  let openParen = 0;
  let openQuote = 0;
  for (const char of trimmed) {
    if (char === "(") openParen++;
    if (char === ")") openParen--;
    if (char === '"') openQuote++;
  }
  if (openParen !== 0 || openQuote % 2 !== 0) {
    issues.push({
      code: "unmatched_punctuation",
      severity: "blocker",
      message: "Parantez veya çift tırnak işaretleri eşleşmiyor.",
    });
  }

  // 5. Repeated words or n-grams
  const words = trimmed.toLocaleLowerCase("tr-TR").split(/\s+/).filter(Boolean);
  let hasRepetition = false;
  // 1-gram repeated consecutive words
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] === words[i + 1]) {
      hasRepetition = true;
      break;
    }
  }
  // 2-gram to 4-gram repeated consecutive sequences
  if (!hasRepetition) {
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i < words.length - 2 * n + 1; i++) {
        const gram1 = words.slice(i, i + n).join(" ");
        const gram2 = words.slice(i + n, i + 2 * n).join(" ");
        if (gram1 === gram2) {
          hasRepetition = true;
          break;
        }
      }
      if (hasRepetition) break;
    }
  }

  if (hasRepetition) {
    issues.push({
      code: "repeated_ngram",
      severity: "blocker",
      message: "İçerik içinde tekrar eden kelime veya kelime grupları (n-gram) tespit edildi.",
    });
  }

  // 6. Forbidden tokens (slurs/gambling/crypto scam etc.)
  const lowerText = trimmed.toLocaleLowerCase("tr-TR");
  for (const token of forbiddenTokens) {
    if (lowerText.includes(token)) {
      issues.push({
        code: "forbidden_token",
        severity: "blocker",
        message: `İçerik yasaklı kelime içeriyor: "${token}".`,
      });
    }
  }

  // 6.5. Replacement character check
  if (trimmed.includes("\uFFFD")) {
    issues.push({
      code: "replacement_character",
      severity: "blocker",
      message: "İçerik bozuk karakter () içeriyor.",
    });
  }

  // 6.6. Mojibake blocker
  const mojibakePatterns = [/Ã[¼¶§œ–‡]/, /Ä[±Ÿ°]/, /Å[Ÿ]/, /â[€œ”]/, /ï¿½/];
  const hasMojibake = mojibakePatterns.some((pat) => pat.test(trimmed)) || trimmed.includes("ï¿½");
  if (hasMojibake) {
    issues.push({
      code: "mojibake_blocker",
      severity: "blocker",
      message: "İçerikte Türkçe karakter bozulması (mojibake) tespit edildi. Lütfen baştan yazın.",
    });
  }

  // 6.7. Truncated ending and dangling question blocker
  if (trimmed.endsWith("...")) {
    issues.push({
      code: "truncated_ending",
      severity: "blocker",
      message: "İçerik kesilmiş görünüyor.",
    });
  } else {
    const hasDanglingQuestion = DANGLING_QUESTION_PATTERNS.some((pat) => pat.test(trimmed));
    if (hasDanglingQuestion) {
      issues.push({
        code: "dangling_question",
        severity: "blocker",
        message: "İçerik cevapsız bir soruyla bitiyor.",
      });
    }
  }

  // 7. URL warning
  if (trimmed.includes("http://") || trimmed.includes("https://") || trimmed.includes("t.co/")) {
    issues.push({
      code: "url_present",
      severity: "warning",
      message: "İçerik bir URL barındırıyor.",
    });
  }

  // 8. Mention warnings
  const mentionCount = (trimmed.match(/@\w+/g) || []).length;
  if (draftType !== "REPLY" && mentionCount > 0) {
    issues.push({
      code: "mention_present",
      severity: "warning",
      message: "Reply olmayan bir taslakta mention bulunuyor.",
    });
  }

  if (draftType === "REPLY" && trimmed.startsWith("@")) {
    issues.push({
      code: "reply_leading_mention",
      severity: "warning",
      message: "Reply taslağı en başta mention ile başlıyor.",
    });
  }

  // 9. Emoji density
  const emojis = trimmed.match(/\p{Extended_Pictographic}/gu) || [];
  const emojiCount = emojis.length;
  if (emojiCount > 0 && trimmed.length / emojiCount < 50) {
    issues.push({
      code: "emoji_density",
      severity: "warning",
      message: "İçerikte emoji yoğunluğu çok yüksek (50 karakter başına birden fazla).",
    });
  }

  // 10. Hashtags limit
  const hashtagsCount = (trimmed.match(/#\w+/g) || []).length;
  if (hashtagsCount > 2) {
    issues.push({
      code: "hashtag_density",
      severity: "warning",
      message: `Çok fazla hashtag tespit edildi: ${hashtagsCount} (Önerilen: en fazla 2).`,
    });
  }

  // 10.5. Türkçe klişe / AI-slop ifade lint'i (FIRST-SPRINT item 9).
  //   BANNED_PHRASES grounding "asla yazma" listesiyle AYNI kaynaktan gelir;
  //   yazar kaçırırsa deterministik lint yakalar. Warning: taslak silinmez,
  //   leak-gate needs_edit'e yönlendirir (redirect, not delete).
  for (const phrase of BANNED_PHRASES) {
    if (lowerText.includes(phrase.toLocaleLowerCase("tr-TR"))) {
      issues.push({
        code: "banned_phrase",
        severity: "warning",
        message: `Yasak klişe ifade: "${phrase}". Marka sesine uymuyor, yeniden yaz.`,
      });
    }
  }

  // 10.6. Klişe soru-CTA lint'i: sona atılan jenerik soru kalıpları hesap
  //   kurallarında yasak ("Peki siz ne düşünüyorsunuz?" vb.).
  if (endsWithQuestionCta(trimmed)) {
    issues.push({
      code: "question_cta",
      severity: "warning",
      message: "Klişe soru-CTA ile bitiyor. Soru yerine net bir kapanış cümlesi kullan.",
    });
  }

  // 11. Sales smell list from blocklist
  for (const promo of blocklist) {
    if (lowerText.includes(promo)) {
      issues.push({
        code: "sales_smell",
        severity: "warning",
        message: `İçerik satış/spam kokan terim içeriyor: "${promo}".`,
      });
    }
  }

  // 12. Account-specific guardrails
  if (accountHandle === "maskulenkod") {
    const maskulenPatterns = [
      // explicit value-zeroing patterns
      "kadının değeri", "kadınki sıfır", "kadınınki sıfır", "kadının gözünde sıfır",
      "değeri sıfırlanır", "değeri sıfır", "biyoloji bu", "bu biyoloji",
      "kadın doğası", "erkek doğası",
      // sweeping generalizations
      "tüm kadınlar", "tüm erkekler", "her kadın", "her erkek",
      "hiçbir kadın", "hiçbir erkek", "kadınlar hep", "erkekler hep",
      "kadınlar zaten", "erkekler zaten",
      // standalone risk tokens (context-agnostic)
      "yok denecek kadar",
    ];
    const hasMaskulenRisk = maskulenPatterns.some((p) => lowerText.includes(p));
    if (hasMaskulenRisk) {
      issues.push({
        code: "risk_generalization",
        severity: "warning",
        message: "Hesap riski: Aşırı genelleme veya kesin ifade tespit edildi.",
      });
    }
  }


  if (accountHandle === "grafikcem") {
    const grafikcemPatterns = [
      "kesinlikle", "tartışmasız", "kanıtlandı", "herkes biliyor",
      "kanıtlanmış", "ispatlanmış", "ispatlandı", "şüphe yok",
      "kesin olarak", "tartışma götürmez",
      // extended unattributed-conclusion patterns
      "en güçlü", "herkesin elinde", "lisanssız",
    ];
    const hasGrafikcemRisk = grafikcemPatterns.some((p) => lowerText.includes(p));
    if (hasGrafikcemRisk) {
      issues.push({
        code: "unattributed_conclusion",
        severity: "warning",
        message: "Hesap riski: Kaynağa atıflanmamış kesin çıkarım tespit edildi.",
      });
    }
  }

  const passed = !issues.some((issue) => issue.severity === "blocker");

  return { passed, issues };
}
