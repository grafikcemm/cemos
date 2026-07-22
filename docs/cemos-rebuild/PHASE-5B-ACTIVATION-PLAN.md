# Phase 5B — Turnkey Activation Plan (dış entegrasyon envanteri + güvenli sıra)

> Durum: 2026-07-19 · ADR-044 (Phase 5A) kapanışı · Sahne: `feature/cemos-rebuild`
> **Phase 5A'da CANLI dış yazma / ödeme / credential değişimi YAPILMADI.** Bu belge
> yalnız envanter + Phase 5B için güvenli aktivasyon reçetesidir. Her satır operatör
> (Ali) kararı gerektirir; kod tarafı hazır (turnkey), yalnız credential/onay eksik.
>
> Sınıflar: **USER-ACTION** (yalnız operatör env/onay/deploy) · **BLOCKED-EXTERNAL**
> (dış credential/ödeme/izin) · **residual-risk**. Canlı durum yüzeyi:
> `profile-integrations` (ProfileIntegrationsTab + `/api/integrations` + `/api/health`)
> — yalnız env NAME + VAR/YOK; secret VALUE asla DOM/log/rapora çıkmaz.

## 0. Envanter (yüzeyle birebir — `/api/integrations`)

| Entegrasyon | Capability | Configured / Authed | Live / fixture / degraded / blocked | Yazma kapsamı | Ücret kapısı |
|---|---|---|---|---|---|
| **OpenRouter** | Tüm LLM üretimi (writer/judge/rescore/pattern/learn) | `OPENROUTER_API_KEY` | **degraded** (kredi bitikse 402 → üretim durur, okuma sürer; rescore dürüst 402-blocked) | dış: LLM çağrısı | **VAR** — aylık `getBudgetStatus` gate + provider-key cap |
| **Composio · IG (read-only)** | Kendi IG profil+medya+insight+yorum (MCP) | `COMPOSIO_CONSUMER_API_KEY` + connected-account-id + handle | **blocked-external** (env yok → `configured=false`; binding doğrulanmadı) | yalnız OKUMA (yayın/DM yok) | Composio plan (dış) |
| **Meta / IG (direct)** | Fallback read + **rakip radarı (business_discovery)** | `META_ACCESS_TOKEN` + `META_IG_USER_ID` | **degraded/blocked** (business_discovery ÇALIŞIYOR kanıtlı; token/izin durumuna bağlı) | okuma | Meta (dış, ücretsiz tier) |
| **Obsidian · yerel vault** | Learn paketi → yerel Obsidian (Node fs) | `OBSIDIAN_VAULT_PATH` | **blocked-external** (env yok; ayrıca Vercel fs kalıcı DEĞİL → yalnız yerel çalıştırma) | yerel dosya yazma (managed, atomik, symlink-guard) | $0 |
| **Obsidian · GitHub vault** | Learn paketi → GitHub repo commit | `OBSIDIAN_GITHUB_REPO` + `OBSIDIAN_GITHUB_TOKEN` | **blocked-external** (env yok) | GitHub Contents API (idempotent; değişmemiş dosya commit üretmez) | $0 |
| **X API — doğrudan yayın** | CemOS içinden gerçek X publish | (yok) | **blocked** (kalıcı; "Onay ver" GERÇEK ödeme yapmaz) | dış publish | **ödeme onayı** (X API ücretli; ~$2–48/ay senaryosu CostsTab'de) |
| **Tier-2 otomatik medya render** | Ağır reels/carousel render | (uygulanmadı) | **blocked-product-decision** (Vercel Workflows veya ayrı worker mümkün; format/provider/storage seçilmedi) | render + storage | sağlayıcı + compute maliyeti |
| SocialData / YouTube / Gemini / Supadata / Fal / Neon / CredEnc | (destek katmanı) | ilgili env | çoğu configured | okuma/üretim | küçük |

## 1. Güvenli aktivasyon SIRASI (bağımlılık-öncelikli)

Sıra, en düşük risk + en yüksek değer önce. Her adım bağımsız doğrulanabilir; biri
diğerini engellemez (biri blocked kalsa da sonrakiler açılabilir).

1. **OpenRouter kredisi** (USER-ACTION, $ küçük) — üretim hattının ana kilidi. Kredi
   ekle → `verify:catalog` (ücretsiz /models) zaten geçer; ilk canlı üretim = tek
   golden taslak + CostsTab'de gerçek maliyet doğrulaması. **Önce bu**, çünkü B'nin
   rescore + üretim + pattern extraction hepsi buna bağlı. Rollback: kredi bitince
   sistem otomatik 402-degraded'e döner (kod değişmez).
2. **Obsidian export** (USER-ACTION, $0) — en güvenli canlı dış yazma. `OBSIDIAN_VAULT_PATH`
   (yerel) VEYA `OBSIDIAN_GITHUB_REPO`+`OBSIDIAN_GITHUB_TOKEN` set et → tek ready pack →
   `POST /api/learn/packs/[id]/export {channel}` → manifest preview + ikinci koşu
   `already_current` (idempotent) + pre/post dosya listesi. Rollback: env kaldır →
   ZIP fallback'e döner. Kod hazır (localVault/githubVault/exportService/LearnExportAttempt).
3. **Meta business_discovery → rakip radarı** (BLOCKED-EXTERNAL, ücretsiz tier) — Phase 5A'da
   IG watchlist "hesap ekle" canonical (CompetitorWatchlistCard). Meta token + izin
   (instagram_basic + business_discovery) tamamlanınca günlük cron watchlist'i sync eder →
   outlier feed dolar. Rollback: token kaldır → watchlist beklemede (config-required).
4. **Composio own-account IG** (BLOCKED-EXTERNAL) — kendi hesabın read-only sync.
   `COMPOSIO_*` env → `/api/integrations` binding doğrular → "Instagram verilerini
   senkronize et". Rollback: env kaldır → configured=false.
5. **Tier-2 otomatik medya render** (BLOCKED-PRODUCT-DECISION) — önce çıktı sözleşmesi,
   render sağlayıcısı, depolama ve aylık maliyet tavanı seçilir. Ardından dayanıklı çok-adımlı
   yürütme için Vercel Workflows veya ayrı worker değerlendirilir. Mevcut `npm run worker`
   render motoru değildir. Intent-only akış bundan bağımsız çalışır.
6. **X API doğrudan yayın** (BLOCKED-EXTERNAL, ödeme) — EN SON + ayrı ödeme kararı.
   Şu an intent-only ("X'te aç") tam yeterli. Ödeme onaylanana dek AÇILMAZ; ADR-025
   PublishAttempt state machine gerçek adapter'ı buna göre bekler.

## 2. Credential gereksinimleri (secret VALUE asla repoya/rapora)

Yalnız env NAME'ler — değerler Vercel/yerel `.env`'e operatör tarafından girilir:
`OPENROUTER_API_KEY` · `OBSIDIAN_VAULT_PATH` | (`OBSIDIAN_GITHUB_REPO`+`OBSIDIAN_GITHUB_TOKEN`) ·
`META_ACCESS_TOKEN`+`META_IG_USER_ID` · `COMPOSIO_CONSUMER_API_KEY`+connected-account-id+handle ·
(Tier-2: ayrı worker runtime) · (X API: ödeme + sağlayıcı credential). **Neon parola
rotasyonu** ayrı residual-risk (aşağı).

## 3. Maliyet kapıları

- OpenRouter: aylık bütçe (`getBudgetStatus`) + provider-key cap; rescore/üretim gate'li.
- X API: CostsTab senaryosu — 5–8 post/gün: %0 link ~$2–4/ay · %50 ~$16–26/ay · %100 ~$30–48/ay.
- Obsidian: $0. Meta business_discovery: ücretsiz tier. Composio: plan. Tier-2: altyapı.

## 4. Rollback ilkesi (hepsi için ortak)

Her entegrasyon **env-gate'li ve fail-soft**: credential kaldırınca kod otomatik
degraded/blocked/fixture yoluna döner (kod değişmez, deploy gerekmez). Obsidian → ZIP;
OpenRouter → 402-degraded (heuristik, dürüst etiketli); Composio/Meta → config-required;
X API → intent-only. Hiçbir aktivasyon geri-alınamaz veri mutasyonu yapmaz (export
idempotent; sync read-only; publish intent-only).

## 5. Residual risk (Phase 5A'da kapatılmadı, dürüst)

- **Neon parola rotasyonu**: DATABASE_URL parolası daha önce sızmış olabilir (geçmiş
  kaza). Rotasyon operatör kararı; Phase 5A'da yapılmadı. Rotasyon sonrası tek env
  güncellemesi + redeploy.
- **Canlı ücretli LLM hiç çalıştırılmadı** ($0) → ilk canlı golden koşusu Phase 5B.
- **Composio/Meta/X/Tier-2 canlı doğrulaması yok** — kod + fixture + hermetik test var,
  gerçek provider round-trip operatör credential'ı bekliyor.
- **Training-center geçmiş görünümü** (Phase 5A kapsam dışı): backend LIVE, canonical
  UI evi 5B'de KEEP/MERGE/HIDE/DELETE kararı bekliyor (öneri: `profile-memory` veya
  `lib-ogrenme` alt görünümü — yeni top-level ekran DEĞİL).
- **X-Idea/create-draft köprüsü** (MCP-only): dashboard-orphan; kablolamak yeni yüzey
  alanı = re-home değil → 5B operatör kararı.

## 6. Phase 5B için TEK uygulanabilir sonraki adım

**OpenRouter kredisi ekle → tek golden taslağı canlı üret → CostsTab'de gerçek maliyeti
doğrula.** Bu, en düşük riskli + en yüksek değerli adım; B'nin rescore + üretim + pattern
hattının tamamını "fixture-verified"dan "live-verified"a taşır. Diğer tüm entegrasyonlar
bundan bağımsız, kendi credential'ları geldikçe yukarıdaki sırayla açılabilir.

## 7. Salt-okunur envanter denetimi (2026-07-20)

Kod-temelli, **canlı round-trip YOK, secret VALUE okunmadı** (yalnız env NAME'ler +
`configured` mantığı). Hiçbir entegrasyon "live-verified" ilan EDİLMEZ — prod DB
sorgulanmadı. Kaynak: `/api/integrations` (`isOperatorOrCronAuthorized`; `has(names)` =
`process.env[n]` trimmed non-empty) + `/api/health` (deep probe opsiyonel).

| Entegrasyon | Env NAME'ler (koddan) | Sınıf | Canlı kanıtı nerede olurdu |
|---|---|---|---|
| OpenRouter üretim | `OPENROUTER_API_KEY` | configured-in-code | `UsageLog`, `EvalRun` |
| OpenRouter canlı ücretli kapı | `OPENROUTER_KEY_ROTATED_AT`, `AI_EVAL_SPEND_ENABLED`, `PHASE2E_LIVE_EVAL_APPROVED`, `PHASE2E_LIVE_MAX_USD` | blocked-external (hepsi default-off) | liveGates env varlığı |
| Composio IG | `COMPOSIO_CONSUMER_API_KEY`, `COMPOSIO_INSTAGRAM_CONNECTED_ACCOUNT_ID`, `COMPOSIO_INSTAGRAM_ACCOUNT_HANDLE`, `INSTAGRAM_DATA_PROVIDER` | configured-in-code; sync blocked-external | `AccountPlatformBinding.lastSuccessfulSyncAt` |
| Meta IG (business_discovery) | `META_ACCESS_TOKEN`, `META_IG_USER_ID`, `META_GRAPH_VERSION` | configured-in-code (memory canlı iddia ediyor — bu oturumda DOĞRULANMADI) | `IgWatchAccount.lastSyncAt`, `ContentOutlierScore` |
| Obsidian yerel | `OBSIDIAN_VAULT_PATH`, `OBSIDIAN_AUTO_EXPORT` | configured-in-code (opsiyonel); idempotent+bounded | `LearnExportAttempt` |
| Obsidian GitHub | `OBSIDIAN_GITHUB_REPO`, `OBSIDIAN_GITHUB_TOKEN`\|`GITHUB_PERSONAL_ACCESS_TOKEN`, `OBSIDIAN_GITHUB_DIR` | configured-in-code (opsiyonel); idempotent | `LearnExportAttempt` |
| Cron'lar | `CRON_SECRET` (+ `*_BUDGET_MS`) | configured-in-code; prod'da fail-closed | `CronRun` |
| Tier-2 otomatik medya render | (yok) | blocked-product-decision (motor/provider/storage sözleşmesi yok) | henüz render işi/ledger yok |
| X API doğrudan | (yok) | blocked-external (`payment_approval_required`, sıfır ağ) | — (adapter asla yazmaz) |
| X intent akışı | (yok) | configured-in-code / çalışıyor ($0) | `PublishAttempt`/`PublishLog`/`PublishedPost` |

**Haber/trend cron (salt-okunur):** `vercel.json` → `/api/cron/news` **günde bir 12:00 UTC**
(`0 12 * * *`). Kod yorumu "every 3h" idi → GERÇEĞE göre düzeltildi (Vercel Hobby cron
başına günde-1 sınırı; tick deadline-bounded + idempotent → Pro/manuel daha sık güvenli).
`isCronAuthorized` prod'da fail-closed (`CRON_SECRET` yoksa 401). Dedup: `NewsItem.url @unique`
+ 7g url/başlık dedup; `processingStatus` cursor (raw→translated→analyzed); `sweepStale` 7g
karantina; `sweepStuck` 48h retry; `CronRun` heartbeat-first. **Cron TETİKLENMEDİ** — yalnız
kod + config denetimi.

## 8. Aktivasyon-anı resmi doküman işaretçileri (erişim: 2026-07-20)

Bunlar **aktivasyon-anı referanslarıdır**; canlı yazma BLOCKED-EXTERNAL olduğundan bu
oturumda round-trip için KULLANILMADI. Operatör credential sağladığında güncellik
2026-07-20 sonrası yeniden doğrulanmalı (sürümler değişebilir).

- OpenRouter API + `/models`, `/key`: https://openrouter.ai/docs
- Composio MCP (kodda sabit endpoint `https://connect.composio.dev/mcp`): https://docs.composio.dev
- Claude Code MCP kurulumu (`claude mcp`): https://docs.claude.com/en/docs/claude-code/mcp
- Meta Graph API — Instagram business_discovery: https://developers.facebook.com/docs/instagram-api
- GitHub Contents API (Obsidian GitHub vault): https://docs.github.com/en/rest/repos/contents
- Vercel Cron Jobs (Hobby cron limitleri): https://vercel.com/docs/cron-jobs
- Neon (parola rotasyonu — residual risk): https://neon.tech/docs/manage/roles

**Sonuç:** Envanter dürüst ve turnkey; hiçbir canlı sağlayıcı yazımı/ödeme yapılmadı.
Aktivasyon adımları operatör credential + onayı bekliyor (§1 sırası).
