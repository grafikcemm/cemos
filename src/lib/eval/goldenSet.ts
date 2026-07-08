import { GOLD_EXAMPLES } from "@/lib/ai/prompts";

/**
 * Eval golden set standı (FIRST-SPRINT item 19).
 *
 * İki test modu:
 *  - "generate": sourceContent pipeline'dan geçirilir, üretilen taslağın critic
 *    skorları PASS satırıyla karşılaştırılır (mevcut eval standı — LLM ister).
 *  - "score_direct": sourceContent'in KENDİSİ deterministik `scoreDraftFallback`
 *    ile skorlanır (LLM YOK). Bilinen-iyi örnekler yüksek, bilinen-kötü
 *    (AI-slop / off-persona / uydurma-sayı) örnekler DÜŞÜK skorlamalı — bu,
 *    "known-bad must score low" kabulünün CI'da deterministik kapısıdır.
 *
 * Mod, expectedBehavior içindeki "MODE: score_direct" satırıyla işaretlenir;
 * eval runner bu satırı okur. Kaynaklar: prompts.ts GOLD_EXAMPLES (kürasyonlu
 * gerçek viral postlar) + hesap hook'ları + deterministik yazılmış kötü vakalar.
 */

export type GoldenCase = {
  accountHandle: "grafikcem" | "maskulenkod";
  testName: string;
  sourceContent: string;
  expectedBehavior: string;
  kind: "good_generate" | "good_direct" | "bad_direct";
};

/** Gerçek hesap hook'ları (accounts/profil kürasyonundan) — bilinen-iyi. */
const KNOWN_GOOD_HOOKS: Record<"grafikcem" | "maskulenkod", string[]> = {
  grafikcem: [
    "WhatsApp otomasyonu satan ajansların sırrı ifşa oldu. OpenWA çıktı — ücretsiz, açık kaynak, self-hosted.",
    "Bu görseli Midjourney v7 ile tek promptta çıkardım. Asıl iş prompt değil, --sref ile stil kilidinde.",
    "1400 ücretsiz API var. Hepsine tek satır kod yazmadan Claude Code ile eriştim. 2 saatte mikro SaaS.",
    "3 AI sunum aracı denedim → 29$, 19$, ücretsiz. En iyi çıktı ücretlide değil.",
    "AI tasarımda problem araç değil → kötü art direction. Araç kalitesi artıyor, zevk kalitesi artmıyor.",
    "Figma'nın yeni AI paneli 4 saatlik mockup işini 20 dakikaya indirdi. Kritik ayar: stil kütüphanesini önce sen kur.",
  ],
  maskulenkod: [
    "Çoğu erkek güçsüz kalır — ideoloji eksikliğinden değil, sistem eksikliğinden.",
    "Bu hatayı neden her erkek yapar? Çünkü disiplini hisse bağlar, sisteme değil.",
    "Şunu fark ettim: seçilmeyi bekleyen erkek zaten sıranın sonundadır.",
    "Terk edebilmeyi normalleştir. Gidemeyen adam pazarlık edemez.",
    "Sorunun red yemek değil; reddedilmeyi kimlik yarası haline getirmen.",
    "Gece 3'e kadar oyalanmanın bedeli yorgunluk değil — ertesi gün düşük statü enerjisi.",
    "Disiplin motivasyon değil, mekaniktir: alarmı odanın öbür ucuna koy, ilk 10 dakika telefon yok.",
  ],
};

/**
 * Bilinen-KÖTÜ vakalar: AI-slop klişesi / off-persona / uydurma-kesin-sayı.
 * Deterministik skorlayıcı bunlara DÜŞÜK publish/persona vermek zorunda.
 */
const KNOWN_BAD_CASES: Record<"grafikcem" | "maskulenkod", string[]> = {
  grafikcem: [
    "Yapay zeka oyunun kurallarını değiştiriyor! Bu inanılmaz devrim niteliğinde gelişmeyi kaçırmayın! Peki siz ne düşünüyorsunuz?",
    "Günaydın dünya! Pozitif enerji ile güne başla, hayat güzel! Başarı sözleri: asla pes etme, hayallerinin peşinden koş!",
    "Bu şok edici gelişme kesinlikle tartışmasız kanıtlandı: tasarımcıların %99.7'si artık işsiz kalacak!",
    "Motivasyon her şeydir! Hayallerinin peşinden koş, asla pes etme, kendine inan! Pozitif enerji!",
    "Bu araç çığır açan bir game changer! DM me detaylar için! Takipte kal!",
    "Bu inanılmaz fırsatı kaçırmayın: yapay zeka çığır açan bir devrim! Herkes konuşuyor, siz de takipte kalın! DM me!",
    "Yapay zeka öldü. Stop doing AI. Herkes eski yöntemlere dönüyor çünkü kanıtlandı.",
    "İnanılmaz! Şok edici! Bu güncellemeyi kaçırmayın! Hemen deneyin! Sizce de öyle değil mi?",
    "Tasarım dünyasında devrim niteliğinde bir gelişme yaşanıyor ve bu her şeyi sonsuza dek değiştirecek. Detaylar için okumaya devam edin.",
    "%347 verim artışı garantili bu yöntemle ayda kesinlikle 50.000$ kazanırsınız. Tartışmasız kanıtlanmış sistem!",
  ],
  maskulenkod: [
    "Herkesin durumu farklı tabii ki, kimseyi yargılamamak lazım. Belki de biraz kendine zaman ayırmalısın, iç sesini dinle.",
    "Kadınlar yüzünden hiçbir erkek başarılı olamıyor. Hepsi aynı, güvenilmez.",
    "Sigma erkek grind'ına devam! Hustle culture yaşam tarzıdır! Alfa ol, beta kalma! Redpill gerçekleri!",
    "Bugün kendini sev, kendine değer ver. Sen özelsin ve bunu hak ediyorsun. Pozitif düşün!",
    "Motivasyon videoları izle, başarı sözleri oku, hayat güzel! Asla pes etme kardeşim!",
    "Bilimsel araştırmalar kesin olarak kanıtladı: erkeklerin %94.3'ü ilk 3 saniyede reddediliyor.",
    "Kadının değeri 30 yaşından sonra sıfırlanır, biyoloji bu. Tüm kadınlar aynı programda çalışır.",
    "Bu inanılmaz disiplin sırrını kaçırma! Oyunun kurallarını değiştiren şok edici yöntem! DM me!",
    "Bu toplumda erkeklerin hiç şansı yok; kadınlar yüzünden hepimiz kaybettik. Mağdur edebiyatı değil gerçek bu, sistem bize düşman.",
    "Peki siz bu konuda ne düşünüyorsunuz? Katılıyor musunuz? Yorumlarda buluşalım, düşüncelerinizi paylaşın!",
  ],
};

const GOOD_GENERATE_PASS = "PASS: personamatch >= 60, clarity >= 60, risk <= 35";
const GOOD_DIRECT_PASS = "MODE: score_direct\nPASS: publish >= 50, risk <= 40";
const BAD_DIRECT_PASS = "MODE: score_direct\nPASS: publish <= 55 OR risk >= 45";

export function buildGoldenSeedCases(): GoldenCase[] {
  const cases: GoldenCase[] = [];
  const accounts = ["grafikcem", "maskulenkod"] as const;

  for (const handle of accounts) {
    const gold = GOLD_EXAMPLES[handle] ?? [];

    // 1) Bilinen-iyi → generation testi (kaynak: gerçek viral post; pipeline
    //    bu kaynaktan hesap sesinde güçlü taslak üretebilmeli).
    gold.forEach((example, i) => {
      cases.push({
        accountHandle: handle,
        testName: `golden:${handle}:good-gen-${i + 1}`,
        sourceContent: example,
        expectedBehavior: GOOD_GENERATE_PASS,
        kind: "good_generate",
      });
    });

    // 2) Bilinen-iyi → doğrudan skor testi (deterministik; yüksek skorlamalı).
    [...gold, ...KNOWN_GOOD_HOOKS[handle]].forEach((example, i) => {
      cases.push({
        accountHandle: handle,
        testName: `golden:${handle}:good-direct-${i + 1}`,
        sourceContent: example,
        expectedBehavior: GOOD_DIRECT_PASS,
        kind: "good_direct",
      });
    });

    // 3) Bilinen-kötü → doğrudan skor testi (deterministik; DÜŞÜK skorlamalı).
    KNOWN_BAD_CASES[handle].forEach((example, i) => {
      cases.push({
        accountHandle: handle,
        testName: `golden:${handle}:bad-direct-${i + 1}`,
        sourceContent: example,
        expectedBehavior: BAD_DIRECT_PASS,
        kind: "bad_direct",
      });
    });
  }

  return cases;
}
