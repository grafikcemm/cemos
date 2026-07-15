> **Kaynak notu.** Bu, plan-mode oturumunda kullanıcı tarafından onaylanan final uygulama planının (REVİZE v3) kanonik kopyasıdır. Onay geçmişi: v1 koşullu → v2 koşullu (9 düzeltme) → v3 koşullu (6 düzeltme) → son 3 düzeltme (youtube migration, PublishAttempt modeli, thread kapsam kararı) → onaylandı. Kullanıcının SON yorum düzeltmesi burada uygulanmıştır: **`QueueItem.threadSegments` typed additive alanı + basit segment editörü Faz 1C'de yapılır; Faz 2 tekrar typed alan EKLEMEZ — Faz 2 yalnız üretim hattının doğrudan segment üretmesini, mevcut thread'lerin gerekirse backfill'ini ve kalite kalibrasyonunu kapsar.** Öncelik sırası: AGENTS.md + legacy invariant'lar → bu plan → master rebuild prompt → mevcut kod davranışı.

---

# CemOS Rebuild — Faz 0 + Faz 1 Final Uygulama Planı (REVİZE v3)

## Context

Master prompt (`docs/CEMOS-CLAUDE-CODE-MASTER-REBUILD-PROMPT.md`) CemOS'u 3-görevli kişisel içerik OS'una dönüştürmeyi emrediyor. v1 ve v2 koşullu onay aldı; v3 kullanıcının son 6 düzeltmesini işler ve final implementation plan'dır: kullanıcı-erişilebilir hiçbir ekran legacy kompozisyonla kalamaz, store v9 migration eklenir, publish state'lerin DB sözleşmesi kesinleşir, Seriler/Fırsatlar/Takvim modül dağılımı düzeltilir, thread doğrulaması fail-closed olur, auth throttling güvenlik sözleşmesi detaylanır.

**Keşifle doğrulanan gerçekler:**
- Branch `feature/ui-dark-redesign`; untracked: `docs/CEMOS-CLAUDE-CODE-MASTER-REBUILD-PROMPT.md` + `shots/`. Baseline: 1198 vitest + 17 Playwright + build + typecheck + lint + verify:catalog TAM YEŞİL (bkz. `00-BASELINE-AND-GAPS.md`).
- Nav SoT `src/components/nav/navConfig.ts` (17 tab, `TAB_ALIASES`+`normalizeTabId`); dispatch `src/components/shell/screenRegistry.tsx`; store `xagent-store` v8, `migrateXAgentStore` mevcut (`src/store/migrations.ts`), `activeTab` persist ediliyor (`xagent.ts:358`).
- Zorunlu edit-gate `publishService.ts:97-104` + UI `DraftReviewCard.tsx:115/166/398`. `applyQualityGate()` (`scoreSignals.ts:68-90`) `new|needs_edit` üretiyor. `PublishLog` modeli mevcut (success boolean'lı).
- `QueueItem` provenance taşıyor (`sourcePostId`,`newsItemId`,`scores`,`lintReport`,`candidatesJson`).
- Auth yok; Next 16 middleware = `proxy.ts` convention (yerel doc doğrulandı). X publish adapter yok. Hesaplar hardcoded (`src/lib/accounts.ts`).
- Token isimleri stabil; 30 primitive (`src/components/ui/`) token tüketiyor.

**X API araştırması:** Faz 0'da developer.x.com'dan RESMÎ teyit (bkz. `03-DELIVERY-ROADMAP` + `DECISIONS`). Pay-per-use = "yeni ücretli servis" → kullanıcı maliyet onayı gerekir.

**Verilen kararlar (DECISIONS.md'ye işlenir):**
- Yeni branch `feature/cemos-rebuild` (mevcut HEAD'den; push yok). **Untracked dosyalar:** master prompt Faz 0 doc dalgasıyla commit edilir; `shots/` kanıt galerisi olarak untracked kalır.
- Açık editorial tema varsayılan; token isimleri korunur, değerler flip. **Vurgu rengi = İLK TASARIM HİPOTEZİ** (Faz 0 tasarım araştırması + kontrast tablolarıyla tasarım onay kapısında DONDURULUR).
- Readiness persist edilmez; her zaman `editedContent ?? content` üzerinden türetilir.
- Otomatik yayın ASLA yok; insan onayı her yolda kalır.

**Legacy invariant'lar (dokunulmaz):** `useXAgentStore`/`useCemOsStore`, `"xagent-store"` anahtarı, `XAgentApp.tsx`, `src/store/xagent.ts`, User-Agent kimlikleri, additive-only şema, push/deploy yalnız kullanıcı isteğiyle.

---

## Yeni Bilgi Mimarisi (bağlayıcı)

Ana nav: **Bugün · Plan · Kütüphane** + Toolbox (hızlı utility) + Profil menüsü.

| Alan | Alt-nav | İçerik |
|---|---|---|
| **Bugün** | (yok) | Karar kuyruğu + detay drawer |
| **Plan** | Takvim · Fırsatlar · Seriler | Aşağıdaki modül dağılımına göre |
| **Kütüphane** | Tümü · İlham · Öğrenme | Unified arama / boards+rakip analizi / Learn akışı |
| **Toolbox** | (mevcut) | Araç dizini |
| **Profil** | CemOS'un bildikleri · Entegrasyonlar · Sistem · Maliyet · Ayarlar | Memory, credential/izin, 3-katman sağlık, cost, settings |

**Plan modül dağılımı:**
- **Seriler:** Carousel/Reels seri DNA'sı, görsel düzen, caption yapısı, hashtag düzeni, hook kalıpları, seri performansı (`SeriesDnaSection` + SeriesProfile/CaptionDna/HashtagDna).
- **Fırsatlar:** Rakip radarları (`CompetitorRadarSection` içeriği burada), trendler, haber buzz, YouTube fırsatları, sektör taraması, tanıtılabilecek siteler — editoryal seçilmiş birkaç fırsat + "ham araştırmaya in" detayı.
- **Takvim:** Seçilen fırsattan üretilmiş reels dossier'i (`ReelsDossierSection` içeriği burada), senaryo, aylık yayın yerleşimi (ReelPlan + Schedule).

**Legacy ekran kaderi — iki sınıf, üçüncüsü yok:**
> Cmd+K, deep-link veya herhangi bir kullanıcı akışıyla erişilebilen HİÇBİR ekran legacy görsel kompozisyonla kalamaz.
- **ABSORBED (kullanıcı erişiminden çıkar):** yeni yüzey işlevi tam karşılıyorsa eski ekran registry'den kullanıcı erişimine kapanır, id'si alias'la yeni eve yönlenir. Adaylar: `daily-queue`→Bugün, `viral-library`/`keyword-library`/`prompt-library`/`pattern-library`→Kütüphane-Tümü, `learn-dashboard`→Öğrenme, `instagram`→Seriler+Fırsatlar+Takvim (bölünür).
- **REDESIGNED-ADVANCED (araştırma detayı olarak kalır, tam yeniden tasarlanır):** `news-pool`, `youtube`, `flow-radar`, `discovery-engine`, `source-intelligence` — Fırsatlar'dan ve Cmd+K'dan açılan araştırma-detay yüzeyleri; 05 spec'te her biri için yeni kompozisyon tanımlanır ve Faz 1D'de yeni sisteme taşınır. "Minimum token uyumu" seçeneği YOK.
- Nihai sınıflandırma ekran-bazında `04-COMPLETE-UI-REDESIGN-PLAN.md` tablosunda kesinleşir; her satır ya ABSORBED ya REDESIGNED-ADVANCED.

**Store migration v9 (kesin kural):** `migrations.ts`'e additive v9. **YALNIZ ABSORBED id'ler migrate edilir** (ör. `daily-queue`→`morning`, `viral-library`/`keyword-library`/`prompt-library`/`pattern-library`→`lib-tumu`, `learn-dashboard`→`lib-ogrenme`, `instagram`→`plan-seriler`). **REDESIGNED-ADVANCED id'ler (`news-pool`, `youtube`, `flow-radar`, `discovery-engine`, `source-intelligence`) DEĞİŞTİRİLMEZ** — persist edilmiş `youtube` yeni tasarlanmış YouTube araştırma ekranını açar; `TAB_ALIASES` onları yeni eve zorlamaz. Fırsatlar ekranındaki bağlantılar advanced ekranları doğrudan açabilir. `"xagent-store"` anahtarı değişmez. `migrations.test.ts` v9 vakalarıyla (her iki sınıf için) genişler.

---

## Publish state sözleşmesi (bağlayıcı)

- **ready:** persist edilmeyen türetilmiş durum; her hesaplamada `editedContent ?? content` (güncel metin) üzerinden, yayın anında YENİDEN çalıştırılır (eski üretim sonucu baz alınmaz).
- **approved:** `QueueItem.status` değeri (mevcut sözlüğe uyumlu).
- **publish_prepared / succeeded / failed:** mevcut `PublishLog` ZORLANMAZ (success default true, publishedAt zorunlu/now, queueItemId yok — prepared için uygunsuz; günlük limit sorgularını kirletir). Yerine **additive `PublishAttempt` modeli**:
  ```prisma
  model PublishAttempt {
    id                      String    @id @default(cuid())
    queueItemId             String
    accountId               String
    adapter                 String    // "intent" | "x_api"
    state                   String    // "prepared" | "succeeded" | "failed"
    idempotencyKey          String
    contentHash             String
    readinessPolicyVersion  String
    readinessSnapshotJson   String    // karar + kanıt snapshot'ı (yalnız versiyon değil)
    errorKind               String?
    externalId              String?
    createdAt               DateTime  @default(now())
    completedAt             DateTime?
    queueItem               QueueItem @relation(fields: [queueItemId], references: [id])
    account                 Account   @relation(fields: [accountId], references: [id])
    @@unique([accountId, adapter, idempotencyKey])
    @@index([queueItemId])
    @@index([state])
  }
  ```
- Intent penceresi açmak = YALNIZ `PublishAttempt(state:"prepared")` satırı; PublishLog ve PublishedPost YARATMAZ.
- **PublishLog + PublishedPost:** yalnız (a) kullanıcının manuel "Paylaşıldı" onayı veya (b) gerçek API başarısı sonrası oluşur; QueueItem status güncellemesi, PublishLog ve PublishedPost yazımları **aynı transaction** içinde (`prisma.$transaction`). Ağ çağrısı transaction'ın DIŞINDA tutulur.
- **Reconciliation:** API başarılı olup DB finalizasyonu düşerse idempotent retry yolu — aynı `idempotencyKey`'li attempt `externalId` taşıyorsa finalizasyon tekrar denenir, ikinci API çağrısı yapılmaz.
- Duplicate önleme: `@@unique([accountId, adapter, idempotencyKey])` + `contentHash` karşılaştırması.
- CTA dili: intent fallback'te "X'te aç"; "Onayla ve yayınla" yalnız gerçek API adapter'ı bağlıyken.

---

## Faz 0 — Araştırma + BÜTÜN ekranların eksiksiz tasarımı

1. Untracked dosya kararı uygulanır; `git checkout -b feature/cemos-rebuild`; baseline koşuları sonuçlarıyla kaydedilir. ✅
2. Canlı deploy read-only kontrol (Playwright MCP, temiz context, mutation yok). ✅
3. **Resmî X API araştırması (developer.x.com):** feasibility + maliyet projeksiyonu → DECISIONS + 03-ROADMAP. Engel varsa `BLOCKED-EXTERNAL`.
4. Tasarım referans araştırması (Linear/Typefully/Notion/Buffer) + vurgu rengi hipotez testi → 06 spec.
5. Belgeler (`docs/cemos-rebuild/`): 00 → DECISIONS → 01 → 04 → **05 (BÜTÜN kullanıcı-erişilebilir yüzeyler, SPEC-PENDING'siz)** → 06 → 02 → 03 → IMPLEMENTATION-STATE.
6. **Tek tasarım onay kapısı:** shell + Bugün + Plan + Kütüphane + mobil örnek mockup'ları tek pakette kullanıcıya; vurgu rengi burada dondurulur; onay sonrası kodlama.

## Faz 1 — dilimler (her dilim sonunda test+typecheck+lint yeşil)

### 1A — Auth + design system
**Auth:**
- `src/proxy.ts` (YENİ): allow-list `/giris`, `/api/auth/*`, `/api/cron/*` (CRON_SECRET fail-closed mevcut), `_next`/static. Prod'da env eksikse fail-closed `/giris?setup=1`; dev pass-through.
- Ayrı sırlar: `ACCESS_PASSWORD_HASH` (scrypt; düz parola env'de tutulmaz) + `SESSION_SECRET` (cookie HMAC-SHA256, Web Crypto edge-safe). `requiredSecrets.ts` + `.env.example`.
- **Throttling güvenlik sözleşmesi:** DB-backed kalıcı sayaç (küçük additive model, default'lu, prod-safe). Ham IP SAKLANMAZ — `HMAC(ip, SESSION_SECRET)`; istemci IP yalnız güvenilir Vercel forwarding zincirinden; artırma atomik (upsert/increment); TTL + fırsatçı sweep; IP-bazlı sınıra EK global saldırı penceresi; başarılı girişte sayaç sıfırlanır. Vercel Firewall/WAF önerisi DECISIONS'a kullanıcı aksiyonu olarak.
- `src/lib/auth/session.ts` (pure sign/verify + testler), `giris/page.tsx`, `api/auth/login|logout` (constant-time hash compare). Cookie httpOnly/Secure/Lax/30g.
- E2E: `webServer.env` + globalSetup login → `storageState`; `access-gate.spec.ts`; `reuseExistingServer` keyless server kullanmasın.
- sameOriginGuard CSRF katmanı olarak kalır ("same-origin ≠ authentication" DECISIONS'a).

**Design system:** `globals.css` değer-flip (onaylanan palet), `--content-max: 960px`, hardcoded-koyu grep→token, `theme-tokens.test.ts` yeni BANNED listesi, `PageScaffold` content-max, 30 primitive WCAG AA + focus. Screenshot kanıtı.

### 1B — Tamamen yeni shell/sidebar + store v9
- `navConfig.ts`: `PRIMARY_AREAS` → `bugun` [morning] / `plan` [plan-takvim, plan-firsatlar, plan-seriler] / `kutuphane` [lib-tumu, lib-ilham, lib-ogrenme]. `AREA_ALIASES {uretim→plan, kesif→plan, hafiza→kutuphane}`. ABSORBED id'ler `TAB_ALIASES`'a; REDESIGNED-ADVANCED id'ler `ADVANCED_TABS` (nav-dışı, Cmd+K + detay linkinden, alias'lanmaz). `UTILITY_TABS`: toolbox; `PROFILE_TABS`: memory/entegrasyonlar/system/costs/settings.
- `src/store/migrations.ts`: **v9 additive migration** — YALNIZ ABSORBED `activeTab` değerleri taşınır; advanced id'ler dokunulmaz; `"xagent-store"` anahtarı aynı. `migrations.test.ts` genişler.
- `screenRegistry.tsx`: 6 yeni host + advanced kayıtlar. `Sidebar.tsx` dar rail; `ProfileMenu.tsx` (YENİ); `MobileNav.tsx` 3+1. `navConfig` testleri + `shell-smoke.spec.ts` aynı commit.

### 1C — Bugün + gerçek readiness
**Readiness (fail-closed):** `src/lib/services/readinessService.ts` (pure), her çağrıda `editedContent ?? content` üzerinden:
- `judged=false` veya skor eksik/legacy → ASLA `ready`; varsayılan `needs_edit`.
- `blocked` YALNIZ: güvenlik sınıfı leak, ciddi doğruluk sorunu, kaynaksız somut sayı/ürün iddiası, policy ihlali. Stil kusuru blocked yapmaz.
- `needs_edit`: `applyQualityGate` tetikleyicileri + hesap-BAZLI politikalar (soru CTA/emoji kuralları `accounts.ts` profillerinden; global yasak yok).
- Yabancı sızıntı: Türkçe-dışı token oranı + marka/teknik terim allowlist'i (kelime-özel "Trajectory" kontrolü değil).
- **Thread (KAPSAM KARARI — seçenek 1):** `threadSegments` typed additive alan (QueueItem'a JSON kolon, Zod şemalı segment listesi) **Faz 1C'de eklenir** + DraftReviewCard'a basit segment editörü (segment ekle/böl/birleştir/sırala). Readiness: yapısal `threadSegments` verisi olan thread segment-bazlı doğrulanır (her segment char-limit + sıra bütünlüğü); segment verisi OLMAYAN thread taslağı fail-closed `needs_edit` — metindeki `1/` numaralandırma kanıt SAYILMAZ. **Faz 2 tekrar typed alan eklemez — yalnız üretim hattının doğrudan segment üretmesi + backfill + kalibrasyon.**
- `publishService.ts`: edit-gate yerine yayın anında readiness re-run; `needs_edit`→`edit_required`, `blocked`→throw + 422 Türkçe. `:156` literal cast genişletilir.
- `__fixtures__/badDrafts.ts` (6 gözlenen kötü taslak) + `readinessService.regression.test.ts` (hiçbiri ready; bilinen-iyi ready). Assert'ler canlı queue verisiyle ayarlanıp dondurulur.

**Doğrulama durumları (kaynak ≠ fact-check):** `whyToday.ts` (pure) → `verification: verified | partially_verified | source_available | unverified | stale`; `SourcePost.scannedAt` iddia doğrulama tarihi olarak GÖSTERİLMEZ; "fact-check" dili yalnız verified'da.

**UI:** `DraftReviewCard.tsx` yeniden (hesap/platform, metin+medya, Neden bugün?, 5-durumlu doğrulama çipi, Düzenle + duruma göre CTA + X'te aç; UI edit-gate silinir; A/E/J/K; `data-readiness`). Detay drawer: kaynaklar+doğrulama durumu/tarihi, SubSignals, alternatif hook'lar, originality, hesap uyumu, `GenerationRun` audit izi, model/maliyet katlanmış. Kuyruk endpoint payload genişler. `ReviewQueue`/`MorningDashboardTab`/`OperatorReadinessGate` yeni sisteme. E2E: readiness spec + `bugun-queue.spec.ts` (1280+390).

### 1D — Kullanıcı-erişilebilir yüzeylerin TAMAMI yeni sisteme
Faz 1 sonunda legacy kompozisyonlu, erişilebilir ekran SIFIR:
- **Plan/Takvim** (`src/components/plan/TakvimTab.tsx`): yayın takvimi + reels dossier detayları (`ReelsDossierSection` içeriği yeni kompozisyonda buraya).
- **Plan/Fırsatlar** (`FirsatlarTab.tsx`): rakip radarı (`CompetitorRadarSection` içeriği), haber buzz, YT fırsat, viral radar, keşif — seçilmiş fırsatlar (mevcut API'ler, deterministik editoryal sıralama) + araştırma-detay linkleri.
- **Plan/Seriler** (`SerilerTab.tsx`): seri DNA, görsel düzen, caption/hashtag yapısı, hook kalıpları, seri performansı (`SeriesDnaSection` + DNA modelleri).
- **Kütüphane/Tümü** (`LibTumuTab.tsx`): 4 kütüphanenin birleşik aramalı yüzeyi (ABSORBED). **İlham** (`LibIlhamTab.tsx`): boards + rakip içerik analizi. **Öğrenme** (`LibOgrenmeTab.tsx`): Inbox/Öğreniliyor/Hazır/Bugünkü tekrar (env gate korunur).
- **Toolbox** + **Profil 5 yüzeyi** (CemOS'un bildikleri, Entegrasyonlar, Sistem, Maliyet, Ayarlar) — 05 spec kompozisyonuyla.
- **5 REDESIGNED-ADVANCED araştırma ekranı** (`news-pool`, `youtube`, `flow-radar`, `discovery-engine`, `source-intelligence`): 05 spec'teki yeni araştırma-detay kompozisyonlarıyla yeniden yapılır (shell içinde, yeni primitive'lerle).
- E2E: alan başına smoke; 1280+390 screenshot seti.

### 1E — Dürüst publish state machine + X API entegrasyon kararı
- Publish state sözleşmesi implement edilir: additive `PublishAttempt` modeli + intent → `PublishAttempt(prepared)` (PublishLog/PublishedPost yok), manuel onay → transaction içinde `manual_published` + PublishLog + PublishedPost, API başarısı → transaction içinde `published` + `externalId` + PublishLog + PublishedPost; idempotent reconciliation yolu.
- `src/lib/publish/adapter.ts`: Zod-typed `PublishAdapter`; `IntentPublishAdapter` + `XApiPublishAdapter`. Faz 0 feasibility'ye göre: credential + KULLANICI MALİYET ONAYI varsa gerçek OAuth2 publish (idempotency, media, rate-limit hata taksonomisi); yoksa contract+testler tam, `BLOCKED-EXTERNAL`. Pay-per-use maliyeti "yeni ücretli servis" dur-kuralına girer → kullanıcıya projeksiyon sunulur.
- Status geçiş + adapter contract + duplicate-önleme testleri.

### 1F — Ayrıştırılmış sağlık sistemi
`healthService.ts` üç contract: **altyapı** (DB, cron auth, API anahtarları, credential süreleri) / **pipeline tazeliği** (haber akışı, failed backlog, staleness, son başarılı üretim) / **bugünkü hazırlık** (hazır içerik, karar bekleyen; "kuyruk tamamlandı" ≠ sağlıksız). Topbar yalnız kullanıcı-müdahalesi-gereken; Profil/Sistem tam döküm. Testler üç contract'a göre.

**Faz 1 kapanışı:** tam gate (test/typecheck/lint/build/e2e), `IMPLEMENTATION-STATE.md`, memory güncellemesi, screenshot kanıt seti.

**Faz 1'in doğru tanımı:** "CemOS tamamen bitti" DEĞİL — "CemOS'un yeni ürün yapısı, bütün arayüzü ve güvenilir günlük kullanım çekirdeği tamamlandı." Agent registry, derin hafıza öğrenmesi, tam Reels motoru ve Obsidian otomasyonu Faz 2-4 kapsamındadır; raporlama bu dille yapılır.

## Doğrulama
- Her dilim: `npm test && npm run typecheck && npm run lint`; UI dilimlerinde `build` + `playwright` + 1280/390 screenshot.
- Faz 1 kabul: giriş kapısı canlı (ayrı hash+secret, HMAC'li atomik throttling); ana nav yalnız Bugün/Plan/Kütüphane; alt-nav görev-bazlı; **kullanıcı-erişilebilir legacy kompozisyon SIFIR**; store v9 migration eski activeTab'ları taşıyor, `xagent-store` anahtarı aynı; Bugün kartında kaynak+neden-bugün+5-durumlu doğrulama; 6 kötü-taslak fixture'ı ve judged=false ready olamıyor; intent akışı PublishedPost yaratmıyor; sağlık 3 katman; console error 0; 320-1440 taşma yok; klavye akışı tam.
- Canlı LLM harcaması yok (budget-gate'li mevcut akışlar dışında üretim tetiklenmez); X API harcaması yalnız kullanıcı maliyet onayı sonrası.

## Riskler / uygulama sırasında doğrulanacaklar
1. X API pay-per-use resmî teyit; link'li post kalemi maliyet projeksiyonunda.
2. `blocked` kriter seti canlı queue verisiyle ayarlanmadan dondurulmaz.
3. `processFeedback` union'ı + literal account cast genişletmesi.
4. Kuyruk endpoint'i teyidi (1C başında).
5. Playwright `webServer.env`/globalSetup/`reuseExistingServer` etkileşimi.
6. 1D kapsam riski (6 host + 5 advanced yüzey): 05 spec kabul kriterlerine sıkı bağlılık; derin işlev Faz 2-4'te — 1D görünür kompozisyonu taşır.
7. Faz 1 additive şema değişiklikleri (throttling tablosu, `PublishAttempt`, `QueueItem.threadSegments`): default'lu, production-safe, `prisma migrate diff` ile additive kanıtı; destructive değişiklik yasak.
8. ABSORBED ekranlarda kaybolabilecek niş işlevler (ör. keyword library'nin özel filtreleri): 04 tablosunda ekran başına işlev-envanteri; kayıp işlev DECISIONS'ta gerekçelendirilir.

## Faz 2+ (iskelet — ayrı yürütülür)
- Faz 2: agent registry contract, memory governance derinleşmesi, edit-diff/red/onay öğrenme sinyalleri, dinamik hesap kaynağı, **thread üretim hattı: doğrudan segment üretimi + mevcut thread'lerin backfill'i + kalite kalibrasyonu (yeni typed alan YOK — `threadSegments` Faz 1C'de eklendi)**, X publish kalibrasyonu, trace/cost gözlemlenebilirlik.
- Faz 3: Reels dossier/plan derinleşmesi, DNA editör akışları, Meta fallback'leri.
- Faz 4: İlham capture + yapısal analiz, Learn/Obsidian uçtan uca, ABSORBED ekran kodunun emekliliği (compatibility kanıtıyla).
