# IMPLEMENTATION-STATE

> Sonraki oturumun kesin handoff'u. Context daralırsa buradan devam. Güncelleme: 2026-07-16, **PHASE 2C KAPANDI — DUR: Phase 2D'ye onay gelmeden BAŞLAMA. Push/deploy YOK. Phase 2C ≠ Phase 2'nin tamamı (2D/2E kaldı; dilimler: `07-PHASE2-PLAN.md`).**

## Aktif durum

- **Faz: PHASE 2C ✅ KAPANDI (ADR-031 + ADR-032; 2026-07-16).** 10 yeni commit: `df7ff5d`(db: Account profil kolonları + AccountPlatformBinding, migration `20260716210000` saf additive, migrate deploy Neon + seed backfill — iki hesap profileStatus=active doğrulandı read-only) · `65fbeca`(profileRepository: DB runtime source-of-truth, Zod RuntimeAccountProfile, fail-closed isKnownAccountHandleDb/üretim-hazırlık/resolveCronHandles, bootstrap=seed/fixture/işaretli-degraded-fallback) · `ec59598`(tüketici migrasyonu: memory scope + feedback + registry + route doğrulamaları + cron/operator listeleri DB-otoriteli; pipeline/draft üretim girişleri DB profili; heuristik bootstrap Record'ları graceful — başka hesabın personasına düşüş YOK; Sidebar switcher /api/settings'ten, Channel=string) · `1b4acb8`(composio: server-only MCP client `connect.composio.dev/mcp`, JSON-RPC+SSE, retry/timeout/2MB/redaction; çift-katman read-only allowlist + deny-verb + canlı discovery fail-closed; DM tool'ları bilinçli DENY) · `bc3d019`(InstagramReadProvider soyutlaması: Composio birincil + mevcut Meta fallback SARILDI silinmedi; auto/composio/meta seçimi — explicit composio'da sessiz fallback YOK) · `0048699`(bridge sync: binding fail-closed + idempotent IgMedia/IgComment/IgInsightSnapshot upsert + ContentItem köprüsü + AccountPlatformBinding persist; daily cron aşaması + manuel POST /api/instagram/sync; /api/integrations composio girdisi) · `f951de0`(Entegrasyonlar UI: connected/degraded/blocked/config-gerekli + salt-okuma + fallback rozeti + manuel sync) · `0201de1`(7 hermetik e2e) · +test/docs. **Gate:** typecheck 0 · lint 0 err (5 pre-existing warn) · catalog OK · unit **1537/1537** (159 dosya) · build 0 · e2e **72/72** · migrate status up-to-date. Canlı (gerçek Neon, dev 3050): Entegrasyonlar composio kartı dürüst "yapılandırma gerekli", switcher DB'den 2 hesap, console 0, 1024–1920 taşma 0. Kanıt `shots/cemos-rebuild/phase2c-composio/` (01/02/05/06 gerçek; 03/04 HARNESS — açık). **BLOCKED-EXTERNAL:** `COMPOSIO_CONSUMER_API_KEY` güvenli hiçbir kaynakta yok → Claude Code MCP kaydı + canlı Composio discovery/smoke/gerçek sync yapılamadı (kod+test tam; slug'lar toolkit 20260708_00 dokümantasyonundan); rakip business_discovery Composio'da YOK — Meta izni blocker sürüyor. **Yapılmadı:** 2D/2E, Phase 3–4, gerçek X publish, canlı ücretli LLM, push, deploy.
- **Faz: PHASE 2B ✅ KAPANDI (ADR-029 + ADR-030; 2026-07-16).** 11 yeni commit (git geçmişiyle doğrulandı; önceki "12" yazım hatasıydı): `6cd20c2`(handoff düzeltme: 2A=7 commit + 2B haritası) · `48209fe`(MemoryEvidence ledger + canonicalKey, migration `20260716120000` additive, Neon'da) · `10f1406`(governance: OTOMATİK AKTİFLEŞME KALDIRILDI — learned fact 3 kanıtta bile yalnız review-ready; approve server-side fail-closed; atomik approve/rollback/revise; Sahiplen=operator_assertion; cross-account koruması) · `e41a676`(deterministik signal bridge: tag→canonical kural, verbatim operatör reason'ı, mekanik neden ÖĞRENİLMEZ, editDistance tek başına kural üretmez, engagement identity'ye yazılmaz; processFeedback best-effort + haftalık LLM'siz reconciliation, yeni cron yok; registry curator v1.1.0) · `856e114`(kaynaklı knowledge read model + GET /api/memory/knowledge) · `71f759a`(influence provenance: buildIdentityMemoryContext → GroundingContext.memoryFactIds → scores.groundingMemoryFactIds; yalnız aktif id, sahte influence imkânsız) · `6c573e9`(ProfileMemoryTab kaynaklı görünüm) · `7d048cc`+`16796f7`+`c466fd8`(testler) · docs. **Gate:** typecheck 0 · lint 0 err (5 pre-existing warn) · catalog OK · unit **1483/1483** (154 dosya) · build 0 · e2e **65/65** · migrate up-to-date (P1001 cold-start'lar retry ile aşıldı). Canlı (gerçek Neon): 16 aktif kural dürüst legacy rozetiyle, revise drawer, boş performans dersi dürüst; console 0, 1024–1920 taşma 0. Kanıt `shots/cemos-rebuild/faz2b/` (01/05/06/07/08/09 gerçek; 02/03/04 HARNESS — açık). Gerçek identity hafızasına test kuralı YAZILMADI; canlı ücretli LLM çağrısı YOK. **Yapılmadı:** 2C/2D/2E, Phase 3–4, gerçek X publish, canlı eval/kürasyon, push, deploy.
- **Faz: PHASE 2A ✅ KAPANDI (ADR-027 + ADR-028; 2026-07-16).** 7 yeni commit: `b300e84`(Phase-2 dilim haritası + 12-rol envanteri) · `67e5e49`(typed registry: 13 tanım, capability allowlist, fail-fast validate, curator sözleşmesi) · `0ad5f46`(executor + additive trace metadata + drawer, 29 test) · `3d4d13a`(OpportunityHandoff modeli + additive migration `20260716085323`, migrate deploy Neon, status clean) · `acf0591`(handoff servisi + 6 API route + üç yüzeyin gerçek handoff wiring'i + ReviewQueue focusSeed, 21 test) · `dff2479`(6 hermetik e2e) · docs commit'i. **Gate:** typecheck 0 · lint 0 err (5 pre-existing warn) · verify:catalog OK · unit **1448/1448** (151 dosya) · build 0 · e2e **58/58** · migrate status up-to-date. Canlı (gerçek Neon, dev 3050): handoff create→reload persist doğrulandı; Takvim prefilled panel; gerçek yüzeylerde console **0**, 1024–1920 taşma **0**. Kanıt `shots/cemos-rebuild/faz2a/` (01/03/05/06/07 gerçek Neon; 02 blocked + 04 seri + 08 trace HARNESS — açıkça fixture). **KRİTİK:** OpenRouter kredisi artık MEVCUT (ön-kontrol: limit 10, kalan ~7.70) → canlı ücretli çağrı BİLEREK yapılmadı; 2E kürasyon aktivasyonu kullanıcı onayı bekliyor. **Yapılmadı:** 2B–2E, Phase 3–4, gerçek X publish, canlı ücretli eval/kürasyon, push, deploy.
- **Faz (önceki): PHASE 1 ✅ KAPANDI** — 1A/1B/1B.5/1C/1C.1/1C.2/1D/**1D.1/1E/1F** tamam. Phase 2–4 YAPILMADI. Kapanış gate'i (2026-07-16): typecheck 0 · lint 0 err (5 pre-existing warn) · verify:catalog OK · unit **1398/1398** · build 0 · e2e **52/52** · `migrate status` up-to-date. Canlı browser: 1024/1280/1440/1920 taşma 0, console 0, hydration 0, sonsuz skeleton 0.
- **Faz 1D.1 ✅ (commit `8850faa`):** (a) settled-state kapanışı — eski kanıtlar sabit 2.6s beklemeyle skeleton yakalıyordu (Öğrenme gerçek settle ~20s = kanıt zamanlaması); ARTI gerçek kod açığı bulundu: TakvimTab'de /api/settings düşünce/boş dönünce `loading` sonsuza dek true (canlı repro: Neon cold-start 500) → dürüst ErrorState + hesap-reload retry. Semantik işaretler: `[data-skeleton]` + `[data-state=empty|error|blocked]`; kanıt/test artık networkidle DEĞİL semantik settled bekler; e2e "skeleton makul sürede KALKAR" regresyon bloğu. (b) Metrik sadakati — paylaşılan **`MetricStrip`** primitive (tek sessiz biçim); ViralRadar/SourceIntel/Öğrenme MetricGrid hero kartları + YouTubeTab elle satırı → MetricStrip. Kanıt: `shots/cemos-rebuild/faz1d1-success/` (01–10; settled süreleri loglu, gerçek Neon).
- **Faz 1E ✅ (ADR-025; commit'ler `8530245` db · `41c266d` adapters+prepare · `0a3de7b` atomic confirm · `18c8abc`+`bdec0f9` test):** PublishAttempt state machine — intent=YALNIZ prepared (server-side kalıcı; reload-persist canlı Neon'da doğrulandı); manuel onay TEK transaction (attempt+QueueItem+PublishLog+PublishedPost+UsageLog) + idempotent + contentHash/readiness yeniden-koşma kapıları; markManualPublished KALDIRILDI (PATCH bypass kapandı); XApiPublishAdapter kalıcı `payment_approval_required` blocked-external, ağ isteği YOK. **X API gerçek publish hâlâ BLOCKED-EXTERNAL (ödeme onayı yok); intent yayın DEĞİLDİR.** Migration `20260716072050_add_publish_attempt` additive, `migrate deploy` ile Neon'da, status clean.
- **Faz 1F ✅ (ADR-026; commit'ler `c9b2480` feat · `b00c88a` test):** üç sözleşmeli sağlık — infrastructure/pipelineFreshness/todayReadiness + topbar tek-actionable-sinyal (`src/lib/health/`); /api/health additive `contracts`; SystemHealthProvider tek fetch kaynağı; SystemTab üç bölüm + MetricStrip + bölüm-bazlı fail-soft + deep-link; "kuyruk tamamlandı" healthy/neutral, opsiyonel entegrasyon eksiği sistemi kırmızı yapmaz, secret değil yalnız ENV adı. 26 saf test (§6.6 matrisi). Kanıt: `shots/cemos-rebuild/faz1e1f/` (01–05; gerçek Neon: Sistem 3 bölüm dolu, prepared-reload persisted=true, X blocked-external).
- **Faz (önceki): Faz 1D ✅ TAMAM** (ADR-024) — **13 gerçek yüzey**: 8 host placeholder → gerçek + 5 REDESIGNED-ADVANCED arketipe. Kullanıcı-erişilebilir HostPlaceholder = 0. **KULLANICI ONAY KAPISI — Faz 1E/1F onaysız BAŞLAMA.** Commit'ler: `5a7f5bd`(Plan A) · `3077945`(Library B) · `2202869`(Profile C + /api/integrations) · `bfc2920`(News+YouTube D) · `512c373`(advanced E: ViralRadarScreen+SourceIntelScreen) · (+test/docs). 1D-A Takvim/Fırsatlar/Seriler (curation Faz-2-LLM, Fırsatlar eylem=nav-köprü); 1D-B Tümü(/api/library/search)/İlham(greenfield, sahte-AI-yok)/Öğrenme(env-gate); 1D-C Memory/Integrations(env-NAME-only, X-blocked); 1D-D youtube hero→quiet, news-pool+discovery zaten uyumlu; 1D-E flow-radar→ViralRadar(8-KPI kalktı, ScoreBars), source-intel→SourceIntel(ölü Tara/Flow'a-Gönder butonları kalktı, split-pane). Eski FlowRadarTab/SourceIntelligenceTab + hostScreens erişilemez (Faz 4 fiziksel emeklilik). Gate: typecheck 0 · lint 0 · unit **1358** · build 0 · e2e [gate] · migrate up-to-date (1D şema değişikliği YOK). Canlı: 13/13 render + 0 console error (gerçek Neon). Kanıt `shots/cemos-rebuild/faz1d/`.
- **Faz (geçmiş):** Faz 0/P0/1A/1B/1B.5/1C/1C.1 ✅ + **Faz 1C.2 ✅ TAMAM** (shell + DB kapanış: PG baseline, tek sistem-sağlığı, sidebar profil, kart eylem sadeliği, hesap popover, stale/readiness dili — ADR-023). Faz 1C.2 commit'ler: `65c621e`+`0acaaed` fix(db) baseline · `9d27285` fix(shell) · `4c56fea` fix(review) · docs(rebuild). Sıradaki: **Faz 1D** — ama önce **görsel onay kapısı** (ADR-021/022/023; onay gelmeden 1D yok).
- **DB (ADR-023, PG BASELINE UYGULANDI — P3019 çözüldü):** Tek postgres baseline `prisma/migrations/0_init` (71 tablo = 71 model; threadSegments + AuthAttempt dahil). `migration_lock.toml`=postgresql. 7 eski migration `prisma/migrations-archive/`'e taşındı (silinmedi). Canlı DB'ye baseline SQL ÇALIŞTIRILMADI; `migrate resolve --applied 0_init` ile bağlandı. **`migrate status` = up-to-date, P3019 YOK**; `_prisma_migrations` 0_init=applied. daily-queue gerçek Neon **200** (58 item; bugünün kuyruğu boş = dürüst empty state). Read-only doğrulandı (threadSegments=text, AuthAttempt + 3 index). Fresh-target apply çalıştırılmadı (izole PG hedefi yok; construction + "no difference" ile kanıtlı). Gelecekte `migrate deploy` artık kullanılabilir.
- **Tipografi (ADR-022):** Plus Jakarta Sans (Inter kalktı) + AppIcon tek-ikon primitive + özgün CemOS wordmark. Kanıt: `shots/cemos-rebuild/faz1c1-fidelity/`.
- **Branch:** `feature/cemos-rebuild` (`feature/ui-dark-redesign` HEAD `f8b72b8`'den). **Push YOK.**
- **Commit'ler:** `2cd7b24` Faz 0 · `fb90f33` faz1a · `c964979` handoff · `b68e32a` faz1b · `adae802`+`1146aec` handoff/1C-map · `feat(theme)` faz1b.5 dark.
- **Tema (ADR-020, kullanıcı 2026-07-15):** **desktop-only + tek tema DARK EDITORIAL** (light kararı supersede; terracotta korunur). Desktop kabul: 1024/1280/1440/1920, **1024–1920 taşma yok**; mobil best-effort. X API ödemesi ONAYLANMADI (Faz 1E intent-only).

### Faz 1B.5 tamamlanan (feat(theme)) — ADR-020
- **globals.css dark flip** (token İSİMLERİ sabit, DEĞERLER dark): bg-base `#101114`…surface `#191C21`…elevated `#20242A`; text-primary `#F2EFE8`/secondary `#B8B2A8`/muted `#918B82`; accent split solid `#A8481F`(+beyaz fg) / text-link-focus `#E4865E`; siyah gölge (glow yok); `color-scheme:dark`; `--ink` light RGB (scrollbar/chart-grid auto açık); status/chart dark-açık varyant. `chartColors.ts` dark.
- **Desktop genişlik varyantları:** `--content-reading/standard/wide` (960/1080/1280); AppShell ekran-bazlı uygular (Bugün/Toolbox/Profil=standard, Takvim/Kütüphane/advanced=wide); `PageScaffold width` prop eklendi.
- **`theme-tokens.test.ts` dark:** gerçek WCAG (metin ≥4.5:1, focus ≥3:1) + dark-tema-kilidi (yüzey relLum düşük/metin yüksek) + açık-tema literal regression (#f7f6f2…) + mor/neon ban. `:focus-visible` accent-text (dark görünür).
- **Doğrulama:** typecheck ✓ · lint 0 err ✓ · unit **1251/1251** ✓ · build ✓ · e2e **22/22** ✓ · gerçek app dark 1280/1440/1920/1024 — Bugün(gerçek kart)/Plan(wide)/Profil menü/Giris, **1024–1920 taşma 0**, console **0 error** (`shots/cemos-rebuild/faz1b5/`).
- **Kapsam notu:** MobileNav + ≤640 responsive KORUNDU (best-effort); silinmedi. Faz 1C–1F UI yalnız desktop tasarlanır (drawer=side panel, segment editor desktop, 1024 kullanılabilir; 390 screenshot YOK). Docs (06/05/03/FINAL) desktop-only + dark'a güncellendi.

### Faz 1B tamamlanan (commit b68e32a) — ADR-019
- **Yeni IA:** `navConfig` = PRIMARY_AREAS(bugun/plan/kutuphane) + ADVANCED_TABS(5, parentArea=plan) + UTILITY_TABS(toolbox) + PROFILE_TABS(5) + AREA_ALIASES + güncellenmiş TAB_ALIASES. Yardımcılar: `highlightAreaForTab`, `resolveAreaForTab`, `isAdvanced/Utility/ProfileTab`, `advanced/profileMeta`, `labelForTab`, `subTabsOfArea`, `allNavigableTabs`.
- **Shell:** `Sidebar` dar 232px (collapse KALDIRILDI), `ProfileMenu.tsx` (YENİ, yukarı popover 5 yüzey+Çıkış), `MobileNav` 3+1 + Profil sheet, `AppShell` mod modeli + workspace `SubNav` (Plan/Kütüphane + Profil) + 960px + breadcrumb, `screenRegistry` yeni host id'leri.
- **Host iskeleleri:** `host/HostPlaceholder.tsx` + `host/hostScreens.tsx` (plan-*/lib-*/profile-memory/profile-integrations — dürüst placeholder, Faz 1D doldurur). `lib/auth/clientLogout.ts`.
- **Store:** v9 migration (yalnız ABSORBED activeTab taşınır; advanced/utility/profil pass-through), `XAGENT_STORE_NAME` const (invariant "xagent-store").
- **Doğrulama:** typecheck ✓ · lint 0 err ✓ · unit **1240/1240** ✓ · build ✓ · e2e **22/22** ✓ · gerçek app 1280/390 faithful (Bugün/Plan/Profil menü/mobil 3+1), 320-1440 taşma **0**, console **0 error** (`shots/cemos-rebuild/faz1b/` — bugun-1280, plan-1280, profilmenu-1280, bugun-390).
- **E2E harness sertleştirme:** `global-setup` warmup+retry (soğuk compile), `playwright.config` workers:1/retries:1/expect 10s, Ctrl+K hydration guard. Nav helper (`helpers/nav.ts`) sınıf-bazlı yeniden yazıldı.
- **ABSORBED ekran dosyaları SİLİNMEDİ** (ViralLibraryTab, DailyQueueTab, KeywordLibraryTab, PromptKutuphanesiTab, PatternLibraryTab, InstagramTab, LearnDashboardTab) — registry'den çıktı, kullanıcı erişimi kesildi; emeklilik Faz 4. Faz 1D `lib-tumu`/`plan-seriler` bunların işlevini birleştirecek.

### Faz 1A tamamlanan (commit fb90f33)
- **Auth:** `src/proxy.ts` (Next 16 gate), `src/lib/auth/session.ts`+`throttle.ts` (+test), `src/app/giris` (native form→303), `src/app/api/auth/{login,logout}`, `ACCESS_PASSWORD_HASH`+`SESSION_SECRET` (requiredSecrets+.env.example), `scripts/hash-access-password.ts`, `AuthAttempt` Prisma modeli (additive).
- **Design system:** `globals.css` açık editorial + terracotta (token isimleri sabit), `chartColors.ts`, `theme-tokens.test.ts` (koyu-literal yasağı + gerçek WCAG kontrast), `--content-max:960px` token (uygulaması Faz 1B shell'de).
- **E2E:** `global-setup.ts` (login→storageState), `access-gate.spec.ts`, `playwright.config.ts` (gate env + reuseExistingServer:false).
- **Doğrulama:** typecheck ✓ · lint 0 err · unit **1229/1229** ✓ · build ✓ · e2e **20/20** ✓ · gerçek app açık tema render + /giris (console **0 error**, 1280+390: `shots/cemos-rebuild/faz1a/`).
- **[USER] gerekli:** `prisma db push` (AuthAttempt tablosu — yoksa throttle fail-open) + prod'da `ACCESS_PASSWORD_HASH`/`SESSION_SECRET` env (yoksa prod kapı fail-closed `/giris?setup=1`). E2E hash sabit salt "e2e-test-pass" içindir; prod'da `hash-access-password.ts` ile gerçek üret.

## Tamamlanan (Faz 0 kabul)

| Madde | Durum | Kanıt |
|---|---|---|
| Git güvenliği + branch | ✅ | `feature/cemos-rebuild` |
| Baseline (test/typecheck/lint/build/e2e/catalog) | ✅ TAM YEŞİL | 00-BASELINE §1: 1198 unit + 17 e2e + build + tc + lint + catalog |
| Canlı deploy read-only denetimi | ✅ | 00-BASELINE §2; `shots/cemos-rebuild/baseline/` (auth'suz erişim doğrulandı) |
| Resmî X API araştırması | ✅ | ADR-015 / 02 §5: REQUIRES-USER-PAYMENT-APPROVAL |
| Tasarım araştırması + accent | ✅ | 06 §2 terracotta hipotez + indigo alternatif |
| 10 Faz 0 belgesi | ✅ | `docs/cemos-rebuild/` (00,01,02,03,04,05,06,DECISIONS,IMPLEMENTATION-STATE,FINAL-IMPLEMENTATION-PLAN) |
| Tasarım onay paketi (mockup) | ✅ | `shots/cemos-rebuild/design-approval/` (12 ekran HTML + render) |
| Tam ekran sınıflandırma (SPEC-PENDING yok) | ✅ | 04 (ABSORBED/REDESIGNED-ADVANCED) + 05 (31 yüzey) |

## Baseline test sonuçları (gerçek)

```
typecheck=0  lint=0  verify:catalog=0
test: 134 dosya, 1198/1198 geçti (6.65s)
build: exit 0, 20.4s, 44 statik sayfa
e2e: 17 passed (41.9s)  [edit-gate spec shell-smoke:64 dahil]
```

## Browser kanıtları

**Baseline (canlı, koyu dashboard — değiştirilecek):** `shots/cemos-rebuild/baseline/prod-1280-morning-styled.jpeg`, `prod-390-morning.jpeg`, `prod-1280-morning.jpeg`.

**Tasarım onay paketi (YENİ açık editorial, terracotta) — `shots/cemos-rebuild/design-approval/` (12 mockup HTML + `cemos-ds.css` + 12 render):**
- `render-01-shell-bugun-1280` — desktop shell + Bugün karar kuyruğu (hero)
- `render-02-plan-takvim-1280` — Plan/Takvim (ay yoğunluk + hafta önizleme)
- `render-03-plan-firsatlar-1280` — Plan/Fırsatlar (seçilmiş fırsatlar)
- `render-04-plan-seriler-1280` — Plan/Seriler (seri DNA)
- `render-05-kutuphane-tumu-1280` — Kütüphane/Tümü (birleşik arama)
- `render-06-profil-sistem-1280` — Profil/Sistem (ADR-014 3-katman sağlık)
- `render-07-advanced-flowradar-1280` — REDESIGNED-ADVANCED Viral Radar araştırma
- `render-08-mobil-bugun` — mobil Bugün (thumb-CTA, bilinçli-aksiyon)
- `render-09-mobil-kutuphane` — mobil Kütüphane/Öğrenme
- `render-10-giris-1280` — erişim kapısı `/giris`
- `render-11-durumlar-1280` — durum galerisi (boş/hata/stale/blocked-external)
- `render-12-bugun-drawer-1280` — Bugün taslak detay drawer (kaynak/doğrulama/sinyal/audit)

Doğrulanan (görsel incelendi): 01, 06, 08, 11, 12 — hepsi açık editorial, terracotta accent, koyu/mor/KPI-hero/dekoratif-chart YOK; paylaşılan `cemos-ds.css` ile tutarlı. Kalan 7 aynı CSS'i kullanır.

## DB / migration durumu

- Faz 0: DB değişikliği YOK.
- Faz 1 additive planı (destructive DEĞİL, `prisma migrate diff` ile kanıt): `PublishAttempt` modeli, `QueueItem.threadSegments`, auth throttling tablosu. `prisma db push` yalnız kullanıcı onayıyla.

## Dış blocker'lar (BLOCKED-EXTERNAL)

- **X API gerçek publish:** pay-per-use (senaryo tablosu ADR-015: %0 link $2.25–3.60 / %50 link $16.13–25.80 / %100 link $30–48 aylık, 5-8 post/gün) → **Ali Cem ödeme onayı ALINMADI** (kullanıcı kararı 2026-07-15). Faz 1E yalnız adapter contract + PublishAttempt + IntentPublishAdapter + dürüst intent fallback; `XApiPublishAdapter` gerçek bağlantı BLOCKED-EXTERNAL.
- Vercel Deployment Protection / firewall (kullanıcı).
- `ACCESS_PASSWORD_HASH`/`SESSION_SECRET`/`CREDENTIAL_ENC_KEY` prod env (kullanıcı).
- Meta `instagram_basic`+`business_discovery` (Faz 3).
- OpenRouter kredisi (Faz 2 canlı eval).

## Açık riskler / uygulama sırasında doğrulanacak

1. `blocked` readiness kriter seti — canlı queue verisiyle ayarlanıp dondurulacak.
2. Kuyruk endpoint teyidi (1C başında hangi route MorningDashboardTab besliyor).
3. `processFeedback` union'ı (`approved` kabulü) + `publishService.ts:156` literal cast.
4. Playwright `webServer.env`/globalSetup/`reuseExistingServer` (auth E2E).
5. Türkçe glyph per-weight (Inter/Newsreader), üretim hex canlı kontrast re-verify.
6. Accent kullanıcı kararı (terracotta vs indigo) — onay kapısı.

## Sonraki kesin iş — Faz 1C (Bugün + gerçek readiness)

FINAL-IMPLEMENTATION-PLAN §1C + master prompt Faz 1C. Özet:
1. **Kuyruk zinciri teyidi:** hangi route `MorningDashboardTab`'i besliyor koddan doğrula (`/api/growth/daily-queue`).
2. **`readinessService.ts` (pure):** her çağrı `editedContent ?? content`; persist EDİLMEZ; judged=false/skor eksik/legacy → ASLA ready; `ready|needs_edit|blocked`; blocked YALNIZ ciddi doğruluk/güvenlik/policy/kaynaksız-somut-iddia; stil → needs_edit; hesap-bazlı soru-CTA/emoji; Türkçe-dışı token oranı + allowlist (kelime-özel Trajectory hack'i YOK).
3. **`threadSegments` additive (QueueItem, Zod typed):** basit segment editörü; yapısal segmentsiz thread fail-closed; metindeki "1/" kanıt SAYILMAZ.
4. **`whyToday.ts` + 5-durum doğrulama:** verified/partially_verified/source_available/unverified/stale; kart ve drawer AYNI sonucu gösterir; `SourcePost.scannedAt` fact-check tarihi DEĞİL.
5. **`publishService`:** yayın anında readiness re-run; eski zorunlu kozmetik edit-gate KALDIR; needs_edit→edit_required; blocked→422 Türkçe neden.
6. **UI:** yeni DraftReviewCard + detay drawer; ReviewQueue/MorningDashboardTab/OperatorReadinessGate yeni sisteme; **intent-only CTA dili korunur** ("X'te aç", ADR-017).
7. **Fixtures:** 6 kötü taslak (yabancı sızıntı/soru-CTA/emoji/kaynaksız-iddia/yapısız-thread/düşük-Türkçe) ready OLAMAZ; iyi fixture ready. Additive Prisma migration `prisma migrate diff` ile destructive-değil kanıtı (production'a UYGULAMA).

Gate: test/typecheck/lint + build/playwright/1280·390/console-0. Ayrı commit + bu dosyayı güncelle.

### Faz 1C kod haritası (keşif ajanı çıktısı — turnkey base)

**Veri zinciri:** `MorningDashboardTab` → `useDailyQueueData` hook (`src/components/morning/useDailyQueueData.ts`) → `GET /api/growth/daily-queue` (`src/app/api/growth/daily-queue/route.ts`) → `ReviewQueue` → `DraftReviewCard` (+ `OperatorReadinessGate`, `MorningHeroStats`). PATCH `src/app/api/growth/daily-queue/[id]/route.ts` (`{content}` kaydet · `{status:"manual_published"}` → `publishService.markManualPublished`).
- Route her item'e `scoresParsed` ekler (route.ts:105-143): `judged` (telemetry.judged), `turkishNaturalness`, `sourceFaithfulness`, `riskScore`, `hookStrengthScore`, `personaMatchScore`, `noveltyScore`, `leaks`, `leakCount`, `ctaPresent`, `payoff`, `publishScore`, `isEstimatedScore`.
- Client `MorningDraft`/`MorningDraftScores` tipi `useDailyQueueData.ts:7-36` (route'un ALT KÜMESİ).

**QueueItem (`prisma/schema.prisma:103-133`):** `content`, `editedContent?`, `status String @default("new")` (ENUM DEĞİL; new/draft/needs_edit/approved/scheduled/rejected/published/manual_published), `scores String` (JSON — `judged` yalnız `telemetry.judged`; ayrı judged kolonu YOK), `lintReport String?`, `candidatesJson`, `sourcePostId?`, `newsItemId?`, `draftType @default("TWEET")`. **`threadSegments` YOK** → additive eklenecek (Zod-typed JSON String kolon; migrate diff kanıtı, apply YOK).

**Kaldırılacak edit-gate:** server `publishService.ts:97-104` (`markManualPublished` → `edited===original||!edited` ise `throw "edit_required"`); literal cast `:156` (`as "grafikcem"|"maskulenkod"`); UI `DraftReviewCard.tsx:115` (`isEdited`), `:166` (`if(!isEdited)return`), `:398` (`disabled`), `:417-421` (uyarı metni). `extractGateNotes` (:32-44) `lintReport.issues[code==="quality_gate"]` okur.

**`applyQualityGate` (`src/lib/services/scoreSignals.ts:68-90`):** `new|needs_edit`; tetik = high leak / (judged && turkishNaturalness<`TURKISH_NATURALNESS_MIN=55`) / lint `banned_phrase|question_cta`. `SubSignals` (:10-20). Yazım `draftService.ts:254-346` (status:needs_edit→:308, scores JSON→:311-342). `Leak` (`leak-detector.ts:29-34` kind/severity low|med|high). Lint kodları (`heuristics.ts`): banned_phrase/question_cta/char_limit/emoji_density/hashtag_density/sales_smell.

**Hesap politikaları (`accounts.ts:40-56`):** yapısal emoji/soru-CTA alanı YOK — free-text `toneRules/formatRules/forbiddenRules`. grafikcem: emoji YASAK + soru-CTA yasak (:83-84,88-89); maskulenkod: emoji kuralı yok. Makine karşılığı lint `question_cta`/`emoji_density`. `AccountHandle="grafikcem"|"maskulenkod"`; `effectiveMaxChars`/`resolveFormatTier` mevcut.

**Doğrulama verisi:** `SourcePost.scannedAt` VAR (tarama zamanı — fact-check DEĞİL) `schema:98`. `NewsItem.sourceVerification` (single_source|official_only|editorial_confirmed|multi_source_confirmed) `:393` + `whyPeopleCare` `:389`. `classifySourceVerification` (`src/lib/news/sourceVerification.ts:99-116`). **whyToday/partially_verified/factCheck HİÇ YOK** (grep 0) → sıfırdan.

**Türkçe util:** `src/lib/utils/textSimilarity.ts` → `normalizeTurkish` (ğüşıöç→gusioc, punct strip), `calculateJaccard/Levenshtein`, `isNearDuplicate`. Dil-tespit util YOK.

**Mevcut readiness:** `operatorReadinessService` (`src/lib/services/operatorReadinessService.ts`) = INFRA/pipeline readiness ("bugün üretebilir mi") — per-draft readiness'ten AYRI. Yeni `readinessService.ts` (per-draft) isim çakışması YOK.

**Yeni `readinessService.ts` tasarımı (pure, self-contained input — QueueItem'dan adapte edilir):** `state: ready|needs_edit|blocked`; text=`editedContent?.trim()||content.trim()`; persist YOK. **BLOCK** (öncelikli): over-maxChars · `riskScore>=RISK_BLOCK_MIN(75, provisional)` · kaynaksız somut istatistik iddiası (`%`/`$₺`/`\d+ kat|milyon|milyar|bin`/`(19|20)\d{2}` VE !hasSource) · security lint kodu. **NEEDS_EDIT:** !judged (fail-closed) · turkishNaturalness null/legacy · judged&&<55 · high leak · yabancı-dil sızıntısı (İngilizce fonksiyon-kelime sayısı≥2, allowlist'li — kelime-özel hack YOK) · lint banned_phrase|question_cta · grafikcem&&emoji(`\p{Extended_Pictographic}`) · thread&&!threadSegments (yapısal; "1/" kanıt DEĞİL) · segment char/limit ihlali · status==="needs_edit". Aksi → **ready**. Eşikler **provisional** — canlı queue verisiyle DONDURULACAK (risk#2; OpenRouter-402 canlı üretime bağlı → o kalibrasyon dış-bağımlı). Fixtures `__fixtures__/badDrafts.ts` (6: yabancı-sızıntı/soru-CTA/emoji/kaynaksız-iddia/yapısız-thread/düşük-Türkçe) hiçbiri ready; iyi fixture ready → `readinessService.regression.test.ts`.

### Faz 1C TAMAM — dabb0bf (referans shell) + ba0068b (readiness wiring + desktop review UI)

**Çekirdek (bbda80c, pure):** `readinessService`/`threadSegments`/`whyToday` (+fixtures) — 35 test. Değişmedi, bağlandı.

**Referans hizalama (dabb0bf, ADR-021):** inverse/peach açık-ada token'ları (+@theme mirror, gerçek WCAG, açık-ada kilidi); `Surface`/`InverseCard`/`PeachCard` primitive (ton renkleri `--sf-*` ile çocuklara); Sidebar hesap bağlam kartı + **nötr grafit aktif nav** (terracotta yalnız ikon); segmented pill SubNav; `PageHeader size="hero"`; AppShell Plan/Kütüphane hero başlık→subnav→gövde. Canlı 1280 (shots/faz1c-refA).

**Readiness wiring (ba0068b, 1C-d):** `readinessAdapter.ts` (saf `readinessInputFromQueueItem`/`assessQueueItemReadiness`, savunmacı default'lar, +11 test); `publishService.markManualPublished` **düzeltilmiş sözleşme** — kozmetik `edited!==original` edit-gate KALKTI → yayın anında `editedContent ?? content` üzerinde `assessReadiness` RE-RUN: `blocked`→`readiness_blocked`(422), `needs_edit`→`edit_required`(422), `ready`→yayın (düzenleme ŞART değil); "edited" öğrenme sinyali yalnız gerçekten değiştiyse. daily-queue GET payload += `readiness`+`readinessInput`(client canlı)+`whyToday` (sourcePost/newsItem include); `[id]` PATCH += `threadSegments`(Zod) + readiness→422 Türkçe neden; mark-published route aynı eşleme.

**Desktop review UI (ba0068b, 1C-e):** `DraftReviewCard` ton=readiness (ivory ready/peach needs_edit/koyu blocked, `data-readiness`) + **intent-only "X'te aç"** + "Paylaşıldı"(yalnız ready) + canlı readiness; UI edit-gate + "değiştirmeden yayınlayamazsın" KALKTI; A/E/J/K. `ThreadSegmentEditor` (ekle/böl/birleştir/sırala + char count → `serializeThreadSegments` → PATCH). `DraftDetailDrawer` (koyu side panel: whyToday/doğrulama/kaynak scannedAt="tarandı"/ayrışık sinyaller/readiness/model katlanmış; kart ile AYNI sonuç). `readinessMeta.ts`; ReviewQueue readiness noktaları; `useDailyQueueData` (+`saveSegments`, kaydetmede canlı readiness yeniden-hesap). E2E `bugun-queue.spec.ts` (hermetik route-mock, DB-bağımsız, 5 test) + eski kozmetik edit-gate E2E'si kaldırıldı.

**Gate:** typecheck ✓ · unit **1308/1308** ✓ · lint 0 error ✓ · build ✓ · **e2e 26/26** ✓. Kart tonları mock-preview ile canlı doğrulandı (shots/faz1c-cards: ready ivory / needs_edit peach / blocked / thread editör / drawer / gerçek Bugün DB-blocker ErrorState).

**⚠ USER-DB-ACTION (uygulanmadı, kısıt — BLOCKED-EXTERNAL değil):** `QueueItem.threadSegments` kolonu canlı DB'de YOK → daily-queue gerçek istekte "column does not exist" 500 (Bugün graceful ErrorState, sessizce gizlenmez). Kullanıcı additive migration'ı uygulamalı: **`npx prisma migrate deploy`** (veya dev'de eşdeğeri) → gerçek veri akar, Bugün kartları canlı render olur.

**Sıradaki: Faz 1D ÖNCESİ GÖRSEL ONAY KAPISI (ADR-021, tek kapı).** Kullanıcıya gerçek uygulamadan shell/sidebar-account/Plan-Kütüphane + kart mock-preview'ları sunulur; soru: "referans yapı/his yeterince yakalandı mı; bu archetype ile Faz 1D'ye devam?" **Onay gelmeden Faz 1D'ye geçilmez.** (Faz 1D: 6 host + 5 advanced araştırma yüzeyi archetype'a taşınır.)

## Tekrar edilmemesi gereken başarısız denemeler

- Playwright MCP `file://` engelli → mockup'lar için yerel HTTP sunucu (`scratchpad/serve.js`, port 4599) kullanıldı.
- Canlı deploy soğuk cache'te CSS `ERR_CACHE_READ_FAILURE` → stilsiz render; reload sonrası düzeldi (app hatası değil).
