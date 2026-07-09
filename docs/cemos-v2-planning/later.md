# later.md — Sprint 1/2 sırasında bulunan, kapsam DIŞI bırakılan işler

> FIRST-SPRINT §4 gereği: yeni fikir kodlanmaz, buraya not düşülür.

## Dalga 2+ model migration
- ~~raw `generateJson` çağrıları~~ → **TAMAM (Sprint 2, dalga 2)**: src'de raw çağrı
  kalmadı (yalnız `openrouter.ts` tanımı + `generateGated` sarmalayıcısı). İstisna:
  `scripts/enrich-toolbox.ts` tek-seferlik script (bilinçli; gate'e taşınabilir).
- ~~Eval standı growth-engine motoru~~ → **TAMAM (Sprint 2 eval-parity)**:
  `run-eval-tests.ts` üretimle aynı `runDraftPipeline`'ı kullanıyor.
- `openrouter.ts getFallbackModels` içindeki legacy (gemini-2.5/gpt-4o) zincirleri eski
  env-override kurulumları için duruyor; temizlenebilir.
- Preset terfileri (dalga 3 adayı): dalga 2 rol-yolu + purpose ile taşındı (davranış
  birebir korunsun diye). Net eşleşenler preset'e terfi edebilir: pre-filter →
  `cemos-budget-batch`, pattern-extractor/scorer-source → `cemos-fast-extract`,
  growth draft-generator → `cemos-writer`. Terfi = model değişimi, ayrı karar + eval.

## Veri/şema (migration gerektirir — Sprint 1'de yasaktı)
- ~~ViralPattern'a kalıcı `embeddingJson` kolonu~~ → **TAMAM (Sprint 9)**:
  `embeddingJson` + `embeddingHash` (djb2 tazelik) + boyut koruması (sorgu
  local-fallback'e düşünce kalıcı 1536-dim vektör kullanılmaz — sessiz-0 önlendi).
- ~~FeedbackEvent'e ayrı `editDistance` kolonu~~ → **TAMAM (Sprint 9)**: kolon +
  reason JSON aynası (geriye uyum); KPI okuyucu kolon-önce.
- Sprint 9 inceleme notu (MEDIUM, kabul edilen): eşzamanlı searchSimilarExamples
  çağrıları aynı pattern'i yarışarak persist edebilir (idempotent, hata yutulur;
  yalnız gereksiz embed maliyeti). Gerekirse persist'i kuyruğa alma / dedup.

## Kalite motoru
- Off-persona tespiti deterministik fallback'te ilkesel olarak zayıf (keyword'süz
  off-persona yakalanamıyor) — batched karşı-aile judge (V1) çözer; golden set
  bad-direct setinden bu arketip çıkarıldı, generation testlerindeki
  `personamatch >= 60` kapısı kapsıyor.
- `TURKISH_NATURALNESS_MIN = 55` sabiti ilk gerçek hafta verisiyle kalibre edilmeli.
- CostsTab preset-bazlı harcama dökümü (FINAL-OPENROUTER-ROUTING kabul maddesi,
  görünüm işi) — UsageLog.meta.preset alanı Wave 1'den beri yazılıyor, UI bekliyor.

## Bugün yüzeyi (V1 UX)
- Klavye kısayolları A/E/J/K + Cmd/Ctrl-K komut çubuğu (FINAL-UX-SPEC, V1).
- `/api/settings/operator-readiness` lokalde yavaş (Neon pool baskısı altında timeout
  → sayaç "durum alınamadı" gösteriyor). Endpoint'in sorgu sayısı azaltılabilir /
  cache'lenebilir.
- "Tepki vermeye değer" içindeki üç highlight bileşeninin iç limitleri (5/3/3) spec'in
  "~3 öğe" hedefine indirilebilir; şimdilik bölüm varsayılan katlanmış.

## Eval — legacy vaka takibi (Sprint 2'de davranış netleşti)
Sprint 2 eval-parity sonrası: üretim-modu testler (10 legacy research-ingest +
9 golden good-gen) gerçek LLM yokken artık **MOCK** raporlanır ve DB'ye
YAZILMAZ — heuristik fallback critic ile sahte PASS/FAIL üretilmiyor
(2026-07-09 koşusu: 42 PASS / 0 FAIL / 19 MOCK). Eski 2 PART / 2 FAIL legacy
sınıfı böylece kapandı; gerçek karar OpenRouter kredisi eklenince verilecek:
`eval:run --all` → hâlâ düşük skorlayan legacy vakalarda eşik mi gevşer,
prompt mu iyileşir (dalga 3 kararı). İzlenecek adaylar:
- `grafikcem_thread_prefers_bookmark_depth` (hookStrength>=75, virality>=75)
- `grafikcem_youtube_short_needs_related_video_bridge` (virality>=70)
- `maskulenkod_reel_should_not_be_motivation_slop` (virality>=60)
- `maskulenkod_youtube_longform_needs_model_not_rant` (clarity>=85, hookStrength>=75)

## Memory Foundation (Sprint 3) — kalan/ertelenen
- ~~**[USER] `npx prisma db push`**: MemoryFact/CaptionDna/HashtagDna~~ →
  **TAMAM (Sprint 9)**: additive push Neon'a uygulandı, `migrate diff` boş.
- Embedding A/B (qwen3-embedding-8b vs text-embedding-3-small, MEMORY-SPEC §7):
  OpenRouter kredisi + golden set gerektirir — kredi sonrası.
- AC-5 (north-star edit-ratio A/B): gerçek kullanım verisi gerektirir — izlenecek.
- CaptionDna/HashtagDna DOLDURMA servisi (PublishLog'dan damıtma + onay): tablolar
  ve enjeksiyon hazır; ilk damıtma dalga-2 memory işi.
- MemoryFact.embeddingJson recall'u (şu an yalnız kural enjeksiyonu; vektör recall
  TrainingExample/pattern üzerinden sürüyor) — fact sayısı büyüyünce.

## Sprint 4 (Series + IG + Verifier) — kalan/ertelenen
- ~~**[USER] `npx prisma db push`**: SeriesProfile / IgWatchAccount /
  WebsiteVerification + kolonlar~~ → **TAMAM (Sprint 9)**: aynı push'ta uygulandı.
- **[USER] Meta token**: business_discovery canlı doğrulaması token/izin ister
  (instagram_basic + business_discovery). Kod fail-open; token yokken sync boş.
- Verifier Tier-2 (Playwright render escalation): ayrı go/no-go spike (C10);
  o güne dek signup/freeTier sinyalleri 'unknown'.
- Seri DNA edit ekranı (Settings alt-sekmesi) + PRELUDE edit-diff → learnedRules
  döngüsü (series_ purpose): Reels dossier sprint'iyle birlikte.
- ~~Reels dossier (reelDossierFor + ReelDossier + evidence gate)~~ → **TAMAM
  (Sprint 5)**; kalan: dossier liste UI + Instagram alan ekranı (Rakip Radarı |
  Reels alt-sekmeleri) — UI dalgasında.
- Bard→Gemini CANLI regresyonu (gerçek ağ): mocked testi var; canlı koşu
  operatör smoke'unda.

## Sprint 6-7 (Planner + Eval V1) — kalan/ertelenen
- Batched 14-skor judge çağrısının draft-pipeline entegrasyonu: motor hazır
  (subscores14 + agregasyon); tek batched `cemos-final-judge` çağrısı + Zod +
  repair, canlı LLM ile kalite doğrulaması gerektirir (402 sonrası,
  EVAL14_ENABLED bayrağıyla kademeli).
- κ kalibrasyon cron bağlaması: `calibration.ts` hazır; insan-etiketli örneklem
  biriktikçe learn cron'una haftalık eklenecek.
- ~~KPI satırları → CostsTab~~ → **TAMAM (Sprint 8)**: /api/eval/kpis + CostsTab
  kalite şeridi.
- ~~lessonGate'in bağlanması~~ → **TAMAM (Sprint 9)**: publish→PublishedPost→
  PerformanceSnapshot (engagement sync'te, verdict-öncesi her eşleşen yayında)
  → patternPromotionService (iki-kapı + marka vetosu; reject-rate yalnız karar
  verilmiş taslaklar; learn cron Pazartesi). ViralPattern.validatedAt/
  validatedSupport kolonları. Gerçek promosyon yine gerçek veri birikimi ister
  (kod hazır, seyrek veride no-op).
- Ay grid UI (ReelPlan) + dossier listesi + Instagram alan ekranı + Seri DNA
  editörü: nihai UI dalgası (sistem doğrulaması sonrası).

## Operasyonel
- ~~`account-profiles.ts` silme~~ → **TAMAM (Sprint 2)**: dosya silindi, 9 tüketici
  canlı `accounts.ts` + `account-adapter` köprüsüne taşındı.
- Neon connection pool: lokal dev + script'ler aynı anda çalışınca pool timeout
  görülüyor; script'lere tek-bağlantı datasource/pgbouncer düşünülebilir.
- ~~CI pipeline yok~~ → **TAMAM (Sprint 9)**: .github/workflows/ci.yml
  (lint/typecheck/test/build; eval:run bilinçli CI-dışı — canlı LLM+DB ister).
- Windows gotcha (Sprint 9): `next dev` Prisma engine DLL'ini kilitler →
  `prisma generate` EPERM. Dev server'ı durdur ya da `next build --webpack`
  (client günceldeyse). Linux/Vercel etkilenmez.
