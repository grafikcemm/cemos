# 03 — Delivery Roadmap

> Faz 1 dilimleri (uygulanabilir kabul kriterleriyle) + Faz 2-5 iskelet. Her dilim = çalışan, testli, geri alınabilir dikey dilim; sonunda `npm test && typecheck && lint` yeşil, UI dilimlerinde `build`+`playwright`+desktop screenshot. Kaynak: `FINAL-IMPLEMENTATION-PLAN.md`.
>
> **⚠ ADR-020 (desktop-only, dark editorial):** Bu belgedeki TÜM "1280/390" / "1280+390" ifadeleri **"1024/1280/1440/1920 desktop screenshot"**, TÜM "320-1440 taşma yok" ifadeleri **"1024–1920 taşma yok"** olarak okunur. Mobil = best-effort (390 screenshot alınmaz). Tema dark.

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
- **Faz 2 — Hafıza + agent orchestration** (dilim haritası + envanter: `07-PHASE2-PLAN.md`):
  - **2A ✅ KAPANDI (2026-07-16, ADR-027/028):** config-driven agent/skill registry (12 rol + curator; deklaratif metadata ↔ server-side adapter ayrımı; fail-fast doğrulama; typed executor: succeeded/deterministic_fallback/blocked_external/failed_validation/failed_execution/timed_out) + PipelineTrace additive agent metadata (yeni tablo yok, tek-çağrı-tek-UsageLog korunur) + kalıcı `OpportunityHandoff` (üç Fırsatlar eylemi server-persisted, idempotent, reload-persist; blocked-external'da sahte taslak yok). Deterministik fixture/eval paketi dahil; canlı ücretli çağrı YAPILMADI.
  - **2B ✅ KAPANDI (2026-07-16, ADR-029/030):** MemoryEvidence kanıt defteri + insan-onaylı promotion (learned fact otomatik aktifleşmez; 3 kanıt = yalnız review-ready; Sahiplen=operator beyanı) + deterministik feedback→memory sinyal köprüsü + haftalık LLM'siz reconciliation (yeni cron yok) + performans dersleri ↔ identity ayrımı + kaynaklı knowledge read modeli (`/api/memory/knowledge`) + influence provenance (`scores.groundingMemoryFactIds`) + ProfileMemoryTab kaynaklı görünüm. Canlı ücretli LLM kullanılmadı.
  - **2C ✅ KAPANDI (2026-07-16, ADR-031/032):** hesap profili runtime source-of-truth TS→DB (`profileRepository` + additive Account kolonları + `AccountPlatformBinding`; trust boundary'ler DB-otoriteli fail-closed; draft/inaktif hesap üretime giremez; bootstrap yalnız seed/fixture/işaretli-fallback) + Composio Instagram read-only köprüsü (server-only MCP client + çift-katman allowlist + provider soyutlaması + Meta fallback İŞARETLİ + idempotent own-account sync daily cron'da & manuel komutta + Entegrasyonlar UI). Canlı Composio smoke BLOCKED-EXTERNAL (consumer key kullanıcıda); rakip business_discovery Composio ile ÇÖZÜLMEDİ.
  - **2D–2E (sonra):** thread üretim hattı + backfill + kalibrasyon (2D) · eval/observability kapanışı + canlı kürasyon aktivasyonu (2E; OpenRouter kredisi mevcut — kullanıcı onayı bekliyor).
- **Faz 3 — Plan + IG + Reels:** Carousel/Caption/Hashtag DNA→prompt+UI, rakip sinyal→seçilmiş fırsat, aylık plan gerçek dossier kartları, site doğrulama/staleness/risk görünür, Meta fallback (CSV/URL/screenshot/manuel).
- **Faz 4 — Kütüphane + Learn + Obsidian:** Boards/ContentItem birleşik, ilham capture+yapısal analiz, Learn UI + NotebookLM/manuel transcript, Obsidian GitHub/local export uçtan uca, zihin haritası/atomik not/task/review, ABSORBED ekran emekliliği (compatibility kanıtı).
- **Faz 5 — Gerçek entegrasyon + kalibrasyon:** X publish (ödeme onayı sonrası, insan onaylı), Meta engagement sync, içerik seçim/kalite metrikleri gerçek sonuçla, legacy UI temizlik.
