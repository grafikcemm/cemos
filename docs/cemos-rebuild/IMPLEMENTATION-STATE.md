# IMPLEMENTATION-STATE

> Sonraki oturumun kesin handoff'u. Context daralırsa buradan devam. Güncelleme: 2026-07-15, Faz 0 sonu.

## Aktif durum

- **Faz:** Faz 0 ✅ + P0 ✅ + Faz 1A ✅ + Faz 1B ✅ + **Faz 1B.5 (desktop dark editorial) ✅ TAMAMLANDI.** Sıradaki: **Faz 1C** (desktop-only UI).
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

## Tekrar edilmemesi gereken başarısız denemeler

- Playwright MCP `file://` engelli → mockup'lar için yerel HTTP sunucu (`scratchpad/serve.js`, port 4599) kullanıldı.
- Canlı deploy soğuk cache'te CSS `ERR_CACHE_READ_FAILURE` → stilsiz render; reload sonrası düzeldi (app hatası değil).
