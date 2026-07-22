# CemOS Vizyon Kabul Testi — Denetçi Promptu

> Kullanım: bu promptu TEMİZ bir oturuma (Claude Code / başka agent) olduğu gibi
> yapıştır. Oturum bu repoda açılmalı: `grafikcem_cemos`. Tarih: 2026-07-10.

---

# GÖREV: CemOS Vizyon Kabul Denetimi

Sen bağımsız bir kabul denetçisisin. CemOS'u aşağıdaki ürün vizyonuna karşı test
edeceksin. Sistemi İNŞA EDENLERİN raporlarına güvenme — her iddiayı kendin doğrula.

## Vizyon (denetim yardstick'i — Ali Cem'in kendi sözleri)

1. Arayüz karışık olmasın; gereksiz sayfa kafa karıştırmasın, yalnız gerçekten
   gerekli olan kalsın.
2. X hesaplarım için girip HAZIR içeriği tek tıkla kontrol edip paylaşayım.
3. İçerik kalitesi viral kapasitede olsun.
4. CemOS agentic hafızaya ve çoklu-agent sistemine sahip olsun; kendi içinde
   skill'ler ve agent'lar barındırsın ve BENİ TANISIN.
5. Instagram carousel serilerimi, açıklama (caption) düzenimi ve hashtag
   düzenimi bilsin.
6. Reels için sektör ve rakip taramasını çok aktif yapsın.
7. Aylık planlamada: hangi siteleri tanıtacağım, bu siteler GERÇEKTEN var mı,
   reels'te ne anlatacağım — kapsamlı versin, aylık planda yardımcı olsun.
8. Günlük haber çekme aktif kullanılsın; sistem güncel trend/haberlerden
   kendini ve içerikleri sürekli geliştirsin.

## Denetim kuralları

- **Kanıt zorunlu.** Her bulgu: dosya yolu (`src/...:satır`) VEYA canlı UI
  gözlemi (Playwright, URL + ne gördüğün) VEYA DB sorgusu sonucu. Kanıtsız
  hiçbir maddeye PASS verme.
- **Üç katman doğrula:** kod var mı → canlı UI'da çalışıyor mu → veri gerçekten
  akıyor mu. "Kod var ama UI'da yok" = PARTIAL; "tablo var ama hiç veri
  yazılmamış" bunu açıkça yaz.
- Verdict seti: **PASS / PARTIAL / FAIL / BLOCKED-EXTERNAL** (dış bağımlılık:
  kod hazır ama üçüncü taraf izni/kredisi engelliyor — FAIL sayma, ayrı yaz).
- **Hiçbir şey değiştirme:** kod yazma, migration yok, taslak silme/yayınlama
  yok. UI'da tıklamak, filtrelemek, metin yazıp GERİ ALMAK serbest; "Manuel
  Paylaşıldı"ya BASMA. DB'ye yalnız SELECT.
- LLM harcaması: canlı üretim tetikleyeceksen (tek "Taslak Üret") toplam
  ≤ $0.10; `AI_EVAL_SPEND_ENABLED` açma.
- Dev server: `http://localhost:3002` (çalışmıyorsa `npm run dev` ile başlat).
  DB sorguları: `npx tsx --import dotenv/config` + `DOTENV_CONFIG_PATH=.env.local`
  ile scratch script (secret değeri asla yazdırma).
- Bilinen dış durumlar (bunları yeniden keşfetmen gerekmiyor, doğrulaman
  yeterli): Meta business_discovery izni `(#10)` eksik; OpenRouter key aylık
  limiti $5; canlı eval opt-in bayraklı.

## Test alanları

### T1 — Sadelik & odak (vizyon #1)
- Sidebar'ı say: kaç birincil alan, kaç utility sekme? 5 alan (Bugün/Twitter/
  Instagram/Kütüphane/Youtube) + Araçlar (Toolbox/Maliyetler/Sistem/Ayarlar)
  bekleniyor. Fazlası/ölü sekme var mı — her birine tıkla, boş/kırık ekran ara.
- İlk açılış Bugün mü? Bugün'de "tepki vermeye değer" bölümü ~3'er öğe mi?
- Cmd/Ctrl-K paleti: aç, "sistem" yaz, Enter — doğru ekrana atlıyor mu?
- Kafa karıştırıcılık yargısı: operatör 10 saniyede "bugün ne yapacağım"ı
  görüyor mu? Öznel gözlemini ayrı yaz.

### T2 — X tek-tık akışı (vizyon #2)
- Bugün → NEXT UP kartı: hesap, metin, ayrışık kalite sinyalleri (kanca/
  doğallık/özgünlük/persona/risk/leak) görünür mü?
- Akışı UÇTAN UCA dene (yayınlamadan): metni düzenle → "Kopyala" → "X'te Aç"
  butonu var mı? Giriş→kontrol→paylaş ≤3 adım mı?
- **Edit-gate invariantı:** metni HİÇ düzenlemeden "Manuel Paylaşıldı" kapalı
  mı? Düzenleyince açılıyor mu? (Bas—MA; yalnız enabled/disabled gözle.)
- Taslaklar gerçek LLM'den mi (`usedMock:false`) — Günlük Kuyruk'taki en yeni
  taslakların scores JSON'ına DB'den bak. Türkçe karakterler düzgün mü (ğ/ş/ç/ü/ö/ı)?

### T3 — Viral kalite hattı (vizyon #3)
- Pipeline kodunu izle: `src/lib/ai/draft-pipeline.ts` — çok-aday yazım →
  judge → kalite kapısı sırası var mı? Writer ailesi ≠ judge ailesi kanıtı
  (`src/lib/ai/presets.ts` `validatePresets`)?
- Deterministik kapılar: yüksek-şiddet leak / Türkçe doğallık < 55 / yasak
  klişe → `needs_edit` (`scoreSignals.ts`). Test dosyaları koşuyor mu:
  `npm test -- scoreSignals` yeşil mi?
- 14 alt-skor motoru: `src/lib/eval/subscores14.ts` (veto + cap) +
  `batchedJudge.ts` (EVAL14_ENABLED) var mı; bayrak default kapalı mı?
- Golden set: `npm run eval:run` koş (deterministik, LLM'siz kısmı) — kaç
  PASS/MOCK? Maliyetler ekranında "Golden set geçiş" yüzdesi görünüyor mu?

### T4 — Agentic hafıza + "beni tanıyor" (vizyon #4)
- Şema + veri: `MemoryFact`, `CaptionDna`, `HashtagDna`, `VoiceProfile`,
  `SeriesProfile`, `ContentEmbedding` tablolarını DB'de say (SELECT count).
  Hangileri DOLU, hangileri boş — dürüst tablo çıkar.
- Yazma disiplini: `src/lib/memory/memoryFactService.ts` — external provenance
  identity yazamaz, DELETE yok (supersede), onay kuyruğu (`status:"proposed"`).
  Ayarlar ekranında Memory önerileri bölümü render oluyor mu?
- Ses anayasası: draft prompt'una VoiceProfile/anayasa enjeksiyonu nerede
  (`grounding.ts` / `prompts.ts`)? Geçmiş edit/ret örnekleri retrieval'a
  giriyor mu (`vector-memory.ts` searchSimilarExamples)?
- Öğrenme kanıtı: FeedbackEvent + TrainingExample kayıt sayıları; editDistance
  kolonu doluyor mu (son publish'lerde)?

### T5 — Multi-agent & skill envanteri (vizyon #4)
- Agent modülleri gerçekten var ve ÇAĞRILIYOR mu (import zinciri kanıtı):
  Account Router (`agents/router.ts`), Draft Pipeline, Batched Judge, Website
  Verifier (`verify/verifyWebsite.ts`), IG Competitor Sync, Reels Dossier
  Generator (`reels/dossier-generator.ts`), Monthly Plan Assembler
  (`reels/plan-assembler.ts`), Memory Consolidation, Pattern Promotion
  (`patternPromotionService`). Her biri için: tetikleyici ne (cron/route/UI)?
- Preset registry: `presets.ts` — kaç preset, fallback zincirleri
  cross-provider mı, `verify:catalog` script'i geçiyor mu (koş)?
- Trace: PipelineTrace/UsageLog'da son 7 günde stage kaydı var mı (DB)?

### T6 — Instagram DNA: seri + caption + hashtag (vizyon #5)
- SeriesProfile: DB'de kayıt var mı ("Best AI Tools" bekleniyor)? Ayarlar'da
  Seri DNA editörü açılıyor mu, alanlar düzenlenebilir mi?
- `buildCarouselPrompt` seri DNA'sını prompt'a katıyor mu (kod izi)?
- CaptionDna/HashtagDna: tablolar var; DOLDURMA servisi var mı yoksa boş mu?
  (Bilinen durum: damıtma servisi dalga-2 — boşsa PARTIAL yaz, FAIL değil.)

### T7 — Rakip tarama + Reels dossier (vizyon #6-7)
- Instagram ekranı: Rakip Radarı (watchlist ekleme + outlier feed) ve Reels
  alt-sekmeleri render oluyor mu; 4 durum (boş ≠ hata) doğru mu?
- business_discovery: `igClient.ts` gerçek Graph çağrısı mı? Canlı tek probe
  dene — `(#10)` izin hatası bekleniyor → BLOCKED-EXTERNAL olarak işaretle.
- **Site doğrulama deterministik mi:** `verifyWebsite` DNS/HTTP/redirect/TLS
  kanıtı topluyor mu, SSRF suite testleri yeşil mi (`npm test -- ssrf verify`)?
  LLM'in doğrulamada rolü yalnız yorum mu?
- ReelDossier: şema alanları (hook, sahne planı, CTA, caption, hashtag, site
  kanıtı, readiness) tam mı? `finalReadiness` KOD kararı mı (LLM değil)?
  Kanıtsız araç `not_ready` kalıyor mu (test var mı)?
- /api/reels/dossier canlıda ne dönüyor (boş liste ise UI boş-durumu doğru mu)?

### T8 — Aylık planlama (vizyon #7)
- `plan-assembler.ts`: deterministik mi (LLM'siz), 60/25/15 pillar karışımı ±
  tolerans, tekrar-histogram uyarısı, seri slotları — testleri koş.
- /api/reels/plan üretimi çalışıyor mu (dry çağrı)? Ay grid UI var mı yoksa
  API-only mu? (UI yoksa PARTIAL — nihai redesign planına not düş.)

### T9 — Günlük haber → sürekli gelişim (vizyon #8)
- Cron envanteri: `vercel.json` — 4 cron (03/06/12/18) tanımlı mı? CronRun
  tablosunda son koşular başarılı mı (DB)?
- Haber hattı: Haberler ekranı canlı içerik gösteriyor mu; buzzScore/tazelik
  sinyali var mı; kaynak→normalize→dupe→skor zinciri kodda nerede?
- Haberden taslağa: bugünkü taslakların kaynağı gerçek NewsItem/SourcePost mu
  (DB join)?
- **Kendini geliştirme döngüsü:** PublishedPost → PerformanceSnapshot →
  lessonGate/patternPromotion zinciri kodda bağlı mı; DB'de PublishedPost/
  PerformanceSnapshot satırı var mı (yoksa "kod hazır, veri birikmedi" yaz)?
  Engagement learning (X metrikleri) FeedbackEvent'e yazıyor mu?

## Çıktı formatı (zorunlu)

1. **Özet tablo:** T1–T9 × verdict (PASS/PARTIAL/FAIL/BLOCKED-EXTERNAL) + tek
   cümle gerekçe.
2. **Vizyon eşleme:** 8 vizyon maddesi × durum — "bugün Ali Cem bunu yaşar mı?"
   cevabıyla.
3. **Kanıt eki:** her verdict için dosya yolu / UI gözlemi / DB sayısı.
4. **Boşluk listesi:** FAIL+PARTIAL'lar önem sırasıyla; her biri için tahmini
   iş boyutu (S/M/L) ve önerilen sonraki adım.
5. **Dürüstlük notu:** test EDEMEDİĞİN şeyler ve nedenleri.
