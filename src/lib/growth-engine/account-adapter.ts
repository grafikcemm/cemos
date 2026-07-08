import {
  accountProfiles,
  type AccountHandle,
  type AccountProfile as LiveAccountProfile,
} from "@/lib/accounts";

/**
 * Tek hesap kimliği adapter'ı (FIRST-SPRINT item 6).
 *
 * Growth-engine scoring bileşenleri (scorer, leak-detector çağıranları) hesap
 * kimliğini artık CANLI kaynaktan (`@/lib/accounts`) alır; growth-engine'in
 * kendi `account-profiles.ts` kopyası günlük draft yolundan çıkarılmıştır
 * (dosya Sprint 2 eval-parity'ye kadar SİLİNMEZ — diğer sprint-engine
 * tüketicileri için durur). Bu adapter iki profil evreni arasındaki alan
 * eşlemesini tek yerde tutar.
 */

export type ScoringIdentity = {
  handle: AccountHandle;
  persona: string;
  tone: string;
  format: string;
  viralMechanic: string;
  maxChars: number;
  /** Canlı forbiddenRules cümleleri — LLM prompt bağlamı için. */
  forbidden: string[];
  /** Substring-eşlenebilir kısa yasak terimler (Türkçe-fold'lu) — heuristik
   *  skor cezaları için. Canlı kurallar tam cümle olduğu için doğrudan
   *  keyword eşleşmesine girmez; eşleme bilgisi adapter'da yaşar. */
  forbiddenTerms: string[];
  /** Mod id'leri — leak-detector `knownPillars` girdisi. */
  pillarIds: string[];
  concept: string;
  /** Hashtag politikası — her iki hesap da hashtagsız yayın yapar. */
  noHashtags: boolean;
};

/**
 * Türkçe diakritik fold'u: eşleşme "folded" uzayda yapılır ki canlı profillerin
 * ASCII yazımı ("klisesi") ile taslakların gerçek Türkçe yazımı ("klişesi")
 * birbirini bulsun.
 */
export function foldTurkish(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ç", "c")
    .replaceAll("ğ", "g")
    .replaceAll("ı", "i")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s")
    .replaceAll("ü", "u");
}

/**
 * Canlı forbiddenRules cümlelerinin heuristik eşleşme karşılığı. Kaynak yine
 * canlı kurallar — burada yalnız "hangi kısa ifade bu kuralı ihlal eder"
 * eşlemesi tutulur (fold'lanmış).
 */
// Kaynaksız kesin-ifade / uydurma-istatistik slop'u persona-bağımsızdır —
// her iki hesabın "kaynaksız kesin ifade kullanma" çizgisinin karşılığı.
const SHARED_CERTAINTY_TERMS = [
  "kesinlikle",
  "tartismasiz",
  "kanitla", // kanıtladı / kanıtlandı / kanıtlanmış kökü (fold'lu)
  "suphe yok",
  "herkes biliyor",
  "kesin olarak",
];

const FORBIDDEN_TERMS: Record<AccountHandle, string[]> = {
  grafikcem: [
    "bu ne anlama geliyor",
    "clickbait",
    "kacirmayin",
    "sok edici",
    "inanilmaz",
    "devrim niteliginde",
    "oyunun kurallarini degistir",
    ...SHARED_CERTAINTY_TERMS,
  ].map(foldTurkish),
  maskulenkod: [
    "kadin dusmanligi",
    "enayi",
    "surtuk",
    "magdur edebiyati",
    "kadinlar yuzunden",
    // Değer-sıfırlama / mutlak genelleme kalıpları (safety/heuristics
    // maskulenPatterns ile hizalı — canlı "kadın düşmanlığı yazma" kuralı).
    "kadinin degeri",
    "degeri sifir",
    "biyoloji bu",
    "kadin dogasi",
    "tum kadinlar",
    "her kadin",
    "kadinlar hep",
    "kadinlar zaten",
    "terapist dili",
    "kisisel gelisim klisesi",
    "herkesin durumu farkli",
    // Terapist-dili / kişisel-gelişim klişesi marker'ları (canlı kuralın
    // metin-içi eşlenebilir halleri).
    "ic sesini dinle",
    "kendine zaman ayir",
    "kendini sev",
    "sen ozelsin",
    "kendine deger ver",
    "pozitif dusun",
    "hustle",
    "sigma",
    "alfa erkek",
    "redpill",
    "beta erkek",
    ...SHARED_CERTAINTY_TERMS,
  ].map(foldTurkish),
};

export function isKnownAccountHandle(handle: string): handle is AccountHandle {
  return handle in accountProfiles;
}

function toScoringIdentity(profile: LiveAccountProfile): ScoringIdentity {
  return {
    handle: profile.handle,
    persona: profile.persona,
    // Canlı profil ton/format bilgisini kural listeleri olarak taşır; scoring
    // bağlamı düz metin beklediği için birleştirilir.
    tone: profile.toneRules.join(" "),
    format: profile.formatRules.join(" "),
    viralMechanic: profile.concept,
    maxChars: profile.maxChars,
    forbidden: profile.forbiddenRules,
    forbiddenTerms: FORBIDDEN_TERMS[profile.handle],
    pillarIds: profile.modes.map((m) => m.id),
    concept: profile.concept,
    // Canlı profil kural metinlerinde hashtag yasağı hesap politikasıdır
    // (formatRules "soru-CTA yok" / eski generationRules.noHashtags karşılığı).
    noHashtags: true,
  };
}

export function getScoringIdentity(handle: string): ScoringIdentity {
  if (!isKnownAccountHandle(handle)) {
    throw new Error(`Bilinmeyen hesap handle'ı: ${handle}`);
  }
  return toScoringIdentity(accountProfiles[handle]);
}

export function getAllScoringIdentities(): ScoringIdentity[] {
  return Object.values(accountProfiles).map(toScoringIdentity);
}

/** Heuristik ceza eşleşmesi için kısa, fold'lanmış yasak terimler. */
export function getForbiddenTermsFromLive(handle: string): string[] {
  return getScoringIdentity(handle).forbiddenTerms;
}
