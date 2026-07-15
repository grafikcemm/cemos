# DECISIONS — CemOS Rebuild (append-only ADR)

> Her karar: bağlam → karar → gerekçe → kanıt/kaynak. Append-only; bir karar değişirse yeni ADR eklenir, eski SUPERSEDED işaretlenir. Tarih formatı mutlak.

---

### ADR-001 — Branch: `feature/cemos-rebuild`
**2026-07-15.** Mevcut `feature/ui-dark-redesign` HEAD (`f8b72b8`) üzerinden yeni branch açıldı. Push YOK. **Gerekçe:** dark-redesign primitive'leri + baseline'ı temel almak; kullanıcı onayı olmadan yayına çıkmamak. **Kanıt:** `git checkout -b` çıktısı "Switched to a new branch".

### ADR-002 — Untracked dosya kaderi
**2026-07-15.** `docs/CEMOS-CLAUDE-CODE-MASTER-REBUILD-PROMPT.md` Faz 0 doküman commit'ine dahil edilir. `shots/` kanıt galerisi olarak **untracked bırakılır**; kullanıcı izni olmadan `.gitignore` değiştirilmez. **Gerekçe:** master prompt bağlayıcı kaynak, versiyonlanmalı; ekran görüntüleri büyük binary, repo'yu şişirir ama kanıt olarak diskte kalmalı.

### ADR-003 — Açık editorial tema, token isimleri stabil
**2026-07-15.** Varsayılan tema koyu dashboard'dan **açık editorial**'e geçer (master prompt emri). `globals.css` token DEĞERLERİ flip edilir, token İSİMLERİ korunur → 30 primitive kırılmadan çalışır. **Gerekçe:** isim-stabil swap, component başına refactor riskini ortadan kaldırır. **Kanıt:** `src/components/ui/` 30 primitive tümü `var(--token)` tüketiyor (keşif).

### ADR-004 — Vurgu rengi: tasarım onay kapısında dondurulur
**2026-07-15.** Turuncu (`#ff5538` ailesi) yalnız İLK HİPOTEZ; kesin karar değil. Faz 0 tasarım araştırması 3 accent adayı + WCAG AA kontrast tablosu üretir; kullanıcı tasarım onay kapısında dondurur. **Gerekçe:** kullanıcı v2/v3 geri bildiriminde "turuncuyu önceden verilmiş karar sayma" dedi. **Durum:** design research sonucu 06 spec'e işlenecek; kullanıcı seçecek.

### ADR-005 — IA: 3 görev (Bugün/Plan/Kütüphane) + Toolbox + Profil
**2026-07-15.** Ana nav 3 göreve iner; Toolbox hızlı utility; Sistem/Maliyet/Ayarlar/Memory/Entegrasyonlar Profil menüsünde. Legacy motor adları (Haber/YouTube/Viral Radar/Keşif) alt-nav'dan çıkar → Plan/Fırsatlar'ı besleyen arka plan. **Gerekçe:** master prompt "ana nav yalnız görev göstersin"; canlı denetim ~16-item sidebar'ı doğruladı (karmaşıklık kanıtı). **Kanıt:** `shots/cemos-rebuild/baseline/prod-1280-morning-styled.jpeg`.

### ADR-006 — Legacy ekran: iki sınıf (ABSORBED / REDESIGNED-ADVANCED), üçüncüsü yok
**2026-07-15.** Kullanıcı-erişilebilir HİÇBİR ekran legacy kompozisyonla kalamaz. Her ekran ya ABSORBED (erişimden çıkar, id alias'la yeni eve) ya REDESIGNED-ADVANCED (araştırma detayı, tam yeniden tasarlanır). "Minimum token uyumu" ara sınıfı YASAK. **Gerekçe:** kullanıcı v3 geri bildirimi — "erişilebilir ekran = uygulamanın parçası, legacy kalamaz". Nihai tablo: `04-COMPLETE-UI-REDESIGN-PLAN.md`.

### ADR-007 — Store migration v9: yalnız ABSORBED id'ler taşınır
**2026-07-15.** `migrations.ts`'e additive v9. YALNIZ ABSORBED `activeTab` değerleri yeni evlere migrate edilir. REDESIGNED-ADVANCED id'ler (`news-pool`,`youtube`,`flow-radar`,`discovery-engine`,`source-intelligence`) DEĞİŞMEZ — persist `youtube` yeni YouTube araştırma ekranını açar. `"xagent-store"` anahtarı DEĞİŞMEZ (rename = kullanıcı state kaybı). **Gerekçe:** kullanıcı düzeltmesi — advanced ID'leri migrate etmek onları erişilemez/yanlış-açar yapardı. **Kanıt:** `xagent.ts:358` activeTab persist; `migrations.ts` v8 mevcut.

### ADR-008 — Readiness sözleşmesi: `ready/needs_edit/blocked`, fail-closed, persist EDİLMEZ
**2026-07-15.** Zorunlu kozmetik edit-gate (`publishService.ts:97-104`) kaldırılır; yerine readiness. Persist edilmez; yayın anında `editedContent ?? content` üzerinden YENİDEN hesaplanır. `judged=false`/skor eksik → ASLA ready (fail-closed → needs_edit). `blocked` yalnız güvenlik/ciddi doğruluk/kaynaksız somut iddia/policy; stil kusuru blocked yapmaz. Soru-CTA/emoji kuralları hesap-bazlı (`accounts.ts`), global yasak yok. **Gerekçe:** master prompt + kullanıcı fail-closed düzeltmesi. `applyQualityGate` SARILIR, değiştirilmez.

### ADR-009 — Yabancı sızıntı: oran + allowlist (kelime-özel değil)
**2026-07-15.** "Trajectory" gibi sızıntılar için kelime-özel kontrol YAZILMAZ; Türkçe-dışı token oranı + marka/teknik terim allowlist'i (`AI`, `prompt`, ürün adları). **Gerekçe:** kullanıcı düzeltmesi — tek kelime kontrolü kırılgan, genellenebilir tespit gerekir. **Kanıt:** canlı taslakta "yörüngedir" (Trajectory çevirisi) gözlendi.

### ADR-010 — Thread: `threadSegments` typed alan Faz 1C'de, fail-closed
**2026-07-15.** `QueueItem.threadSegments` typed additive JSON alanı + basit segment editörü **Faz 1C'de** eklenir. Yapısal segment verisi olmayan thread taslağı fail-closed `needs_edit`; metindeki `1/` kanıt sayılmaz. **Faz 2 tekrar typed alan EKLEMEZ** — yalnız üretim hattı segment üretimi + backfill + kalibrasyon. **Gerekçe:** kullanıcı "belirsiz bırakma, seçenek seç" → seçenek 1 (alanı Faz 1C'ye al). Kullanıcının son yorumu bu düzeltmeyi bağladı.

### ADR-011 — Publish state machine: additive `PublishAttempt`, intent ≠ published
**2026-07-15.** Mevcut `PublishLog` prepared için ZORLANMAZ (success default true, publishedAt now, queueItemId yok → günlük limit sorgularını kirletir). Additive `PublishAttempt` modeli (prepared|succeeded|failed, adapter, idempotencyKey, contentHash, readinessPolicyVersion, readinessSnapshotJson, externalId, `@@unique([accountId,adapter,idempotencyKey])`). Intent = yalnız `PublishAttempt(prepared)`; PublishLog+PublishedPost yalnız manuel "Paylaşıldı" onayı VEYA API başarısı (aynı transaction). Ağ çağrısı transaction dışında; idempotent reconciliation. **Gerekçe:** kullanıcı düzeltmesi — intent açmak yayın başarısı değildir; PublishLog modeli prepared'a uygun değil. **Kanıt:** `prisma/schema.prisma` PublishLog (success bool, publishedAt now).

### ADR-012 — Doğrulama ≠ fact-check: 5 durum
**2026-07-15.** UI doğrulama durumu ayrık: `verified | partially_verified | source_available | unverified | stale`. `SourcePost.scannedAt` iddia doğrulama tarihi olarak GÖSTERİLMEZ. "fact-check tamamlandı" dili yalnız `verified`. **Gerekçe:** kullanıcı düzeltmesi — kaynak varlığı ≠ doğruluk kontrolü.

### ADR-013 — Auth: `proxy.ts` + ayrı hash+secret + HMAC'li kalıcı throttling
**2026-07-15.** Next 16 middleware = `proxy.ts` (yerel doc doğrulandı). `ACCESS_PASSWORD_HASH` (scrypt) ≠ `SESSION_SECRET` (cookie HMAC). Throttling: DB-backed atomik sayaç, ham IP saklanmaz (`HMAC(ip, SESSION_SECRET)`), güvenilir Vercel forwarding zincirinden IP, TTL+sweep, IP-sınır + global saldırı penceresi, başarıda sıfırlama. Prod'da env eksikse fail-closed. sameOriginGuard CSRF olarak kalır — **same-origin ≠ authentication**. **Gerekçe:** master prompt P0 + kullanıcı sertleştirme düzeltmesi; canlı denetim auth'suz erişimi doğruladı. **Kanıt:** `node_modules/next/dist/docs/.../proxy.md`; `shots/cemos-rebuild/baseline/`.
**[USER-ACTION]** Vercel Firewall/WAF (rate-limit) operasyonel öneri — kod-üstü ek katman.

### ADR-014 — 3 katmanlı sağlık
**2026-07-15.** `healthService` → altyapı (DB/cron/API/credential) + pipeline tazeliği (haber/failed-backlog/staleness/son-üretim) + bugünkü hazırlık (hazır içerik/karar-bekleyen). "Kuyruk tamamlandı" ≠ sağlıksız. Topbar yalnız kullanıcı-müdahalesi-gereken. **Gerekçe:** kullanıcı düzeltmesi — canlı "Sağlıklı" ile gerçek backlog karışabilir; tamamlanma ≠ üretim-hiç-olmadı.

### ADR-015 — X API: REQUIRES-USER-PAYMENT-APPROVAL (teknik FEASIBLE)
**2026-07-15.** Resmî developer.x.com/docs.x.com araştırması: `POST /2/tweets` OAuth2 PKCE user-context ile fizibil; scope `tweet.read tweet.write users.read offline.access`; rate limit 100/15dk-per-user (bağlayıcı değil); politika insan-onaylı özgün postu izin veriyor. **ENGEL:** yeni geliştiriciye free tier YOK; pay-per-use kredisi gerçek ödeme gerektiriyor. **Maliyet senaryosu** (resmî orandan türetildi — $0.015/post, **link'li $0.20/post**, okuma $0.005/post; 5-8 post/gün × 30 gün): %0 link **$2.25–3.60/ay** · %50 link **$16.13–25.80/ay** · %100 link **$30–48/ay**. Ek: okuma maliyeti, media/metadata işlemleri (resmî tabloda ayrı kalem yok — açık), retry ihtimali; fiyatlar değişebilir → güncel fiyat **Developer Console**'dan doğrulanır. Bu "yeni ücretli servis" dur-kuralına girer → Ali Cem onayı olmadan gerçek entegrasyon BAŞLAMAZ. **Açık mühendislik riskleri (blocker değil, tasarlanacak):** (1) sunucu-taraf idempotency YOK → client-side dedup; (2) belgesiz duplicate-content 403 penceresi. **Kanıt:** [docs.x.com/x-api/getting-started/pricing](https://docs.x.com/x-api/getting-started/pricing), [create-post](https://docs.x.com/x-api/posts/create-post), [OAuth2 PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), [rate-limits](https://docs.x.com/x-api/fundamentals/rate-limits) (erişim 2026-07-15). Detay: `03-DELIVERY-ROADMAP.md` + `02-AGENT-MEMORY-DATA-ARCHITECTURE.md` publish bölümü.
**Sonuç:** Faz 1E'de adapter CONTRACT + intent fallback tamamlanır; gerçek `XApiPublishAdapter` yalnız kullanıcı maliyet onayı sonrası. Onaya kadar `BLOCKED-EXTERNAL`.

### ADR-016 — Dinamik hesap kaynağı: Faz 2'ye ertelenir (Faz 1 minimal)
**2026-07-15.** Hesaplar `src/lib/accounts.ts`'te hardcoded (literal union `grafikcem|maskulenkod`). Master prompt "DB/config'den dinamik oku" istiyor. **Karar:** Faz 1'de UI hesap filtreleri `Account` DB tablosundan okunabilir (mevcut model), fakat persona/mode source-of-truth Faz 2'ye kadar TS profillerinde kalır (literal cast genişletilir, hardcode 2-hesap varsayımı UI'dan kalkar). **Gerekçe:** tam dinamikleştirme veri-modeli işi; Faz 1 çekirdeği bloklamamalı. **Risk:** `publishService.ts:156` literal cast — Faz 1'de genişletilir.

### ADR-017 — Tasarım onayı + bağlayıcı kullanıcı kararları (Faz 0 kapısı)
**2026-07-15.** Kullanıcı (Ali Cem) tasarım yönünü ONAYLADI. Bağlayıcı kararlar:
1. **Accent = Terracotta/Rust `#A8481F`** (indigo/plum elendi). Açık zeminde ve beyaz metinle AA geçer.
2. **X API ödemesi ONAYLANMADI.** Faz 1E gerçek X API çağrısı YAPMAZ — yalnız `PublishAdapter` contract + `PublishAttempt` state machine + `IntentPublishAdapter` + dürüst intent fallback tamamlanır. `XApiPublishAdapter` gerçek bağlantı **BLOCKED-EXTERNAL** kalır.
3. **Publish CTA (mevcut ürün durumu):** ready kartın birincil CTA'sı **"X'te aç"** (intent) — "Onayla ve yayınla" GÖSTERİLMEZ. Intent açıldıktan sonra kart durumu **`publish_prepared`**; kullanıcı geri döndüğünde ayrı **"Paylaşıldı olarak işaretle"** eylemi. Bu manuel onay olmadan PublishLog/PublishedPost/`manual_published` YAZILMAZ. "Onayla ve yayınla" spec'te yalnız **gerçek API bağlı** koşullu varyant; blocked-external mockup'ında görünmez.
4. **Dil:** "X'e otomatik yayın" → "**CemOS içinden doğrudan yayın**" (her yerde). CemOS'ta otomatik yayın YOKTUR.
5. **Doğrulama:** kart ve drawer aynı QueueItem için birebir aynı 5-durum (`verified`/`partially_verified`/`source_available`/`unverified`/`stale`); "kaynak mevcut" ≠ "iddia doğrulandı".
6. **WCAG:** kontrast tabloları gerçek WCAG formülüyle yeniden hesaplandı (ADR-018); token contrast testi Faz 1A kapsamında.
7. **Kısıt:** push/deploy/production migration/ücretli servis YOK. Phase 0 belgeleri + master prompt `feature/cemos-rebuild`'e commit edilir; `shots/` untracked kalır. Faz 1A→1F sırayla, her dilim ayrı commit + test/typecheck/lint (UI'da +build/playwright/console).

### ADR-018 — WCAG kontrast düzeltmesi (gerçek hesap)
**2026-07-15.** Faz 0 06-spec'teki bazı kontrast değerleri el-hesabı hatalıydı (text-muted 4.6:1 iddia → gerçek 3.39:1; warn chip 3.29:1; ok chip 4.30:1 — 12-16px normal metinde AA-altı). **Düzeltme (gerçek WCAG 2.1 relative-luminance):** `--text-muted` `#8A857D`→**`#726C64`** (bg-base'de **4.80:1** AA); ok chip metni `#256B44` (tint'te **5.50:1**); warn chip metni `#8A5A08` (tint'te **5.05:1**); err chip `#B3261E` (**5.33:1**, korunur). `--text-faint` yalnız dekoratif/disabled — anlam taşıyan metinde KULLANILMAZ. Accent `#A8481F` korunur (bg **5.42:1**, beyaz metin **5.86:1**). Tam tablo `06-DESIGN-SYSTEM-SPEC.md` §2. **Faz 1A:** `theme-tokens.test.ts` gerçek kontrast oranını otomatik doğrular (metin/zemin çiftleri ≥4.5:1).

### ADR-019 — Faz 1B: 3-görevli shell + store v9 + sınıflandırma uygulaması
**2026-07-15.** IA rebuild kod düzeyinde uygulandı.
1. **3 birincil alan:** `PRIMARY_AREAS` = Bugün[morning] · Plan[plan-takvim/plan-firsatlar/plan-seriler] · Kütüphane[lib-tumu/lib-ilham/lib-ogrenme]. Alt-navigasyon workspace'te `SubNav` (Plan/Kütüphane çok-sekmeli; Bugün tek-sekme → subnav yok).
2. **Toolbox = utility, ayrı;** `UTILITY_TABS=[toolbox]`. **costs/system/settings ana navdan Profil menüsüne taşındı** → `PROFILE_TABS` = CemOS'un bildikleri(profile-memory) · Entegrasyonlar(profile-integrations) · Sistem · Maliyet · Ayarlar. Profil = sidebar tetikleyici → yukarı açılan `ProfileMenu` popover (5 yüzey + Çıkış); Profil yüzeyi aktifken workspace'te 5-yüzey `SubNav`.
3. **Collapse KALDIRILDI** (06 §7: "3 item icon-rail'i hak etmez" + onaylı mockup'larda collapse kontrolü yok). Desktop sidebar sabit 232px; ≤640 bottom-nav'a devreder. Bilinçli sadeleştirme — regresyon değil; gerekirse önemsiz eklenir. `COLLAPSE_KEY`/collapsed state silindi.
4. **ABSORBED (TAB_ALIASES + v9 migration):** `daily-queue`→morning, `viral/keyword/prompt/pattern-library`→lib-tumu, `learn-dashboard`→lib-ogrenme, `instagram`→plan-seriler. Eski ekran bileşenleri (ViralLibraryTab…) SİLİNMEZ (emeklilik Faz 4) ama registry'den çıkar → kullanıcı erişimi kesilir.
5. **REDESIGNED-ADVANCED (alias'lanMAZ, v9 dokunmaz):** `news-pool`/`youtube`/`flow-radar`/`discovery-engine`/`source-intelligence` → `ADVANCED_TABS`, `parentArea=plan`. Sidebar'da yok; Cmd+K + deep-link + (Faz 1D) Fırsatlar'dan açılır. Aktifken Plan highlight'lı, breadcrumb "Plan / X", subnav yok.
6. **Store v9:** yalnız ABSORBED `activeTab` yeni eve taşınır; advanced/utility/profile id'leri pass-through. `XAGENT_STORE_NAME="xagent-store"` const'a alındı (legacy invariant — değeri değişmez, test garantisi).
7. **Yeni host ekranları (plan-*, lib-*, profile-memory, profile-integrations):** Faz 1B'de dürüst `HostPlaceholder` (05 empty-state; ölü CTA yok). Tam kompozisyon Faz 1D. Eski dashboard kompozisyonu KOPYALANMADI.
8. **Varsayım:** `lib-ogrenme` her zaman görünür (Öğrenme birinci-sınıf Kütüphane alt-alanı); `NEXT_PUBLIC_LEARN_ENABLED` gate'i Learn ÖZELLİĞİNE taşınır (Faz 1D).
9. **E2E harness sertleştirme:** cold Next-dev ilk-compile 30s'yi aşabildiğinden `global-setup` warmup GET + retry + 120s timeout ile güçlendirildi.

### ADR-020 — Tema kararı DEĞİŞTİ: DESKTOP DARK EDITORIAL (ADR-017 §tema'yı supersede eder)
**2026-07-15 (kullanıcı kararı, Faz 1B sonrası).** Kullanıcı önceki "açık editorial" tema kararını (ADR-017 madde-örtük + ADR-018 açık kontrast tablosu) **değiştirdi**. ADR-017/018 append-only kayıt olarak KALIR (silinmez); tema yönü bu ADR ile güncellenir.
1. **CemOS yalnız DESKTOP.** Mobil artık ürün kabul kriteri değil.
2. **Tek tema = DARK EDITORIAL** (sıcak antrasit/kömür). Light/dark toggle YOK. `color-scheme: dark`.
3. **Terracotta accent KORUNUR** (marka). Eski CemOS mor/violet/neon/glow/glassmorphism YASAK; eski dark dashboard token'ları geri gelmez.
4. **Palet (Faz 1B.5'te uygulandı, gerçek WCAG ile ayarlandı):** bg-base `#101114` · workspace `#131519` · rail `#0D0F12` · sunken `#0D0F13` · surface `#191C21` · elevated `#20242A` · hover `#242830` · border `#2B3038` · border-strong `#3A404A` · text-primary `#F2EFE8` · text-secondary `#B8B2A8` · text-muted `#918B82` · text-faint `#6A655E` (dekoratif) · **accent split:** solid-fill `#A8481F` (+beyaz fg 7.5:1) / text-icon-link-focus `#E4865E` (dark bg'de ~6.6:1). Durum/chart metinleri dark'ta açık varyant (status-error `#E5595E`, ok-text `#56CB8C`, warn-text `#E0A94A`; chart açık terracotta/nötr). Token İSİMLERİ değişmedi — yalnız değerler + dark elevation (siyah gölge, glow yok).
5. **Focus ring** dark'ta `accent-text` (#E4865E, ≥3:1 UI eşiği) — solid accent çok koyu (2.5:1) olduğu için.
6. **Desktop içerik genişliği varyantları:** `--content-reading` 960 · `--content-standard` 1080 · `--content-wide` 1280. Shell ekran-bazlı uygular (Bugün/Toolbox/Profil=standard; Takvim/Kütüphane/advanced=wide); `PageScaffold width` prop reading/standard/wide ile ekran daha da daraltabilir. Hiçbir ekran 1920'ye yayılmaz (max wide 1280, ortalı).
7. **Desktop destek sözleşmesi:** birincil 1280/1440/1920; minimum graceful 1024; **1024–1920 yatay taşma yok**. Eski "1280+390" ve "320–1440" kriterleri bununla değiştirildi (docs güncellendi).
8. **MobileNav + responsive kod** silinmedi — "best-effort / mevcut compatibility". Mobil başarısızlığı desktop ürününün tamamlanmasını engellemez; yeni 390 screenshot/mobil-özel component üretilmez. 05 spec mobil wireframe'leri tarihsel tasarım kaydı (implementasyon zorunluluğu değil).
9. **`theme-tokens.test.ts`** dark'a güncellendi: gerçek WCAG (metin ≥4.5:1, focus ≥3:1), dark-tema-kilidi (yüzey relLum düşük / metin yüksek — açık-temaya dönüş engeli), açık-tema literal regression bans (#f7f6f2…), mor/neon/glow bans korunur. Salt-hex listesi değil — kontrast hesabı gerçek.

### ADR-021 — Kullanıcı-sağlanan desktop dashboard referansı = CemOS'un bağlayıcı görsel yapısı
**2026-07-15 (kullanıcı kararı, Faz 1C öncesi).** Kaynak görsel: `C:\Users\alice\Desktop\8712256020b90f2075e851cdbe1c0b83.jpg` (Rebaid dashboard). ADR-020 dark editorial yönünü **somutlaştırır** (supersede etmez); shell geometrisi + yüzey hiyerarşisi bu referansa yakından hizalanır.
1. **Yapı yakından uygulanır; marka/içerik KOPYALANMAZ.** Rebaid logosu, "Need help" kartı, sahte chart/KPI/avatar üretilmez. CemOS'un gerçek görevleri aynı tasarım sistemine yerleşir.
2. **Shell:** near-black rail (`bg-rail #0D0F12`, `--sidebar-w` 244) + sıcak grafit workspace (`bg-workspace`, float + border, büyük yüzey farkı). İçerik keskin ortalı beyaz panel gibi görünmez.
3. **Sidebar:** logo → **hesap bağlam kartı** (avatar + @handle + "Aktif hesap" + kanal değiştirici) → Bugün/Plan/Kütüphane. **Aktif nav = nötr grafit dolgu** (`bg-elevated`); terracotta yalnız ikon/indicator vurgusu (satırı boyamaz). Toolbox ayrı utility; Profil dipte.
4. **Workspace header:** büyük sayfa başlığı (`PageHeader size="hero"` ~28px, açıklama altında) → segmented pill subnav → gövde. Breadcrumb TopStrip'te ikincil; arama/Cmd-K + sağlık sağ üstte (küçük).
5. **SubNav:** segmented pill rail (koyu gömük rail + açık grafit aktif kapsül; terracotta yalnız aktif ayrıntı).
6. **Kontrollü açık-ada yüzeyleri:** koyu kanvasta ivory (`--inverse-*`) + peach (`--peach-*`) KARAR kartları. Yeni token ailesi (globals.css + @theme mirror), gerçek WCAG (theme-tokens.test): ivory/peach üstünde koyu metin ≥4.5:1, adalar açık kalır (dark-kilit istisnası). **Kullanım:** ready DraftReviewCard = ivory; needs_edit = peach; blocked = koyu hata-tint; kuyruk/ikincil = koyu. Her kart ivory YAPILMAZ, sayfa light'a çevrilmez. `Surface`/`InverseCard`/`PeachCard` primitive'i (ton renkleri `--sf-*` CSS var ile çocuklara akar); hardcoded hex yok.
7. **Bugün ekranı Faz 1D için design archetype'tır** — tüm yüzeyler bu dile taşınacak.

**Yayın sözleşmesi düzeltmesi (bağlayıcı, IMPLEMENTATION-STATE'in "needs_edit → izin ama uyarı" yorumu YANLIŞTI — uygulanmadı):**
- **ready:** intent açılabilir + manuel "Paylaşıldı" onayı yapılabilir (düzenleme ŞART değil).
- **needs_edit:** yayınlanamaz; "Düzenle" ana CTA; intent oluşturulmaz; PublishLog/PublishedPost oluşmaz; servis `edit_required` + nedenler döner.
- **blocked:** yayınlanamaz; intent yok; servis `readiness_blocked`; route 422 + Türkçe nedenler.
- İnsan onayı kalite/policy kapısını SESSİZCE bypass etmez; kullanıcı metni düzenleyerek ready yapar. Kozmetik `edited !== original` edit-gate'i KALDIRILDI; `markManualPublished` yayın anında `editedContent ?? content` üzerinde readiness'i yeniden koşar.

**USER-DB-ACTION (BLOCKED-EXTERNAL değil):** `QueueItem.threadSegments` additive migration'ı (`prisma/migrations/20260716000000_add_thread_segments`) üretildi + `migrate diff` ile additive kanıtlandı ama canlı DB'ye **UYGULANMADI** (kısıt: prisma db push yok). Sonuç: daily-queue gerçek istekte "column does not exist" → 500; Bugün ekranı **graceful ErrorState** gösterir (sessizce gizlenmez). Kullanıcı migration'ı uygulayınca (dev/prod DB'ye `prisma migrate deploy` veya eşdeğeri) gerçek veri akar. Kart tonları mock-preview ile canlı doğrulandı (`shots/faz1c-cards`).
