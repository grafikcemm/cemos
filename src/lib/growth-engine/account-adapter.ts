import {
  accountProfiles,
  selectMode,
  FORMAT_TIERS,
  type AccountHandle,
  type AccountProfile as LiveAccountProfile,
} from "@/lib/accounts";

/**
 * Tek hesap kimliği adapter'ı (FIRST-SPRINT item 6 → Sprint 2 emeklilik).
 *
 * Growth-engine bileşenleri hesap kimliğini CANLI kaynaktan (`@/lib/accounts`)
 * alır. Growth-engine'in eski `account-profiles.ts` kopyası Sprint 2'de
 * SİLİNDİ — tüm tüketiciler (scoring, pattern-extractor, context-builder,
 * API rotaları) bu adapter üzerinden canlı profile bağlanır. İki profil
 * evreni arasındaki alan eşlemesi tek yerde, burada yaşar.
 */

export type ScoringIdentity = {
  handle: string;
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

/**
 * BOOTSTRAP-uyumluluk guard'ı (ADR-031): handle'ın TOHUMLU literal union'da
 * olup olmadığını söyler. Heuristik/scoring bağlamlarında tip daraltma için
 * kalır (fail-soft tüketiciler). GÜVENLİK/trust-boundary doğrulaması için
 * KULLANILMAZ — orada `assertKnownAccountHandleDb` (DB, fail-closed) geçerlidir.
 */
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
    // Tohumlu olmayan (yeni DB) hesapta hesap-özel kısa terim eşlemesi henüz
    // yoktur → paylaşılan kesinlik-slop terimleriyle fail-soft başlar.
    forbiddenTerms:
      FORBIDDEN_TERMS[profile.handle as AccountHandle] ?? SHARED_CERTAINTY_TERMS.map(foldTurkish),
    pillarIds: profile.modes.map((m) => m.id),
    concept: profile.concept,
    // Canlı profil kural metinlerinde hashtag yasağı hesap politikasıdır
    // (formatRules "soru-CTA yok" / eski generationRules.noHashtags karşılığı).
    noHashtags: true,
  };
}

// ── Phase 2C (ADR-031): DB-otoriteli async resolvers ─────────────────────────
// Trust boundary + üretim girişi bunları kullanır; aşağıdaki sync fonksiyonlar
// bootstrap-uyumluluk katmanı olarak kalır (heuristik bağlamlar + fixture).

export {
  isKnownAccountHandleDb,
  assertKnownAccountHandleDb,
  AccountProfileError,
} from "@/lib/accounts/profileRepository";

/** DB'den doğrulanmış runtime profil → ScoringIdentity. */
export async function resolveScoringIdentity(handle: string): Promise<ScoringIdentity> {
  const { getRuntimeProfile } = await import("@/lib/accounts/profileRepository");
  const runtime = await getRuntimeProfile(handle);
  return toScoringIdentity(runtime);
}

/** DB'den doğrulanmış runtime profil → GenerationProfile (üretim-hazır şart). */
export async function resolveGenerationProfile(handle: string): Promise<GenerationProfile> {
  const { getRuntimeProfile } = await import("@/lib/accounts/profileRepository");
  const runtime = await getRuntimeProfile(handle, { requireGenerationReady: true });
  return {
    handle: runtime.handle,
    displayName: runtime.displayName || getDisplayName(runtime.handle),
    persona: runtime.persona,
    description: runtime.concept,
    language: runtime.language,
    tone: runtime.toneRules.join(" "),
    format: runtime.formatRules.join(" "),
    viralMechanic: runtime.concept,
    forbidden: runtime.forbiddenRules,
    maxChars: runtime.maxChars,
    modes: runtime.modes.map(toGenerationMode),
    generationRules: GENERATION_RULES[runtime.handle as AccountHandle] ?? DEFAULT_GENERATION_RULES,
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

// ---------------------------------------------------------------------------
// Üretim-yolu profil köprüsü (Sprint 2: account-profiles.ts emekliliği)
// ---------------------------------------------------------------------------

/** Bilinen hesap handle listesi — canlı kaynaktan türetilir. */
export const ACCOUNT_HANDLES = Object.keys(accountProfiles) as AccountHandle[];

const DISPLAY_NAMES: Record<AccountHandle, string> = {
  grafikcem: "GrafikCem",
  maskulenkod: "MaskulenKod",
};

/** UI görünen adı; bilinmeyen handle olduğu gibi döner (fail-soft). */
export function getDisplayName(handle: string): string {
  return isKnownAccountHandle(handle) ? DISPLAY_NAMES[handle] : handle;
}

export type GenerationMode = {
  id: string;
  label: string;
  instruction: string;
  /** Bu modda taslakla birlikte image-gen promptu üretilir. */
  emitsImagePrompt?: boolean;
  /** Uzun form (thread/thunder/mega): tek-tweet sınırını aşabilir. */
  longForm?: boolean;
};

/**
 * Growth-engine üretim yolunun (context-builder / draft-generator prompt'u)
 * beklediği profil şekli — canlı `@/lib/accounts` profilinden türetilir.
 * Eski account-profiles.ts alan adlarıyla uyumludur (davranış korunur).
 */
export type GenerationProfile = {
  handle: string;
  displayName: string;
  persona: string;
  description: string;
  language: string;
  tone: string;
  format: string;
  viralMechanic: string;
  forbidden: string[];
  maxChars: number;
  modes: GenerationMode[];
  generationRules: {
    requireHook: boolean;
    singleTweet: boolean;
    requireConcreteAnchor: boolean;
    noHashtags: boolean;
    allowEmoji?: boolean;
    allowStructure?: boolean;
  };
};

/**
 * Eski account-profiles.ts generationRules değerleri — davranış birebir
 * korunur (canlı profilde karşılığı olmayan üretim bayrakları burada yaşar).
 */
/** Tohumlu olmayan hesap için güvenli üretim bayrakları (muhafazakâr default). */
const DEFAULT_GENERATION_RULES: GenerationProfile["generationRules"] = {
  requireHook: true,
  singleTweet: false,
  requireConcreteAnchor: false,
  noHashtags: true,
  allowStructure: true,
};

const GENERATION_RULES: Record<AccountHandle, GenerationProfile["generationRules"]> = {
  grafikcem: {
    requireHook: true,
    singleTweet: false,
    requireConcreteAnchor: true,
    noHashtags: true,
    allowStructure: true,
  },
  maskulenkod: {
    requireHook: true,
    singleTweet: true,
    requireConcreteAnchor: false,
    noHashtags: true,
    allowStructure: true,
  },
};

function toGenerationMode(mode: LiveAccountProfile["modes"][number]): GenerationMode {
  const tier = FORMAT_TIERS[mode.format];
  // thread (maxChars 0) ve premium dwell-time tier'ları uzun formdur.
  const isLongForm = tier ? tier.maxChars === 0 || tier.maxChars > 600 : false;
  return {
    id: mode.id,
    label: mode.label,
    instruction: mode.instruction,
    ...(mode.id === "visual_drop" ? { emitsImagePrompt: true } : {}),
    ...(isLongForm ? { longForm: true } : {}),
  };
}

export function getGenerationProfile(handle: string): GenerationProfile {
  if (!isKnownAccountHandle(handle)) {
    throw new Error(`Bilinmeyen hesap handle'ı: ${handle}`);
  }
  const live = accountProfiles[handle];
  return {
    handle: live.handle,
    displayName: getDisplayName(live.handle),
    persona: live.persona,
    description: live.concept,
    language: "Turkish",
    tone: live.toneRules.join(" "),
    format: live.formatRules.join(" "),
    viralMechanic: live.concept,
    forbidden: live.forbiddenRules,
    maxChars: live.maxChars,
    modes: live.modes.map(toGenerationMode),
    generationRules: GENERATION_RULES[live.handle as AccountHandle] ?? DEFAULT_GENERATION_RULES,
  };
}

/**
 * Varsayılan üretim modu — canlı `selectMode` üzerinden (micro tuzağı ve
 * premium dwell-time tier'ları varsayılan rotasyona GİRMEZ; eski
 * account-profiles varsayılanlarıyla uyumlu: grafikcem→tool_spotlight,
 * maskulenkod→sistem_analizi).
 */
export function getDefaultGenerationMode(handle: string): GenerationMode {
  if (!isKnownAccountHandle(handle)) {
    throw new Error(`Bilinmeyen hesap handle'ı: ${handle}`);
  }
  return toGenerationMode(selectMode(accountProfiles[handle], { seed: 0 }));
}
