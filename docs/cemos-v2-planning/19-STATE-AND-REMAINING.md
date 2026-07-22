# 19 — Durum ve Kalan İş Mutabakatı (Sprint 9 sonrası)

> Tarih: 2026-07-09. Bu belge FINAL-ROADMAP'in 5-sprint planı ile gerçek uygulamayı
> (Sprint 1-9) mutabık kılar. Ayrıntılı kalan-iş defteri: [later.md](./later.md).
> Çelişkide RESEARCH-SYNTHESIS §5 kazanır.

## 1. Plan vs gerçek

FINAL-ROADMAP 5 sprint tanımladı; uygulama yeniden sıralanıp Sprint 8'e (UI
yüzeyleri) ve Sprint 9'a (kalan-iş kapatma) uzadı. Eşleme:

| Roadmap | Gerçekleşme |
|---|---|
| S1 Bugün + Tek Motor | Sprint 1-2 (eval-parity dahil) |
| S2 Nav + Presets + Memory temeli | Sprint 2-3 |
| S3 Series + IG + Verifier | Sprint 4 |
| S4 Reels Dossier + Eval V1 | Sprint 5 + 7 |
| S5 Aylık Plan + IG Alanı | Sprint 6 + 8 |
| (plan dışı) | Sprint 9: öğrenme döngüsü + CI + kalıcı kolonlar + db push |

## 2. Sprint 9'da kapananlar

- **Neon şema senkron** (P0): Sprint 3-8'in bekleyen tüm additive tabloları push
  edildi; `prisma migrate diff` boş. [USER] db-push blocker'ları kapandı.
- **Performans→hafıza öğrenme döngüsü** (P1): `PublishedPost` →
  `PerformanceSnapshot` (engagement sync, verdict-öncesi) →
  `patternPromotionService` (iki-kapı lessonGate + marka vetosu, learn cron
  Pazartesi). İki bağımsız-inceleme düzeltmesi: orta-band snapshot + yalnız
  karar-verilmiş taslaklarla reject-rate.
- **CI**: lint/typecheck/test/build GitHub Actions gate'i.
- **Kalıcı kolonlar** (P3 no-spend): `FeedbackEvent.editDistance` (kuzey-yıldızı
  sorgulanabilir), `ViralPattern.embeddingJson/embeddingHash` (+ boyut koruması:
  local-fallback sorguda kalıcı vektör kullanılmaz — sessiz-0 önlendi).
- Test: 1147 → 1162 (hepsi yeşil); typecheck/lint/build temiz.

## 3. Kalan — neden bekliyor (2026-07-10 bütçe revizyonu sonrası GÜNCEL)

### 2026-07-10 güncellemesi

- OpenRouter 402 kredi engeli kalktı. Canlı tek-hesap benchmark gerçek
  `claude-sonnet-5` writer + `gpt-5.4-mini` judge ile geçti (`usedMock:false`,
  fallback yok, final editor yok, yanıt maliyeti `$0.0370`).
- Batched 14-skor judge canlı geçti: `gpt-5.4-mini`, 14 sinyal, veto yok,
  composite 65, maliyet `$0.001572`.
- Hesap kredisi eklenmiş olsa da aktif API key aylık limiti `$5`; kullanım
  `$1.0425`, kalan `$3.9575`. **[USER] key limitini `$10` yapmalı.**
- `$10/ay` pacing ve maliyet sertleştirmesi kodlandı: background `%30`, `$1` core
  rezerv, eval opt-in, model/max-token preflight, provider `max_price`, key-ledger
  doğrulaması ve ücretli invalid-JSON muhasebesi.
- 19 generation eval testi bütçeyi korumak için otomatik koşulmadı. Canlı eval
  yalnız tek-seferlik `AI_EVAL_SPEND_ENABLED=true` ile ve `$0.50` aylık dilimde.

2026-07-09'daki tarihsel doğrulama iki external blocker saptamıştı:

- **ÇÖZÜLDÜ — OpenRouter 402 (Insufficient credits).** `eval:run --all` canlı
  koşuldu: **42 PASS / 0 FAIL** (tüm deterministik golden vakalar), 19 gen-testi
  MOCK — generation çağrıları 402 döndü. `verify:catalog` geçiyor çünkü /models
  ücretsiz endpoint; **generation kredisi yok**. [USER] kredi ekleyene dek tüm
  canlı-LLM doğrulamaları bloke etmişti; 2026-07-10 smoke ile kredi doğrulandı.
- **BLOCKER-2 — Meta izin (#10).** META_ACCESS_TOKEN env'de mevcut; canlı
  `business_discovery` smoke koşuldu → `(#10) Application does not have
  permission`. Token var, **instagram_basic + business_discovery scope'u yok**.
  [USER] Meta app izinleri gerekli. Kod fail-open doğru çalışıyor.

| İş | Durum / Kapı |
|---|---|
| Batched 14-skor judge entegrasyonu (EVAL14_ENABLED) | **KOD + CANLI SMOKE TAMAM**: `gpt-5.4-mini`, 14 sinyal, `$0.001572`; bayrak default KAPALI |
| eval:run --all (4 legacy vaka kararı) | Deterministik 42/42 PASS; 19 canlı generation vaka yalnız `AI_EVAL_SPEND_ENABLED=true` ile, aylık eval cap `$0.50` |
| Legacy emeklilik (draft-generator/critic, scorer/leak absorbe, council→judge) | Modüller CANLI route'lara bağlı; route repoint + bütçeli eval-parity kanıtı olmadan silme YOK |
| Meta business_discovery canlı doğrulama | **KOŞULDU** → BLOCKER-2 (izin). Watchlist de boş (0 hesap) — izin sonrası hesap ekle |
| Embedding A/B (qwen3 vs 3-small) | Canlı eval bütçesi içinde, ayrı kontrollü koşu |
| κ kalibrasyon cron | İnsan-etiketli judge/human çifti birikimi (veri-kapılı) |
| CaptionDna/HashtagDna damıtma servisi | PublishLog birikimi; dalga-2 memory işi |
| Verifier Tier-2 (Playwright render) | Ayrı go/no-go spike (C10) |
| UI dalgası | Sprint 9 işlevsel temel TAMAM. Nihai redesign planı: `20-FINAL-UI-IMPLEMENTATION-PLAN.md`; uygulama bilinçli bekliyor. A/E/J/K, 5-alan nav, kompakt Bugün ve pacing/key-limit maliyet görünümü bu dalgada |
| [USER] Vercel Deployment Protection + secrets | Operasyonel |

## 4. Notlar

- Windows: `next dev` Prisma engine DLL kilidi → `prisma generate` EPERM
  (dev server'ı durdur ya da `next build --webpack`). Linux/Vercel etkilenmez.
- Gerçek pattern promosyonu kod olarak hazır ama **veri birikimi** ister:
  yayın → snapshot → ≥3 destek + anlamlılık. İlk haftalarda no-op normaldir.
