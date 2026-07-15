# 03 — Delivery Roadmap

> Faz 1 dilimleri (uygulanabilir kabul kriterleriyle) + Faz 2-5 iskelet. Her dilim = çalışan, testli, geri alınabilir dikey dilim; sonunda `npm test && typecheck && lint` yeşil, UI dilimlerinde `build`+`playwright`+1280/390 screenshot. Kaynak: `FINAL-IMPLEMENTATION-PLAN.md`.

## Faz 1 — dilimler

### 1A — Auth + design system
**İş:** `src/proxy.ts` (allow-list, prod fail-closed), `lib/auth/session.ts` (HMAC, pure+test), `giris/page.tsx`, `api/auth/login|logout` (scrypt constant-time), DB-backed atomik throttling (HMAC'li IP, TTL, global pencere), `ACCESS_PASSWORD_HASH`+`SESSION_SECRET` (`requiredSecrets`+`.env.example`). `globals.css` açık token flip, `--content-max:960`, hardcoded-koyu→token, `theme-tokens.test.ts` yeni BANNED, 30 primitive WCAG AA+focus.
**Kabul:** `/giris` olmadan app'e erişilemez; yanlış parola girilemez; dev bypass çalışır; E2E `access-gate.spec.ts` yeşil; mevcut 17 E2E storageState ile geçer; açık tema render, console error 0; screenshot kanıtı.

### 1B — Yeni shell/sidebar + store v9
**İş:** `navConfig.ts` 3 alan + `AREA_ALIASES` + ABSORBED→`TAB_ALIASES` + advanced→`ADVANCED_TABS` + `PROFILE_TABS`; `migrations.ts` v9 (yalnız ABSORBED activeTab); `screenRegistry` 6 host+advanced; `Sidebar` dar rail, `ProfileMenu` yeni, `MobileNav` 3+1; navConfig+migrations testleri + `shell-smoke` yeniden.
**Kabul:** ana nav yalnız Bugün/Plan/Kütüphane+Toolbox+Profil; legacy motor adları nav'da yok; v9 eski activeTab'ı doğru eve taşır; advanced id persist'i advanced ekranı açar; `xagent-store` anahtarı aynı; deep-link route'ları çalışır; E2E yeşil.

### 1C — Bugün + gerçek readiness
**İş:** `readinessService.ts` (pure, fail-closed, yabancı-oran+allowlist, thread segment), `QueueItem.threadSegments` additive + segment editör, `whyToday.ts` (5 doğrulama durumu), kuyruk endpoint payload genişleme, `publishService` edit-gate→readiness re-run + 422 blocked, `__fixtures__/badDrafts.ts` + `readinessService.regression.test.ts`, `DraftReviewCard` yeniden + drawer, `ReviewQueue`/`MorningDashboardTab`/`OperatorReadinessGate` yeni sistem.
**Kabul:** 6 kötü-taslak fixture'ı ready OLAMAZ (Trajectory-leak/soru-CTA/emoji/kaynaksız-iddia/thread-uyumsuz/düşük-TR); judged=false ready olamaz; ready taslak zorunlu kozmetik edit olmadan onaya girer; kartta kaynak+neden+5-durumlu güven; intent PublishedPost yaratmaz (1E ile); E2E readiness spec + `bugun-queue.spec.ts` (1280+390).

### 1D — Görünür yüzeylerin TAMAMI yeni sisteme
**İş:** Plan/Takvim+Fırsatlar+Seriler (`src/components/plan/*`), Kütüphane/Tümü+İlham+Öğrenme (`src/components/library/*`), Toolbox restyle, Profil 5 yüzeyi (CemOS'un bildikleri/Entegrasyonlar/Sistem/Maliyet/Ayarlar), 5 REDESIGNED-ADVANCED ekran (news-pool/youtube/flow-radar/discovery-engine/source-intelligence) yeni kompozisyon.
**Kabul:** kullanıcı-erişilebilir legacy kompozisyon SIFIR; her yüzey 05 spec kabul kriterlerini geçer; alan başına E2E smoke; 1280+390 screenshot seti; 320-1440 taşma yok.

### 1E — Dürüst publish state machine + X API kararı
**İş:** additive `PublishAttempt` modeli; `publish/adapter.ts` (`IntentPublishAdapter`+`XApiPublishAdapter` stub); transaction-içi finalizasyon + reconciliation; status geçiş+adapter+dedup testleri.
**Kabul:** intent = yalnız `PublishAttempt(prepared)`; manuel onay = transaction QueueItem+PublishLog+PublishedPost; CTA dili doğru (intent="X'te aç"); duplicate önleme testli. **X API gerçek publish = BLOCKED-EXTERNAL** (kullanıcı ödeme onayına kadar; ADR-015).

### 1F — 3 katmanlı sağlık
**İş:** `healthService.ts` → altyapı / pipeline-tazeliği / bugünkü-hazırlık ayrı contract; topbar yalnız müdahale-gereken; Profil/Sistem tam döküm; testler yeniden.
**Kabul:** "kuyruk tamamlandı" sağlıksız göstermez; failed backlog + staleness + üretim-yok ayrı sinyaller; topbar doğru daraltır.

**Faz 1 kapanış:** tam gate + `IMPLEMENTATION-STATE` + memory + screenshot seti. **Tanım:** "yeni ürün yapısı + bütün arayüz + güvenilir günlük çekirdek tamam" — "CemOS tamamen bitti" DEĞİL.

## Dış blocker'lar (kullanıcı aksiyonu)
| Blocker | Etki | Aksiyon |
|---|---|---|
| X API pay-per-use (%0 link $2.25–3.60 / %50 $16.13–25.80 / %100 $30–48 aylık + okuma/media/retry) | 1E gerçek publish | **Ali Cem ödeme onayı ALINMADI (2026-07-15)** → XApiPublishAdapter BLOCKED-EXTERNAL kalır; 1E yalnız contract+intent |
| Vercel Deployment Protection / firewall | ek güvenlik katmanı | Vercel panel |
| `ACCESS_PASSWORD_HASH`/`SESSION_SECRET`/`CREDENTIAL_ENC_KEY` | prod auth+secret | Vercel env |
| Meta `instagram_basic`+`business_discovery` | Faz 3 IG | Meta izin |
| OpenRouter kredisi | Faz 2 canlı eval | kredi |

## Faz 2-5 iskelet
- **Faz 2 — Hafıza + agent orchestration:** config-driven registry (typed contract+eval), memory governance + "CemOS'un bildikleri", edit-diff/red/onay/performans öğrenme, dinamik hesap, thread üretim hattı (segment üretimi+backfill+kalibrasyon; typed alan Faz 1C'de), trace/cost gözlemlenebilirlik. Gerçek veriden önce deterministic fixture/eval.
- **Faz 3 — Plan + IG + Reels:** Carousel/Caption/Hashtag DNA→prompt+UI, rakip sinyal→seçilmiş fırsat, aylık plan gerçek dossier kartları, site doğrulama/staleness/risk görünür, Meta fallback (CSV/URL/screenshot/manuel).
- **Faz 4 — Kütüphane + Learn + Obsidian:** Boards/ContentItem birleşik, ilham capture+yapısal analiz, Learn UI + NotebookLM/manuel transcript, Obsidian GitHub/local export uçtan uca, zihin haritası/atomik not/task/review, ABSORBED ekran emekliliği (compatibility kanıtı).
- **Faz 5 — Gerçek entegrasyon + kalibrasyon:** X publish (ödeme onayı sonrası, insan onaylı), Meta engagement sync, içerik seçim/kalite metrikleri gerçek sonuçla, legacy UI temizlik.
