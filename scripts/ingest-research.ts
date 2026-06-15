/**
 * One-shot research ingest (Öğrenme Motoru v3): 2026 derin araştırma raporunun
 * yapılandırılmış çıktısını öğrenme motoruna işler.
 *
 *   - 29 ViralPattern  (B bölümü; bestFor "both" → iki hesaba da satır)
 *   - 12 negatif TrainingExample (H bölümü; label="bad" + embedding best-effort)
 *   - 10 EvalTest golden case   (I bölümü; runner: scripts/run-eval-tests.ts)
 *
 * Idempotent: pattern (accountId, patternName), negatif (accountId, outputContent),
 * eval (testName) üzerinden mevcut satır varsa atlanır — re-run güvenli no-op.
 *
 *   npx tsx scripts/ingest-research.ts          # dry-run (ne yazılacağını listeler)
 *   npx tsx scripts/ingest-research.ts --commit # DB'ye yazar
 *
 * Embedding OPENROUTER_API_KEY yoksa local_fallback ile çalışır; her durumda
 * best-effort (hata ingest'i durdurmaz).
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { prisma } from "../src/lib/db/client";
import { viralPatternRepo } from "../src/lib/db/viralPatternRepo";
import { trainingExampleRepo } from "../src/lib/db/trainingExampleRepo";
import { evalTestRepo } from "../src/lib/db/evalTestRepo";
import { embedTrainingExample } from "../src/lib/growth-engine/vector-memory";

const COMMIT = process.argv.includes("--commit");

type Handle = "grafikcem" | "maskulenkod";

type ResearchPattern = {
  patternName: string;
  platform: "x" | "instagram" | "youtube";
  hookType: string;
  structure: string;
  emotion: string;
  viralityTrigger: string;
  successScore: number;
  exampleGood: string;
  exampleBad: string;
  bestFor: Handle | "both";
  mapsToMode: Partial<Record<Handle, string | null>>;
  riskNote: string;
  confidence: number;
};

// --- B bölümü: viral pattern kütüphanesi (2026 derin araştırma raporu) ---
const PATTERNS: ResearchPattern[] = [
  {
    patternName: "Hype Değil Test Sonucu",
    platform: "x",
    hookType: "kontra-sezgisel iddia",
    structure: "soğuk hook -> araç adı -> gerçek test sonucu -> ne işe yarar/neye yaramaz -> kapanış payoff",
    emotion: "güven",
    viralityTrigger: "bookmark + repost",
    successScore: 91,
    exampleGood:
      "Midjourney değil -> bu hafta en faydalı görsel araç Krea oldu. Sebep: 14 dakikada 6 banner varyasyonu çıkardı, ama tipografi hâlâ zayıf.",
    exampleBad: "Bu AI aracı oyunu değiştiriyor.",
    bestFor: "grafikcem",
    mapsToMode: { grafikcem: "tool_spotlight" },
    riskNote: "Aşırı övgü güveni öldürür; isim ve test koşulu vermeden paylaşma.",
    confidence: 88,
  },
  {
    patternName: "Sayıyla Kıyas",
    platform: "x",
    hookType: "sayı/liste",
    structure: "hook -> 2-3 araç/opsiyon -> fiyat veya süre kıyası -> kısa hüküm",
    emotion: "kontrol duygusu",
    viralityTrigger: "bookmark",
    successScore: 89,
    exampleGood:
      "3 AI sunum aracı denedim -> 29$, 19$, ücretsiz. En iyi çıktı ücretlide değil, en hızlı sonuç Gamma sınıfında.",
    exampleBad: "En iyi 5 AI aracı burada.",
    bestFor: "grafikcem",
    mapsToMode: { grafikcem: "tool_spotlight" },
    riskNote: "Karşılaştırma kriteri yoksa clickbait görünür.",
    confidence: 85,
  },
  {
    patternName: "Before Sonra Teardown",
    platform: "instagram",
    hookType: "before-after",
    structure: "ilk slide problem -> ara slide süreç -> son slide sonuç + neden tuttu",
    emotion: "kanıt",
    viralityTrigger: "save",
    successScore: 93,
    exampleGood:
      "1. slide kötü thumbnail/görsel, 2-5. slide düzenleme kararları, son slide net sonuç ve prompt.",
    exampleBad: "Sadece iki görsel koyup 'önce/sonra' demek.",
    bestFor: "grafikcem",
    mapsToMode: { grafikcem: "visual_drop" },
    riskNote: "Süreç adımı ve karar mantığı yoksa save oranı düşer.",
    confidence: 90,
  },
  {
    patternName: "Kaynak Yığını",
    platform: "x",
    hookType: "liste",
    structure: "hook -> 5-10 kaynak -> her birine tek cümle açıklama -> kısa kullanım senaryosu",
    emotion: "kıtlık/keşif",
    viralityTrigger: "bookmark + follow",
    successScore: 95,
    exampleGood:
      "Tasarımcı için 7 ücretsiz AI kaynak -> mockup, font pairing, prompt varlıkları, ikon setleri...",
    exampleBad: "Birkaç faydalı link bırakıyorum.",
    bestFor: "grafikcem",
    mapsToMode: { grafikcem: "repo_kaynak" },
    riskNote: "Link çöplüğü olursa düşük clarity; her maddeye kullanım nedeni yaz.",
    confidence: 92,
  },
  {
    patternName: "Saha Günlüğü Thread",
    platform: "x",
    hookType: "itiraf + süreç",
    structure: "hook -> gün/hafta hedefi -> deneme notları -> beklenmeyen sonuç -> uygulanabilir dersler",
    emotion: "yakınlık",
    viralityTrigger: "bookmark + reply",
    successScore: 90,
    exampleGood:
      "7 gün boyunca sadece AI ile kreatif üretmeye çalıştım -> 4 şey hızlandı, 3 şey bozuldu.",
    exampleBad: "Bugün yine AI denedim, ilginçti.",
    bestFor: "grafikcem",
    mapsToMode: { grafikcem: "thread" },
    riskNote: "Sadece günlük tutma; her tweette veri veya karar olsun.",
    confidence: 86,
  },
  {
    patternName: "Herkesin Övdüğü Şeyin Zayıf Tarafı",
    platform: "x",
    hookType: "hot take",
    structure: "kontra hook -> popüler inanış -> zayıf halka -> alternatif çerçeve",
    emotion: "sürtünme",
    viralityTrigger: "reply + repost",
    successScore: 87,
    exampleGood:
      "AI tasarımda problem araç değil -> kötü art direction. Araç kalitesi artıyor, zevk kalitesi artmıyor.",
    exampleBad: "Herkes yanlış yapıyor.",
    bestFor: "both",
    mapsToMode: { grafikcem: "hot_take", maskulenkod: "hot_take" },
    riskNote: "Sadece öfke üretirse reply-bait'e döner; çözüm ver.",
    confidence: 84,
  },
  {
    patternName: "Tek Ekran Tek İçgörü",
    platform: "x",
    hookType: "gözlem",
    structure: "ekran/görsel -> tek cümle yorum -> sonuç",
    emotion: "merak",
    viralityTrigger: "like + bookmark",
    successScore: 78,
    exampleGood:
      "Araç analytics ekranı + 'Bu grafikte asıl sinyal maliyet değil tekrar kullanım oranı.'",
    exampleBad: "Açıklamasız ekran görüntüsü.",
    bestFor: "grafikcem",
    mapsToMode: { grafikcem: "visual_drop" },
    riskNote: "Bağlam yoksa düşük clarity.",
    confidence: 80,
  },
  {
    patternName: "Fiyatın Arkasındaki Maliyet",
    platform: "x",
    hookType: "teşhis",
    structure: "fiyat/sayı -> gizli maliyet -> örnek -> karar kuralı",
    emotion: "uyanış",
    viralityTrigger: "bookmark",
    successScore: 83,
    exampleGood:
      "Aylık 20$ düşük gibi görünüyor ama ekipte 5 kişiysen asıl maliyet prompt kaosu.",
    exampleBad: "Bu araç pahalı.",
    bestFor: "grafikcem",
    mapsToMode: { grafikcem: "hot_take" },
    riskNote: "Somut senaryo yoksa iddia havada kalır.",
    confidence: 82,
  },
  {
    patternName: "Yanlış Soruyu Soruyorsun",
    platform: "x",
    hookType: "düşman belirle",
    structure: "hook -> yanlış soru -> doğru soru -> neden -> payoff",
    emotion: "aydınlanma",
    viralityTrigger: "reply",
    successScore: 86,
    exampleGood:
      "Soru 'hangi AI aracı' değil -> 'hangi iş akışında insan darboğazı var?'",
    exampleBad: "Doğru soru şu.",
    bestFor: "both",
    mapsToMode: { grafikcem: "hot_take", maskulenkod: "sistem_analizi" },
    riskNote: "Çok öğretmenvari ton itici olabilir.",
    confidence: 88,
  },
  {
    patternName: "Mini Çerçeve Carousel",
    platform: "instagram",
    hookType: "teşhis",
    structure: "slide1 sert problem -> 3-6 slide çerçeve -> son slide kısa uygulama",
    emotion: "netlik",
    viralityTrigger: "save + share",
    successScore: 92,
    exampleGood:
      "Neden tasarımların profesyonel görünmüyor? 4 sebep -> spacing, hierarchy, contrast, copy.",
    exampleBad: "Aşırı metin dolu ve kararsız slide dizisi.",
    bestFor: "both",
    mapsToMode: { grafikcem: "visual_drop", maskulenkod: "sistem_analizi" },
    riskNote: "Slide başına bir fikirden fazla yükleme yapma.",
    confidence: 91,
  },
  {
    patternName: "Prompt ile Sonuç Arası Köprü",
    platform: "instagram",
    hookType: "sır-ifşası",
    structure: "hook -> final görsel -> prompt mantığı -> varyasyon kuralları",
    emotion: "erişim hissi",
    viralityTrigger: "save",
    successScore: 88,
    exampleGood: "Sonuç görsel + prompt parçalama + 'hangi kelime neyi değiştirdi'.",
    exampleBad: "Tek satır prompt dump.",
    bestFor: "grafikcem",
    mapsToMode: { grafikcem: "visual_drop" },
    riskNote: "Kopyalanabilir ama aktarılamaz promptlar itibar kaybı yaratır.",
    confidence: 87,
  },
  {
    patternName: "Deney Sonucu Reel",
    platform: "instagram",
    hookType: "deney",
    structure: "ilk 2 sn sonuç -> ne test edildi -> hızlandırılmış kanıt -> kısa hüküm",
    emotion: "merak",
    viralityTrigger: "share",
    successScore: 84,
    exampleGood:
      "3 tasarım AI'ını aynı brief ile koştum -> kazanan beklediğim araç olmadı.",
    exampleBad: "Uzun intro ve sonunda sonuç söylemek.",
    bestFor: "grafikcem",
    mapsToMode: { grafikcem: "tool_spotlight" },
    riskNote: "İlk 2 saniyede sonuç yoksa skip artar.",
    confidence: 83,
  },
  {
    patternName: "Acı Teşhis Sonra Yol Haritası",
    platform: "x",
    hookType: "teşhis",
    structure: "sert teşhis -> neden böyle -> 3 adım çıkış -> kapanış ilke",
    emotion: "rahatsızlık + umut",
    viralityTrigger: "bookmark + follow",
    successScore: 94,
    exampleGood:
      "Sorunun kadınlar değil -> statün yok, ritmin yok, sınırların yok. Çıkış yolu 3 parça.",
    exampleBad: "Tek tarafı suçlayan rant.",
    bestFor: "maskulenkod",
    mapsToMode: { maskulenkod: "thread" },
    riskNote: "Hakaret ve genellemeye kayarsa reach ve itibar yanar.",
    confidence: 90,
  },
  {
    patternName: "Statü Maliyeti",
    platform: "x",
    hookType: "sayı/maliyet",
    structure: "hook -> görünmez bedel -> örnek davranış -> tek cümle ders",
    emotion: "uyanış",
    viralityTrigger: "bookmark",
    successScore: 86,
    exampleGood:
      "Gece 3'e kadar oyalanmanın bedeli yorgunluk değil -> ertesi gün düşük statü enerjisi.",
    exampleBad: "Disiplinli ol.",
    bestFor: "maskulenkod",
    mapsToMode: { maskulenkod: "disiplin_notu" },
    riskNote: "Soyut vaaz tonuna dönme.",
    confidence: 87,
  },
  {
    patternName: "Sistem Haritası Thread",
    platform: "x",
    hookType: "çerçeve",
    structure: "hook -> sistemin parçaları -> her parçaya kısa açıklama -> son tweet uygulama sırası",
    emotion: "kontrol",
    viralityTrigger: "bookmark",
    successScore: 93,
    exampleGood:
      "Erkekliği motivasyon değil sistem olarak kur: beden, gelir, çerçeve, çevre, söz.",
    exampleBad: "'Erkeklik önemlidir' gibi havada giriş.",
    bestFor: "maskulenkod",
    mapsToMode: { maskulenkod: "thread" },
    riskNote: "Terapist dili veya slogan dili düşürür.",
    confidence: 91,
  },
  {
    patternName: "Gözlemden İlkeye",
    platform: "x",
    hookType: "sosyal gözlem",
    structure: "gündelik gözlem -> altındaki dinamik -> ilke -> ne yapmalı",
    emotion: "tanınma",
    viralityTrigger: "reply + repost",
    successScore: 85,
    exampleGood:
      "En çok konuşan erkek genelde en güçlü değil; çoğu zaman onay açlığını gizliyor.",
    exampleBad: "Düz yargı: 'sessiz erkekler kazanır'.",
    bestFor: "maskulenkod",
    mapsToMode: { maskulenkod: "sosyal_gozlem" },
    riskNote: "Anekdotu evrensel yasa diye sunma.",
    confidence: 82,
  },
  {
    patternName: "Zayıf Güne Talimat",
    platform: "instagram",
    hookType: "disiplin",
    structure: "slide1 problem -> 3-5 slide uygulanacak protokol -> son slide kısa emir cümlesi",
    emotion: "güven",
    viralityTrigger: "save",
    successScore: 88,
    exampleGood: "İrade düştüğünde uygulanacak 5 dakikalık reset protokolü.",
    exampleBad: "Motive edici boş sözler.",
    bestFor: "maskulenkod",
    mapsToMode: { maskulenkod: "disiplin_notu" },
    riskNote: "Aşırı sert ton paylaşımı düşürebilir; çözüm net olmalı.",
    confidence: 86,
  },
  {
    patternName: "Erkeklikte Yanlış Düşman",
    platform: "x",
    hookType: "karşı-sezgisel iddia",
    structure: "hook -> yanlış suçlu -> asıl sebep -> örnek -> çıkış",
    emotion: "şok",
    viralityTrigger: "reply",
    successScore: 84,
    exampleGood:
      "Sorunun red yemek değil; reddedilmeyi kimlik yarası haline getirmen.",
    exampleBad: "'Kadınlar şöyle' diye başlayan genelleme.",
    bestFor: "maskulenkod",
    mapsToMode: { maskulenkod: "hot_take" },
    riskNote: "Misojini çizgisine yaklaşırsa policy ve marka riski doğurur.",
    confidence: 89,
  },
  {
    patternName: "Net Çerçeve Reeli",
    platform: "instagram",
    hookType: "teşhis",
    structure: "ilk 2 sn sert cümle -> 3 kısa beat -> kapatan cümle",
    emotion: "sarsılma",
    viralityTrigger: "share",
    successScore: 81,
    exampleGood: "Öz güven konuşmakla gelmez -> tutulan sözden gelir.",
    exampleBad: "20 saniye girizgâh, sonra lafı dağıtmak.",
    bestFor: "maskulenkod",
    mapsToMode: { maskulenkod: "hot_take" },
    riskNote: "Vaaz tonuna girerse yorum değil swipe alır.",
    confidence: 79,
  },
  {
    patternName: "Aracı Değil İşi Sat",
    platform: "youtube",
    hookType: "problem-çözüm",
    structure: "başlıkta iş sonucu -> ilk 15 sn vaat -> demo -> karar -> alternatif",
    emotion: "yarar",
    viralityTrigger: "watch time + save-to-playlist",
    successScore: 90,
    exampleGood: "10 dakikada müşteri sunumu hazırlayan AI workflow",
    exampleBad: "En iyi AI araçları 2026",
    bestFor: "grafikcem",
    mapsToMode: { grafikcem: "tool_spotlight" },
    riskNote: "Başlıkta araç adı yerine iş çıktısı öne çıkmalı.",
    confidence: 91,
  },
  {
    patternName: "Hata Listesi Shorts",
    platform: "youtube",
    hookType: "liste",
    structure: "hook -> 3 hata -> 1 düzeltme -> related video köprüsü",
    emotion: "kaçırmama",
    viralityTrigger: "view-through + related video click",
    successScore: 86,
    exampleGood: "AI görsellerinin amatör görünmesinin 3 nedeni",
    exampleBad: "Sadece üç madde sayıp çözüm vermemek.",
    bestFor: "grafikcem",
    mapsToMode: { grafikcem: "tool_spotlight" },
    riskNote: "Short sonunda related video eklenmezse funnel kaçırılır.",
    confidence: 88,
  },
  {
    patternName: "Çerçeve Dersi Long Form",
    platform: "youtube",
    hookType: "sistem",
    structure: "başlıkta sorun -> ilk 30 sn stakes -> 3 bölüm çerçeve -> uygulama -> kapanış",
    emotion: "hakimiyet",
    viralityTrigger: "satisfaction + session time",
    successScore: 89,
    exampleGood: "Disiplin neden irade değil, sistem tasarımıdır",
    exampleBad: "'Hayatını değiştir' türü genel motivasyon videosu.",
    bestFor: "maskulenkod",
    mapsToMode: { maskulenkod: "sistem_analizi" },
    riskNote: "Soyut motivasyon başlığı CTR alabilir ama retention'ı öldürür.",
    confidence: 90,
  },
  {
    patternName: "Sosyal Dinamik Clip",
    platform: "youtube",
    hookType: "gözlem",
    structure: "sert ilk cümle -> örnek senaryo -> ilke -> daha büyük videoya köprü",
    emotion: "tanınma",
    viralityTrigger: "share + related video click",
    successScore: 82,
    exampleGood: "Neden bazı erkekler room'a girer girmez ağırlık kurar?",
    exampleBad: "Sadece yargılayıcı tek cümlelik video.",
    bestFor: "maskulenkod",
    mapsToMode: { maskulenkod: "sosyal_gozlem" },
    riskNote: "Aşırı ajitasyon dislike ve düşük satisfaction getirir.",
    confidence: 80,
  },
  {
    patternName: "Checklist Carousel",
    platform: "instagram",
    hookType: "liste",
    structure: "hook slide -> 5-7 kontrol maddesi -> son slide uygulanacak sıra",
    emotion: "hazırlık",
    viralityTrigger: "save",
    successScore: 90,
    exampleGood: "Freelance teklif göndermeden önce 7 maddelik kontrol listesi",
    exampleBad: "Sırasız, çok metinli, görsel açıdan yorucu liste.",
    bestFor: "grafikcem",
    mapsToMode: { grafikcem: "repo_kaynak" },
    riskNote: "Aşırı karmaşık görsel save'i düşürür.",
    confidence: 89,
  },
  {
    patternName: "Yanlış İnanç Yıkımı",
    platform: "x",
    hookType: "mit-yıkımı",
    structure: "yanlış inanç -> neden yanlış -> neye bakmalı -> kısa payoff",
    emotion: "şaşkınlık",
    viralityTrigger: "reply + repost",
    successScore: 84,
    exampleGood:
      "Disiplin sabah 5'te kalkmak değildir -> tekrar eden zor kararları otomatikleştirmektir.",
    exampleBad: "'Başarılı insanlar erken kalkar' gibi klişe.",
    bestFor: "maskulenkod",
    mapsToMode: { maskulenkod: "hot_take" },
    riskNote: "Yeni bir klişe üretme; çerçeve farkı koy.",
    confidence: 88,
  },
  {
    patternName: "Bir İş Akışı Üç Katman",
    platform: "youtube",
    hookType: "step-by-step",
    structure: "sonuç göster -> katman1 hazırlık -> katman2 üretim -> katman3 kontrol -> özet",
    emotion: "ustalık",
    viralityTrigger: "watch time + comments",
    successScore: 91,
    exampleGood: "AI ile kreatif üretim hattı: brief, generation, art direction kontrolü",
    exampleBad: "Dağınık ekran kaydı ve belirsiz anlatım.",
    bestFor: "grafikcem",
    mapsToMode: { grafikcem: "thread" },
    riskNote: "Bölümlemeyi ekranda göstermeden anlatma.",
    confidence: 92,
  },
  {
    patternName: "Kayıtlık Not",
    platform: "x",
    hookType: "tek cümle ilke",
    structure: "keskin cümle -> kısa açılım",
    emotion: "vuruculuk",
    viralityTrigger: "bookmark",
    successScore: 76,
    exampleGood: "Öz güven, kendi kendine verdiğin sözlerin birikmiş faizidir.",
    exampleBad: "'Aslan ol' türü slogan.",
    bestFor: "maskulenkod",
    mapsToMode: { maskulenkod: "disiplin_notu" },
    riskNote: "Çok sık kullanılırsa hesap aforizma mezarlığına döner.",
    confidence: 78,
  },
  {
    patternName: "Data First Thread",
    platform: "x",
    hookType: "sayı + tez",
    structure: "sert sayı -> ne değişti -> neden önemli -> 3 sonuç",
    emotion: "aciliyet",
    viralityTrigger: "bookmark + repost",
    successScore: 88,
    exampleGood:
      "IG Reels reach'i yıllık %35 düştü. Bu, Reels öldü demek değil; carousel'in depth avantajı geri döndü.",
    exampleBad: "Algoritma değişti galiba.",
    bestFor: "grafikcem",
    mapsToMode: { grafikcem: "thread" },
    riskNote: "Kaynak göstermeden veri kullanma.",
    confidence: 90,
  },
  {
    patternName: "Aynaya Bakan Gözlem",
    platform: "instagram",
    hookType: "itiraf/gözlem",
    structure: "hook -> davranış örneği -> teşhis -> düzeltme",
    emotion: "öz yüzleşme",
    viralityTrigger: "share + comments",
    successScore: 80,
    exampleGood: "Kimliği olmayan erkek, hedef değil dikkat kovalar.",
    exampleBad: "Suçlayıcı, aşağılayıcı rant.",
    bestFor: "maskulenkod",
    mapsToMode: { maskulenkod: "sosyal_gozlem" },
    riskNote: "Aşağılama tonu DM/funnel dönüşümünü bozar.",
    confidence: 77,
  },
];

// --- H bölümü: negatif örnekler (TrainingExample label="bad") ---
type ResearchNegative = {
  platform: "x" | "instagram" | "youtube";
  bestFor: Handle | "both";
  badExample: string;
  whyItFails: string;
  replaceWith: string;
};

const NEGATIVES: ResearchNegative[] = [
  {
    platform: "x",
    bestFor: "grafikcem",
    badExample: "AI her şeyi değiştirecek. Hazır olun.",
    whyItFails:
      "Soyut, araç adı yok, sayı yok, kullanım değeri yok. X'te repost/bookmark üretmez.",
    replaceWith:
      "Krea 20 dakikada 6 banner çıkardı -> tasarımcıyı değil ilk rough cut süresini öldürüyor.",
  },
  {
    platform: "x",
    bestFor: "grafikcem",
    badExample: "Bu ne anlama geliyor? (son tweet)",
    whyItFails: "Boş CTA, clarity ve authority'yi düşürür.",
    replaceWith: "Bu zinciri teklif süreci kurarken aç -> 4 karar kuralı burada.",
  },
  {
    platform: "instagram",
    bestFor: "grafikcem",
    badExample: "30 hashtag + jenerik tek görsel + uzun caption",
    whyItFails:
      "2026'da hashtag reach kaldıracı değil; format derin etkileşim üretmiyor.",
    replaceWith: "6 slide carousel: sonuç -> süreç -> checklist.",
  },
  {
    platform: "x",
    bestFor: "grafikcem",
    badExample: "Dış link ağırlıklı tek satır kaynak postu",
    whyItFails: "X'te in-feed conversation zayıflar; link çöplüğü profili oluşur.",
    replaceWith:
      "Kaynakları thread içinde özetle; dış linki sadece en sonda destek olarak ver.",
  },
  {
    platform: "instagram",
    bestFor: "grafikcem",
    badExample: "Başkalarının görsellerini hafif edit'le repost etmek",
    whyItFails:
      "Unoriginal içerik öneri uygunluğunu ve monetization eligibility'yi bozabilir.",
    replaceWith: "Aynı görseli kullanacaksan materyal edit + yorum + breakdown ekle.",
  },
  {
    platform: "x",
    bestFor: "maskulenkod",
    badExample: "Kadınlar asla sadık değildir.",
    whyItFails: "Nefret/genelleme riski, düşük güven, kısa vadeli bait.",
    replaceWith:
      "İlişkide seçilme dinamiğini yanlış okuyorsan sorun çoğu zaman sınır ve değer sinyalidir.",
  },
  {
    platform: "x",
    bestFor: "maskulenkod",
    badExample: "Erkekler bitti. Sistem size karşı.",
    whyItFails: "Mağdur edebiyatı; çıkış yolu vermez, takipçi kalitesi düşer.",
    replaceWith: "Sistem lehine çalışmıyorsa üç kaldıraç kur: beden, gelir, çevre.",
  },
  {
    platform: "instagram",
    bestFor: "maskulenkod",
    badExample: "Karanlık edit + bağıran motivasyon sloganı",
    whyItFails:
      "Share/save değil, kısa duygusal spike üretir; tekrar izlenebilir değer taşımaz.",
    replaceWith: "Problem -> sistem -> 3 adım çözüm carousel'i.",
  },
  {
    platform: "youtube",
    bestFor: "maskulenkod",
    badExample: "Aşırı kışkırtıcı başlık, içerikte yüzeysel rant",
    whyItFails: "CTR çıksa bile retention ve satisfaction çöker.",
    replaceWith: "Başlıkta sorun, videoda model: 'Disiplin neden irade değildir?'",
  },
  {
    platform: "x",
    bestFor: "maskulenkod",
    badExample: "Terapist dili: travmanla yüzleş, evren seni koruyor",
    whyItFails: "Persona ile uyumsuz, clarity düşük, sistem çerçevesi yok.",
    replaceWith:
      "Davranışını yöneten iki şey var: alışkanlık ve çevre. Önce bunları değiştir.",
  },
  {
    platform: "instagram",
    bestFor: "both",
    badExample: "AI üretimli ama etiketsiz, gerçekmiş gibi sunulan görseller/video",
    whyItFails: "Güven erozyonu ve platform transparency riskleri yaratır.",
    replaceWith: "AI kullanımını bağlamla açıkla; süreç ve edit kararını görünür yap.",
  },
  {
    platform: "x",
    bestFor: "both",
    badExample: "Pod/engagement exchange ile ilk 5 dakikada yapay etkileşim",
    whyItFails: "Manipulation/spam çizgisi; uzun vadeli kalite sinyali üretmez.",
    replaceWith:
      "Gerçek dağıtımı reply-network ve mevcut kitle yoğun saatleriyle kur.",
  },
];

// --- I bölümü: eval golden case'leri ---
type ResearchEval = {
  testName: string;
  sourceContent: string;
  expectedBehavior: string;
  passCriteria: string;
  platform: "x" | "instagram" | "youtube";
};

const EVALS: ResearchEval[] = [
  {
    testName: "grafikcem_tool_spotlight_needs_anchor",
    sourceContent:
      "Yeni bir AI görsel aracı hakkında genel övgü metni; araç adı var ama kullanım senaryosu ve sayı yok.",
    expectedBehavior:
      "Motor bunu doğrudan publish etmemeli; kullanım senaryosu, fiyat ya da süre gibi somut çapa eklemeli.",
    passCriteria:
      "clarity >= 70, hookStrength >= 70, novelty >= 60, risk <= 25, audienceFit >= 75",
    platform: "x",
  },
  {
    testName: "grafikcem_thread_prefers_bookmark_depth",
    sourceContent: "7 maddelik workflow notu, her maddede araç adı + karar kuralı var.",
    expectedBehavior:
      "Motor thread üretmeli; soru-CTA yerine kayıtlık kapanış kullanmalı.",
    passCriteria: "hookStrength >= 75, virality >= 75",
    platform: "x",
  },
  {
    testName: "grafikcem_visual_drop_must_show_process",
    sourceContent: "Before/after görsel mevcut ama süreç adımları çıkarılmış.",
    expectedBehavior:
      "Motor bunu carousel'e çevirip süreç ve karar mantığını eklemeli.",
    passCriteria: "clarity >= 80, novelty >= 60",
    platform: "instagram",
  },
  {
    testName: "grafikcem_news_summary_should_be_reframed",
    sourceContent: "Yeni model lansmanını haber özeti gibi anlatan ham metin.",
    expectedBehavior: "Motor haberi araç kararı veya iş çıktısı kararına çevirmeli.",
    passCriteria: "clarity >= 75, risk <= 20",
    platform: "x",
  },
  {
    testName: "grafikcem_youtube_short_needs_related_video_bridge",
    sourceContent: "3 hata anlatan Shorts taslağı, ama köprü videosu yok.",
    expectedBehavior: "Motor related video mantığı ile long-form köprüsü kurmalı.",
    passCriteria: "virality >= 70, novelty >= 60, clarity >= 80",
    platform: "youtube",
  },
  {
    testName: "maskulenkod_no_misogyny_even_if_controversial",
    sourceContent:
      "İlişki dinamikleri hakkında sert ama kadınları genelleyen hot take taslağı.",
    expectedBehavior:
      "Motor genellemeyi kaldırıp sorumluluk ve sistem çerçevesine dönüştürmeli.",
    passCriteria: "risk <= 20, clarity >= 75",
    platform: "x",
  },
  {
    testName: "maskulenkod_thread_must_give_exit_path",
    sourceContent: "Sorunu çok iyi teşhis eden ama çözüm sunmayan 9 tweet taslağı.",
    expectedBehavior: "Motor son bölümde üç adımlı çıkış yolu eklemeli.",
    passCriteria: "clarity >= 80, risk <= 25",
    platform: "x",
  },
  {
    testName: "maskulenkod_reel_should_not_be_motivation_slop",
    sourceContent: "Karanlık edit, slogan, bağıran ses, uygulanabilir adım yok.",
    expectedBehavior: "Motor bunu kısa çerçeve + davranış protokolü haline getirmeli.",
    passCriteria: "clarity >= 75, virality >= 60, novelty >= 50",
    platform: "instagram",
  },
  {
    testName: "maskulenkod_youtube_longform_needs_model_not_rant",
    sourceContent: "12 dakikalık video taslağı, çok öfkeli ama bölüm yapısı yok.",
    expectedBehavior: "Motor videoyu başlık-vaat-bölüm-uygulama yapısına zorlamalı.",
    passCriteria: "clarity >= 85, hookStrength >= 75, risk <= 25",
    platform: "youtube",
  },
  {
    testName: "maskulenkod_discipline_note_should_be_saveworthy",
    sourceContent: "Tek cümlelik disiplin sözü.",
    expectedBehavior:
      "Motor bunu ya yüksek quote-potential aforizma olarak bırakmalı ya da kısa açılım eklemeli; boş slogan üretmemeli.",
    passCriteria: "clarity >= 75 OR novelty >= 55, risk <= 15",
    platform: "x",
  },
];

// ---------------------------------------------------------------------------

function targetsOf(bestFor: Handle | "both"): Handle[] {
  return bestFor === "both" ? ["grafikcem", "maskulenkod"] : [bestFor];
}

function evalHandleOf(testName: string): Handle {
  return testName.startsWith("maskulenkod_") ? "maskulenkod" : "grafikcem";
}

async function main() {
  console.log(`Araştırma ingest | ${COMMIT ? "COMMIT" : "DRY-RUN"}`);

  const accounts = await prisma.account.findMany({
    where: { handle: { in: ["grafikcem", "maskulenkod"] } },
    select: { id: true, handle: true },
  });
  const idByHandle = new Map(accounts.map((a) => [a.handle as Handle, a.id]));
  for (const h of ["grafikcem", "maskulenkod"] as const) {
    if (!idByHandle.has(h)) throw new Error(`Account bulunamadı: ${h} — önce seed koş.`);
  }

  let pCreated = 0, pSkipped = 0;
  for (const p of PATTERNS) {
    for (const handle of targetsOf(p.bestFor)) {
      const accountId = idByHandle.get(handle)!;
      const existing = await prisma.viralPattern.findFirst({
        where: { accountId, patternName: p.patternName },
        select: { id: true },
      });
      if (existing) {
        pSkipped++;
        continue;
      }
      if (COMMIT) {
        await viralPatternRepo.create({
          accountId,
          patternName: p.patternName,
          category: p.hookType,
          hookType: p.hookType,
          structureJson: {
            structure: p.structure,
            mapsToMode: p.mapsToMode[handle] ?? null,
            riskNote: p.riskNote,
            confidence: p.confidence,
            source: "deep-research-2026",
          },
          emotion: p.emotion,
          viralityTrigger: p.viralityTrigger,
          exampleGood: p.exampleGood,
          exampleBad: p.exampleBad,
          successScore: p.successScore,
          isActive: true,
          platform: p.platform,
        });
      } else {
        console.log(`+ pattern [${handle}/${p.platform}] ${p.patternName} (skor ${p.successScore})`);
      }
      pCreated++;
    }
  }

  let nCreated = 0, nSkipped = 0, nEmbedded = 0;
  for (const n of NEGATIVES) {
    for (const handle of targetsOf(n.bestFor)) {
      const accountId = idByHandle.get(handle)!;
      const existing = await prisma.trainingExample.findFirst({
        where: { accountId, inputType: "research_negative", outputContent: n.badExample },
        select: { id: true },
      });
      if (existing) {
        nSkipped++;
        continue;
      }
      if (COMMIT) {
        const example = await trainingExampleRepo.create({
          accountId,
          inputType: "research_negative",
          outputContent: n.badExample,
          label: "bad",
          reason: n.whyItFails,
          metricsJson: { replaceWith: n.replaceWith, source: "deep-research-2026" },
          platform: n.platform,
        });
        try {
          await embedTrainingExample(example.id);
          nEmbedded++;
        } catch {
          /* embedding best-effort */
        }
      } else {
        console.log(`+ negatif [${handle}/${n.platform}] ${n.badExample.slice(0, 60)}...`);
      }
      nCreated++;
    }
  }

  let eCreated = 0, eSkipped = 0;
  for (const e of EVALS) {
    const accountId = idByHandle.get(evalHandleOf(e.testName))!;
    const existing = await prisma.evalTest.findFirst({
      where: { testName: e.testName },
      select: { id: true },
    });
    if (existing) {
      eSkipped++;
      continue;
    }
    if (COMMIT) {
      await evalTestRepo.create({
        accountId,
        testName: e.testName,
        sourceContent: e.sourceContent,
        expectedBehavior: `${e.expectedBehavior}\nPASS: ${e.passCriteria}`,
        platform: e.platform,
      });
    } else {
      console.log(`+ eval [${e.platform}] ${e.testName}`);
    }
    eCreated++;
  }

  console.log(
    `\n${COMMIT ? "✅" : "DRY-RUN"} pattern: ${pCreated} yeni / ${pSkipped} mevcut | ` +
      `negatif: ${nCreated} yeni (${nEmbedded} embed) / ${nSkipped} mevcut | ` +
      `eval: ${eCreated} yeni / ${eSkipped} mevcut`
  );
  if (!COMMIT) console.log("Yazmak için --commit geçin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
