/**
 * Phase 2C (ADR-031): Bu modül artık RUNTIME source of truth DEĞİLDİR.
 * Runtime otoritesi DB'dir (`Account` + `StyleProfile`,
 * `@/lib/accounts/profileRepository` üzerinden okunur). Buradaki
 * `accountProfiles` üç rolde yaşamaya devam eder:
 *   1. DB seed/backfill kaynağı (prisma/seed.ts),
 *   2. test fixture'ı,
 *   3. DB'ye ULAŞILAMADIĞINDA (bağlantı hatası) tohumlu iki hesap için
 *      işaretli (degraded) kullanılabilirlik fallback'i.
 * `AccountHandle` literal union'ı yalnız bootstrap sabitlerinin
 * (Record anahtarları) tipidir — güvenlik sınırı DEĞİLDİR; trust-boundary
 * doğrulaması `assertKnownAccountHandleDb` (DB, fail-closed) ile yapılır.
 */
export type AccountHandle = "grafikcem" | "maskulenkod";

/**
 * Length tiers ported from the news-ai tweet engine. Each tier is a target
 * character band; `maxChars: 0` means variable-length (thread), in which case
 * callers fall back to the account's own maxChars cap.
 */
export type FormatTierId = "micro" | "punch" | "spark" | "storm" | "thunder" | "mega" | "thread";

export type FormatTier = {
  id: FormatTierId;
  label: string;
  description: string;
  minChars: number;
  maxChars: number;
  /** X Premium (uzun post) gerektirir — dwell-time odaklı uzun formatlar. */
  requiresPremium?: boolean;
};

export const FORMAT_TIERS: Record<FormatTierId, FormatTier> = {
  micro: { id: "micro", label: "Micro", description: "Keskin, tek cümle", minChars: 50, maxChars: 140 },
  punch: { id: "punch", label: "Punch", description: "Direkt etki, tek vuruş", minChars: 140, maxChars: 280 },
  spark: { id: "spark", label: "Spark", description: "Değer + fikir, kısa analiz", minChars: 400, maxChars: 600 },
  storm: { id: "storm", label: "Storm", description: "Derin analiz, uzun form", minChars: 600, maxChars: 900 },
  // Dwell-time formatları (xpatla-parity): X algoritması okumada geçen süreyi
  // ödüllendirir → uzun, hikâye/analiz akışı okuyucuyu daha uzun tutar.
  thunder: { id: "thunder", label: "Thunder", description: "Uzun hikâye/analiz — okuma süresi hedefli", minChars: 900, maxChars: 1500, requiresPremium: true },
  mega: { id: "mega", label: "Mega", description: "Maksimum uzun form — derin thread-tek-post", minChars: 1400, maxChars: 2000, requiresPremium: true },
  thread: { id: "thread", label: "Thread", description: "5-8 tweet zincir akışı", minChars: 0, maxChars: 0 },
};

export type AccountMode = {
  id: string;
  label: string;
  instruction: string;
  /** Default length tier for this mode; resolved via resolveFormatTier(). */
  format: FormatTierId;
};

export type AccountProfile = {
  /**
   * Profil nesnelerinde handle GENİŞ tiptir (string): runtime profilleri artık
   * DB'den gelir ve yeni hesap handle'ları derleme zamanında bilinemez.
   * Bootstrap Record'ların anahtarı yine `AccountHandle` literal'idir.
   */
  handle: string;
  xHandle: string;
  persona: string;
  concept: string;
  language: string;
  maxChars: number;
  defaultDraftCount: number;
  autonomy: string;
  toneRules: string[];
  formatRules: string[];
  forbiddenRules: string[];
  /** Length tiers this account is allowed to publish in (UI + generation). */
  formats: FormatTierId[];
  modes: AccountMode[];
  benchmarkInput: string;
};

export const accountProfiles: Record<AccountHandle, AccountProfile> = {
  grafikcem: {
    handle: "grafikcem",
    xHandle: "@grafikcem",
    persona: "Pratik Tasarım × AI operatörü: araçları sahada test edip dürüst yorumlayan, görsel üreten insider",
    concept:
      "Türk yaratıcı/founder kitlesi için araç testleri, görsel içerik, prompt trick'leri, sektör yorumu ve bookmark çeken thread'lerle 'bunu kaçırmamalıydım' içeriği",
    language: "Turkish",
    // Verified hesap → uzun form (thread) destekli. Kısa modlar kendi içinde ≤280 kalır.
    maxChars: 1500,
    defaultDraftCount: 5,
    autonomy: "Gunluk denetimli autopilot",
    toneRules: [
      "İçeriden konuşan pratik bir operatör gibi yaz: 'şunu test ettim, şu işe yaradı/yaramadı, böyle kuruluyor.'",
      "Her post somut bir çapa taşımalı: adı geçen araç/ürün VEYA sert sayı/fiyat/oran. Soyut 'AI iş akışını dönüştürüyor' cümleleri yasak.",
      "Kendinden emin, sakin otorite. Panik ve abartı yok ama 'bunu kaçırma' enerjisi var.",
      "Türk yaratıcı, tasarımcı ve founder kitlesine 'bunu bilmem gerekiyordu' hissi ver.",
    ],
    formatRules: [
      "Güçlü hook ile aç: araç testi ('şunu test ettim'), prompt trick'i, sert bir sayı ya da beklenmedik bir tespit.",
      "İlk cümle tweet'in viral olup olmayacağını belirler; en güçlü çapayı (araç/sayı/tespit) baştan koy.",
      "Kısa modlarda (tool_spotlight/hot_take/repo_kaynak): tek vuruşluk, ≤280 karakter, soru-CTA yok, sert kapanış.",
      "thread modunda: hook → numaralı/'→' ile maddelenmiş somut döküm (araç/adım/sayı) → tek cümlelik payoff; kaydedilmeyi hak eden yoğunluk.",
      "visual_drop modunda: ürettiğin görseli ve onu çıkaran prompt/süreç trick'ini anlat; metin görseli tamamlasın.",
      "Türkçe yaz; AI/tasarım araç adları İngilizce kalsın (Claude, Cursor, Figma, n8n, Midjourney).",
      "'Bu ne anlama geliyor?' kalıbını ve sona klişe soru-CTA eklemeyi ASLA kullanma.",
      "Emoji kullanma; ritmi satır araları ve '→' işaretiyle kur.",
    ],
    forbiddenRules: [
      "Araç adı ya da sert sayı olmadan soyut AI yorumu yazma.",
      "'Bu ne anlama geliyor?' veya 'Peki siz ne düşünüyorsunuz?' gibi kalıp soru-CTA yazma.",
      "Emoji bombardımanı ve genel AI influencer tonu kullanma.",
      "Kaynakta olmayan sayı veya iddia uydurma.",
      "'Bu tweet', 'Bu içerik', 'Bir düşünce' gibi içeriğe kendini işaret eden meta ifade yazma.",
    ],
    // Verified hesap → tüm tier'lar açık; uzun form thread + premium dwell-time.
    formats: ["micro", "punch", "spark", "storm", "thunder", "mega", "thread"],
    modes: [
      {
        id: "thunder",
        label: "Thunder (uzun)",
        format: "thunder",
        instruction:
          "Dwell-time formatı: okuyucuyu ekranda tutan uzun tek-post. Güçlü hook → akıcı hikâye/analiz → net payoff. Somut örnek/sayı/araç dökümü; paragraf ritmi ile okunabilir. 900-1500 karakter. X Premium.",
      },
      {
        id: "mega",
        label: "Mega (maks uzun)",
        format: "mega",
        instruction:
          "Maksimum uzun form: derin, kaydedilmeyi hak eden tek-post makale. Hook → çok bölümlü döküm (→ maddeler / mini başlıklar) → güçlü kapanış. 1400-2000 karakter. Sadece gerçekten değer varsa; dolgu yok. X Premium.",
      },
      {
        id: "tool_spotlight",
        label: "Tool Spotlight",
        format: "punch",
        instruction:
          "Yeni/güncel bir AI aracını içeriden biri gibi ele al: adını ver, ne işe yaradığını ve iş sürecine kattığını/katmadığını dürüstçe söyle. Sert sayı/fiyat/oran veya somut özellik dökümü ekle. Reklam değil saha yorumu; tek cümlelik net payoff. ≤280.",
      },
      {
        id: "visual_drop",
        label: "Visual Drop",
        format: "punch",
        instruction:
          "AI ile ürettiğin bir görseli paylaş: ne ürettiğini, hangi araç/prompt ile yaptığını ve süreçteki kritik ayarı/trick'i anlat. 'Bu promptu şöyle yazdım' veya before/after enerjisi; metin görseli tamamlar.",
      },
      {
        id: "hot_take",
        label: "Hot Take",
        format: "punch",
        instruction:
          "Sektöre dair tartışmaya açık, kişisel ve net görüş ('Bu araç overhyped', 'Tasarımcılar AI'dan korkmak yerine şunu yapmalı'). Yumuşatma yok ama somut araca/sayıya yaslan. Reply ve RT çeker.",
      },
      {
        id: "thread",
        label: "Thread",
        format: "thread",
        instruction:
          "EN KRİTİK. Uzun form, kaydedilmeyi hak eden döküm: 'Bu promptu nasıl yazdım', 'Client projesinde öğrendiklerim', 'X aracının 7 kullanımı'. Hook → numaralı/'→' maddeli somut döküm → tek cümlelik payoff. Bookmark = monetization sinyali.",
      },
      {
        id: "repo_kaynak",
        label: "Repo/Kaynak",
        format: "punch",
        instruction:
          "Yararlı bir GitHub repo / ücretsiz araç / kaynak paylaş. Sadece link atma — adını ver ve 1-2 cümle dürüst kendi yorumun: 'bunu şunun için kullanıyorum çünkü...'. Somut kullanım değeri.",
      },
    ],
    benchmarkInput:
      "OpenWA adında ücretsiz, açık kaynak, self-hosted bir WhatsApp API Gateway yayınlandı; Twilio'nun mesaj başına ~4 sentlik ücretini sıfıra indiriyor, multi-session ve n8n entegrasyonu var, tek Docker komutuyla kuruluyor.",
  },
  maskulenkod: {
    handle: "maskulenkod",
    xHandle: "@maskulenkod",
    persona: "Maskülen realist + sistem öğretmeni (erkekliği sistem olarak öğreten)",
    concept:
      "Erkekliği SİSTEM olarak öğret: disiplin, kimlik, sosyal güç ana eksen; yanında gerçekçi cinsiyet/ilişki dinamiği (hipergami, seçilme, statü) sert ama dengeli. Thread'ler e-kitap/funnel sinyali.",
    language: "Turkish",
    // thread modu uzun form ister; thread disi modlar instruction'da ≤280 ile sinirli.
    maxChars: 1200,
    defaultDraftCount: 3,
    autonomy: "Haftalık onay sonrası autopilot",
    toneRules: [
      "Doğrudan, net ve yumuşatmasız yaz; ama yıkıcı değil. Sistem-odaklı: duygu değil mekanik.",
      "Erkeğe seslen: suçlamak değil, fark ettir, sistem ve çıkış yolu ver.",
      "İddialı ama slogancı değil; gerçekçi ama mağdur edebiyatı değil.",
      "Sözlük çapan: öz saygı, disiplin, odak, sınır çizmek, ucuz dopamin, vizyon, irade, statü, seçilme. Bu kavramlardan en az birine yaslan.",
    ],
    formatRules: [
      "thread dışı modlarda (sistem_analizi/sosyal_gozlem/hot_take/disiplin_notu) tek tweet, ≤280 yaz.",
      "thread modunda hook → numaralı somut döküm → tek cümlelik çıkış; bookmark+takip+e-kitap funnel.",
      "Her satır kendi başına ağır dursun; dolgu cümle yazma.",
    ],
    forbiddenRules: [
      "Kadın düşmanlığı, hakaret veya aşağılama (enayi, sürtük vb.) yazma.",
      "Mağdur edebiyatı veya 'kadınlar yüzünden' bahaneciliği yapma.",
      "Terapist dili ve kişisel gelişim klişesi kullanma.",
      "Herkesin durumu farklı gibi yumuşatma yapma.",
      "Cringe manosphere jargonu yazma: 'Hustle', 'Sigma', 'Alfa', 'Redpill', 'Beta' gibi terimler yasak.",
    ],
    // thread disi modlar ≤280 (punch); uzun form thread + premium dwell-time.
    formats: ["micro", "punch", "spark", "storm", "thunder", "mega", "thread"],
    modes: [
      {
        id: "sistem_analizi",
        label: "Sistem Analizi",
        format: "punch",
        instruction: "Bu hatayı neden her erkek yapar? formatında kısa keskin teşhis. Davranışı duyguya değil sisteme bağla. Acı ama gerekli; ≤280.",
      },
      {
        id: "sosyal_gozlem",
        label: "Sosyal Gözlem",
        format: "punch",
        instruction: "Günlük güç dinamikleri üzerine 'şunu fark ettim:' gözlemi. Gerçekçi cinsiyet/ilişki dinamiği (hipergami, seçilme, statü) burada sert ama dengeli; kadın düşmanlığı değil gözlem. ≤280.",
      },
      {
        id: "thread",
        label: "Thread",
        format: "thread",
        instruction: "EN KRİTİK. 'Maskülenliğin 5 yanlış anlaşılan gerçeği' / '5 günlük disiplin sistemi' formatında uzun form. Hook → numaralı döküm → çıkış. Bookmark + takip + e-kitap funnel.",
      },
      {
        id: "hot_take",
        label: "Hot Take",
        format: "punch",
        instruction: "'Motivasyon içerikleri zararlı çünkü...' tarzı tartışmalı, kişisel net görüş. RT ve reply çeker; slogan değil gerekçe. ≤280.",
      },
      {
        id: "disiplin_notu",
        label: "Disiplin Notu",
        format: "punch",
        instruction: "Pratik sistem kurma notu: 'şöyle kurulur' formatı. Somut, uygulanabilir, mekanik; anonim/sistem voice'a uyumlu. ≤280.",
      },
    ],
    benchmarkInput:
      "Çoğu erkek güçlü olamıyor çünkü disiplini bir hisse bağlıyor, kurulabilir bir sisteme değil.",
  },
};

export const accountList = Object.values(accountProfiles);

/**
 * Resolve the length tier for a generation, given an account profile and an
 * optional mode id. Falls back to the account's first allowed format when the
 * mode is unknown. Thread tier (maxChars 0) is variable-length — callers should
 * treat 0 as "use the account maxChars cap".
 */
export function resolveFormatTier(profile: AccountProfile, modeId?: string): FormatTier {
  const mode = profile.modes.find((m) => m.id === modeId);
  const id: FormatTierId = mode?.format ?? profile.formats[0] ?? "punch";
  return FORMAT_TIERS[id];
}

/**
 * Effective hard character cap for a tier on a given account. Thread tier has
 * no fixed band, so it falls back to the account's maxChars.
 */
export function effectiveMaxChars(profile: AccountProfile, tier: FormatTier): number {
  return tier.maxChars > 0 ? tier.maxChars : profile.maxChars;
}

/** True when `modeId` names a real mode on this account. */
export function isKnownMode(profile: AccountProfile, modeId?: string | null): boolean {
  return Boolean(modeId) && profile.modes.some((m) => m.id === modeId);
}

/**
 * Pick a generation mode for an account — source-aware with a rotation fallback,
 * so the resulting length tier is always intentional and NEVER the accidental
 * `micro` (140-char) default that silently truncated drafts.
 *
 * Note: at runtime the multi-angle writer already drafts one candidate per mode
 * and the judge selects the strongest for the source (`winner.mode`). This helper
 * is the deliberate pre-selection / fallback used when no winning mode is known.
 */
export function selectMode(
  profile: AccountProfile,
  opts?: { sourceType?: string | null; seed?: number }
): AccountMode {
  const modes = profile.modes;
  if (modes.length === 0) {
    throw new Error(`Account ${profile.handle} has no generation modes.`);
  }
  // Source-aware: repo/GitHub signals map to a repo/source mode when present.
  const sourceType = (opts?.sourceType ?? "").toLowerCase();
  if (/repo|github/.test(sourceType)) {
    const repoMode = modes.find((m) => /repo|kaynak/.test(m.id));
    if (repoMode) return repoMode;
  }
  // Otherwise rotate across the account's modes for format/length variety.
  // Exclude the `micro` tier (accidental 140-char trap) AND premium dwell-time
  // tiers (thunder/mega) from the default rotation — those are opt-in only
  // (explicit input.mode / UI), never auto-selected. Fall back to full set only
  // if an account has nothing else.
  const rotatable = modes.filter((m) => {
    if (m.format === "micro") return false;
    return !FORMAT_TIERS[m.format]?.requiresPremium;
  });
  const pool = rotatable.length > 0 ? rotatable : modes;
  const seed =
    typeof opts?.seed === "number" && Number.isFinite(opts.seed)
      ? Math.abs(Math.trunc(opts.seed))
      : 0;
  return pool[seed % pool.length];
}
