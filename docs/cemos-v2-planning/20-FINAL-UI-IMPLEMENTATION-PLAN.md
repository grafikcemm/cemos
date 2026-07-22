# CemOS — Nihai UI Uygulama Planı

> Tarih: 2026-07-10. Bu belge plan/sözleşmedir; bu turda UI kodu değiştirilmedi.
> Görsel temel: [DESIGN.md](./DESIGN.md). Ürün invariant'ları korunur: manuel
> publish + edit-gate, legacy semboller, mevcut API ve veri sözleşmeleri.

## 1. Hedef

CemOS pazarlama sayfası değil, her gün kullanılan yoğun bir operasyon aracı
olacak. İlk ekran doğrudan işi gösterir: sıradaki taslak, gerekli karar ve tek
sonraki aksiyon. Sağlık ve maliyet yalnız sorun olduğunda öne çıkar.

## 2. Bilgi mimarisi

Sol navigasyon beş ana alana iner:

1. **Bugün** — sıradaki iş, günlük kuyruk, haber fırsatları.
2. **Üretim** — X, Instagram, YouTube üretim ve planlama yüzeyleri.
3. **Keşif** — Viral Radar, keşif motoru, kaynaklar ve rakipler.
4. **Hafıza** — viral/pattern/prompt/anahtar kelime kütüphaneleri, öğrenme.
5. **Sistem** — sağlık, maliyet, toolbox ve ayarlar.

Desktop'ta daraltılabilir rail + alan içi ikincil nav; mobilde beş öğeli alt nav
ve alan içi sheet kullanılır. Aynı hedef iki kez görünmez.

## 3. Görsel sistem düzeltmesi

- Nötr grafit yüzey ana renk olur; lavanta yalnız seçim/focus, şeftali yalnız AI
  üretim aksiyonu, mavi/yeşil/sarı/kırmızı yalnız semantik durum taşır.
- Operasyon sayfalarında hero ve dekoratif büyük kart kaldırılır. Başlık satırı
  kompakt, içerik ilk viewport'ta başlar.
- Kart radius'u 8px; sayfa bölümleri kart içine alınmaz. Tablo, liste ve araç
  yüzeyleri çerçevesiz bantlar halinde çalışır.
- Emoji/özel karakter ikonları Lucide ikonlarına çevrilir; icon-only butonlarda
  tooltip ve erişilebilir ad zorunludur.
- 40px kontrol yüksekliği, tabular numerals, sabit grid ölçüleri ve metin taşma
  kuralları tek primitive katmanında çözülür.

## 4. Uygulama dalgaları

### UI-1 — Shell ve primitive'ler

Navı beş alana indir; topbar, breadcrumb, command palette, toast/banner, tabs,
table, filters, status badge, empty/error/loading/skeleton sözleşmelerini birleştir.
Global worker uyarısı tam-genişlik sürekli banner yerine durum düğmesi + sorun
drawer'ına taşınır; kritik durumda banner geri gelir.

### UI-2 — Bugün ve inceleme akışı

Kompakt başlık altında doğrudan `NEXT UP` görünür. Tek aktif taslak ana çalışma
yüzeyi, kalanlar kuyruk satırı olur. Editör, ayrışık kalite sinyalleri, edit-gate,
kopyala/X'te aç/görsel üret/manuel paylaşıldı aksiyonları sabit boyutlu action
bar'da toplanır. A/E/J/K kısayolları ve görünür focus durumu tamamlanır.

### UI-3 — Üretim, keşif ve hafıza alanları

X/IG/YouTube yüzeyleri ortak workspace kalıbına geçer: filtre satırı, sekmeler,
yoğun liste/tablo, seçili öğe detail pane. Reel dossier, aylık plan, Series DNA,
watchlist, viral/pattern/prompt kütüphaneleri aynı arama/filtre/selection dilini
kullanır. Mobilde detail pane tam ekran sheet olur.

### UI-4 — Sistem, maliyet ve ayarlar

Maliyet ekranı şu gerçekleri ayrı gösterir: provider aylık kullanım, yerel ledger,
`$10` hard cap, bugüne kadarki pacing tavanı, background `%30` dilimi, `$1` core
rezerv, eval açık/kapalı ve `$0.50` cap, OpenRouter key limiti/kalanı. `$5 key`
ile `$10 CemOS` uyuşmazlığı tek aksiyonlu uyarıdır. Sistem sağlık sınıflaması
`422 hata` varken “sağlıklı” diyemez; son başarılı koşu, son hata ve stale eşiği
aynı satırda görünür.

### UI-5 — Son doğrulama

Tüm görünür rotalar ve dört durum (loading/empty/error/success) gerçek API ile
kontrol edilir. Kullanıcı verisi mutasyonu gerektiren publish/generate adımları
mock veya güvenli fixture ile test edilir; prod DB publish yapılmaz.

## 5. Kabul kriterleri

- 320, 390, 768, 1280 ve 1440px'te yatay taşma ve metin çakışması yok.
- Bugün'de ilk taslağın metni ve birincil aksiyonu ilk viewport'ta görünür.
- Klavye ile nav, command palette, editör ve tüm aksiyonlara ulaşılır.
- Console error 0; tüm API error durumları boş durumdan ayrıdır.
- Her sayfada loading/empty/error/success görsel testi vardır.
- `npm test`, typecheck, lint ve production build yeşildir.
- Playwright screenshot karşılaştırması ve canvas/pixel boşluk kontrolü desktop +
  mobilde geçer.
- Manuel publish ve edit-gate davranışı birebir korunur; push/deploy ayrı kullanıcı
  onayı olmadan yapılmaz.
