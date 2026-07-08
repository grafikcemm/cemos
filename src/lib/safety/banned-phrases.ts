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
];

/**
 * Klişe soru-CTA kalıpları: tweet sonunda okuyucuya atılan jenerik sorular.
 * Hesap kurallarında ("soru-CTA yasak") açıkça yasaklıdır; deterministik lint
 * bunları yakalar (seed'li testler).
 */
export const QUESTION_CTA_PATTERNS: RegExp[] = [
  /peki siz ne düşünüyorsunuz\s*\?\s*$/i,
  /siz ne düşünüyorsunuz\s*\?\s*$/i,
  /sizce\s*\?\s*$/i,
  /sizce de öyle değil mi\s*\?\s*$/i,
  /siz(in)? düşünceleriniz neler\s*\?\s*$/i,
  /katılıyor musunuz\s*\?\s*$/i,
  /yorumlarda buluşalım\.?\s*$/i,
  /yorumlara yaz[ıi]n\.?\s*$/i,
  /düşüncelerinizi paylaşın\.?\s*$/i,
];
