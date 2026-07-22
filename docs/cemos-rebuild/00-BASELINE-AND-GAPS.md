# 00 — Baseline & Gaps

> Faz 0 baseline kanıtı. Tarih: 2026-07-15. Branch: `feature/cemos-rebuild` (mevcut `feature/ui-dark-redesign` HEAD `f8b72b8`'den açıldı). Bu belge "kod var / veri var / UI'da çalışıyor" ayrımını ve master prompttaki başlangıç hipotezlerinin doğrulanmış halini taşır.

## 1. Baseline komut sonuçları (gerçek çıktı)

| Komut | Sonuç | Kanıt |
|---|---|---|
| `npm run typecheck` | **exit 0** | temiz |
| `npm run lint` | **exit 0** | temiz |
| `npm run verify:catalog` | **exit 0** | OpenRouter katalog pinleri geçerli |
| `npm test` (vitest) | **exit 0 — 1198/1198 geçti, 134 dosya** | Duration 6.65s; yalnız beklenen `stderr` log satırları (supadata failed-job testi kasıtlı) |
| `npm run build` | **exit 0 — 20.4s, 44 statik sayfa** | `✓ Compiled successfully`, TypeScript 11.7s |
| `npx playwright test` | **exit 0 — 17 passed (41.9s)** | edit-gate spec `shell-smoke.spec.ts:64` dahil; dev'de `CREDENTIAL_ENC_KEY` eksik uyarısı (non-fatal) |

**Sonuç:** Mühendislik temeli sağlam. Baseline'da hiçbir kırık yok. Sorun, master promptun teşhisiyle aynı: **ürün örgütlenmesi ve güvenilir çıktı kalitesi** — altyapı değil.

## 2. Canlı deploy read-only denetimi

URL: `https://cemos-woad.vercel.app` — temiz browser context, salt-okunur, hiçbir mutation/publish/generation tetiklenmedi. Kanıt görselleri: `shots/cemos-rebuild/baseline/` (`prod-1280-morning.jpeg`, `prod-1280-morning-styled.jpeg`, `prod-390-morning.jpeg`).

| Bulgu | Durum | Not |
|---|---|---|
| **Auth'suz public erişim** | ✅ DOĞRULANDI — P0 | Login yok; app doğrudan yüklendi. `docs/CEMOS.md` SEC-02 Deployment Protection varsayımına dayanıyor; canlı URL o korumasız erişilebiliyor. Master prompt P0 access gate haklı. |
| Console hataları | Yalnız geçici | Soğuk cache'te `ERR_CACHE_READ_FAILURE` (font+css); reload sonrası temiz. **App JS hatası YOK.** |
| Mevcut UI | Koyu kontrol-odası | Mor `#8b5cf6` accent, ~16-item "dolu-nav" sidebar (Bugün/Haber Havuzu/Günlük Kuyruk + ÜRETİM/KEŞİF/HAFIZA/SİSTEM grupları). Master promptun değiştirmek istediği estetik tam bu. |
| Edit-gate canlı | ✅ | "Manuel Paylaşıldı" butonu düzenlenene dek disabled; uyarı "AI çıktısını kendi sesinle düzenlemeden yayınlayamazsın." |
| **Canlı kalite sorunları** | ✅ gözlendi | @maskulenkod kuyruk satırı: `👉` emoji + numaralı thread-benzeri liste ("1. … 2. …") + "yörüngedir" (= "Trajectory" yabancı-kavram çevirisi). Master promptun bad-draft örnekleri canlıda mevcut. |
| Health göstergesi | "Sağlıklı" (yeşil) | Salt-okunur tarayıcıdan failed-backlog karşılaştırması yapılamaz (app API'si tetiklenmedi). Health contract'ının backlog/staleness'ı hesaba katıp katmadığı KOD denetimiyle doğrulandı (§4 healthService). |
| Mobil (390) | 5-buton bottom nav | Bugün/Üretim/Keşif/Hafıza/Sistem; aynı koyu tema + edit-gate. |

## 3. Başlangıç hipotezleri — doğrulama tablosu

Master prompt "BİLİNEN BAŞLANGIÇ GERÇEKLERİ" maddelerinin repo+canlı doğrulaması:

| Hipotez | Doğrulama | Kaynak |
|---|---|---|
| Sidebar ~16 ekran; mobilde 5 teknik alan | ✅ DOĞRU | canlı screenshot + `navConfig.ts` |
| Bugün queue-first ama kaynak/"neden bugün?"/fact-check ana yüzde yok | ✅ DOĞRU | `DraftReviewCard.tsx` — SignalRow chip'leri var, kaynak/neden/doğrulama alanı yok |
| Zorunlu edit-gate iyi taslağı bile kozmetik değişikliğe zorluyor | ✅ DOĞRU | `publishService.ts:97-104` `edit_required` + UI `:398` disabled |
| @maskulenkod'da İngilizce/yasak-CTA/emoji taslağa sızmış, skorlar yansıtmıyor | ✅ canlı gözlem | canlı kuyruk satırı |
| Skorlar tek "viral puan" değil, ayrık sinyaller | ✅ (kısmen iyi) | `DraftReviewCard` SignalRow — zaten ayrık chip'ler; readiness sözleşmesi eksik |
| Typecheck + Vitest başlangıçta yeşil | ✅ DOĞRU | §1 |
| Deploy'a app-içi login olmadan erişiliyor | ✅ DOĞRU | §2 |
| Hesaplar 2 adet, hardcoded | ✅ DOĞRU | `src/lib/accounts.ts` literal union `grafikcem`/`maskulenkod` |

## 4. Kod var / veri var / UI ayrımı (kilit servisler)

Keşiften doğrulanan; her biri Faz 1'de yeni ürüne bağlanacak MEVCUT altyapı:

- **Pipeline** `src/lib/services/pipelineService.ts` + `src/lib/ai/draft-pipeline.ts` (writer→judge→final editor) — çalışır, testli.
- **Kalite** `src/lib/services/scoreSignals.ts` `applyQualityGate()` → `new|needs_edit` (readiness sözleşmesi bunu SARACAK, değiştirmeyecek).
- **Edit-gate** `src/lib/services/publishService.ts:97-104` (kaldırılacak → readiness).
- **Memory** `memoryFactService` (propose→approve→supersede, external asla identity yazamaz), `constitutions`, `dnaDistillService`, `vector-memory`, `grounding.ts` — hepsi çalışır.
- **News** `src/lib/news/pipeline.ts` (raw→translated→analyzed, sweepStuck/Stale), `buzz.ts`, `healthService.getNewsPipelineHealth()` — health ZATEN failedBacklog'u hesaba katıyor (RED: cron ok + analyzedLast24h=0 + rawBacklog>0). Faz 1F bunu 3 katmana ayıracak (altyapı/tazelik/hazırlık) + topbar sinyalini daraltacak.
- **Instagram/Reels** `igCompetitorService`, `outlier.ts` (median, min-sample 3), `reels/dossier-generator.ts` (evidence gate `computeReadiness` PURE), `plan-assembler.ts`, `ssrfGuard.ts`.
- **Learn** `learnService` + pipeline + `obsidian.ts` + `githubVault.ts` + SRS `srs.ts`.
- **Publish** — X API yazma adapter'ı YOK; yalnız manuel intent + `markManualPublished` (PublishedPost + FeedbackEvent yazar).
- **Auth** — app-level login YOK; `sameOriginGuard` (CSRF), `cronAuth` (fail-closed prod), `secretCrypto` (AES-256-GCM).

## 5. Kapatılacak boşluklar (Faz 1 hedefleri)

1. **P0 güvenlik:** app-level tek-operatör erişim kapısı (same-origin ≠ authentication).
2. **IA:** 16→3 görev (Bugün/Plan/Kütüphane) + Toolbox utility + Profil; legacy motor adları nav'dan çıkar.
3. **Kalite sözleşmesi:** zorunlu kozmetik edit-gate → `ready/needs_edit/blocked` (fail-closed).
4. **Bugün:** kaynak + "neden bugün?" + 5-durumlu doğrulama (kaynak ≠ fact-check) ana yüzde.
5. **Publish dürüstlüğü:** intent açmak ≠ yayınlandı; `PublishAttempt` state machine.
6. **Sağlık:** 3 katman (altyapı / pipeline tazeliği / bugünkü hazırlık).
7. **Tam redesign:** kullanıcı-erişilebilir HİÇBİR ekran legacy kompozisyonla kalamaz.

## 6. Bilinen dış blocker'lar (BLOCKED-EXTERNAL adayları)

- **X API publish:** feasibility + maliyet Faz 0 X API araştırmasıyla belirlenir (bkz. `03-DELIVERY-ROADMAP` + `DECISIONS`). Pay-per-use = "yeni ücretli servis" → kullanıcı maliyet onayı gerekir.
- **Meta izinleri:** `instagram_basic`+`business_discovery` scope eksikliği (önceki oturumlardan; Faz 3 IG için).
- **OpenRouter kredisi:** canlı generation için (Faz 2+ gerçek eval).
- **Vercel Deployment Protection / secrets:** kullanıcı operasyonel aksiyonu.
