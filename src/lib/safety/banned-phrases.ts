/**
 * örn2 brand-voice discipline: phrases that read as generic AI/marketing tropes.
 * Tek kaynak — hem grounding bloğunun "asla yazma" listesi hem de deterministik
 * lint (FIRST-SPRINT item 9) buradan beslenir. Karşılaştırma
 * toLocaleLowerCase("tr-TR") ile yapılır.
 */
export const BANNED_PHRASES: string[] = [
  "Stop doing",
  "X is dead",
  "öldü",
  "DM me",
  "game changer",
  "oyunun kurallarını değiştir",
  "çığır açan",
  "devrim niteliğinde",
  "bunu kaçırma",
  "inanılmaz",
  "şok edici",
  "herkes konuşuyor",
  // Klasik AI-slop CTA'ları (newsAi BAD_ANGLE listesiyle hizalı — tek kaynak).
  "okumaya devam",
  "takipte kal",
  "detaylar için",
];

/**
 * Klişe soru-CTA kalıpları: tweet SONUNDA okuyucuya atılan jenerik sorular.
 * Hesap kurallarında ("sona klişe soru-CTA yasak") açıkça yasaklıdır;
 * deterministik lint yakalar (seed'li testler). "Sona" semantiği çağıran
 * tarafta `questionCtaTail()` penceresiyle uygulanır — kalıplar anchor'sız ki
 * "paylaşın!" gibi noktalama varyantları kaçmasın.
 */
export const QUESTION_CTA_PATTERNS: RegExp[] = [
  /peki siz ne düşünüyorsunuz/i,
  /siz ne düşünüyorsunuz/i,
  /sizce de öyle değil mi/i,
  /siz(in)? düşünceleriniz neler/i,
  /katılıyor musunuz/i,
  /yorumlarda buluşalım/i,
  /yorumlara yaz[ıi]n/i,
  /düşüncelerinizi paylaşın/i,
  /sizce\s*\?/i,
];

/** Metnin CTA penceresini (son ~80 karakter) döndürür — "sona" kuralı. */
export function questionCtaTail(text: string): string {
  return text.trim().slice(-80);
}

/** Metin klişe soru-CTA ile mi kapanıyor? (son-80-karakter penceresi) */
export function endsWithQuestionCta(text: string): boolean {
  const tail = questionCtaTail(text);
  return QUESTION_CTA_PATTERNS.some((p) => p.test(tail));
}
