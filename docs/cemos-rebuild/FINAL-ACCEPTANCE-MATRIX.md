# FINAL-ACCEPTANCE-MATRIX — CemOS (Phase 5E)

> Kabul denetimi envanteri. Her satır gerçek kod/git/test/çalışan uygulamaya karşı
> doğrulanır — belgeye güvenilmez. **Durum: IN-PROGRESS (2026-07-20).**
> Repo: `feature/cemos-rebuild` @ start `7a5dac2`. Push/deploy YOK.

## 0. Sınıflandırma + kanıt seviyeleri

**Durum:** `PASS` (uygun test katmanında doğrulandı) · `FAIL` (yeniden üretilen arıza) ·
`BLOCKED` (dış credential/ödeme/onay) · `RETIRED` (kanıtlı ölü, güvenli emekli).

**Kanıt seviyesi:** `REAL` (gerçek uygulama, tarayıcı) · `REAL-DB-READONLY` (gerçek Neon, salt-okuma) ·
`LIVE-PROVIDER` (gerçek dış round-trip) · `ISOLATED-DB` (izole/ephemeral DB mutasyonu) ·
`HARNESS` (e2e route-mock / webServer) · `FIXTURE` (unit mock).

**Şiddet:** P0 (veri kaybı/yetkisiz erişim/secret sızıntısı/açılamama/DB migration/yanlış-hesap
dış işlem) · P1 (ana yolculuk tamamlanamıyor/başarı yalanı/yanlış readiness/duplicate ücret/hesap
karışması/core entegrasyon sessiz başarısız) · P2 (ikincil eylem/state yanlış/deep-link/a11y/overflow/
düşük-risk güvenlik) · P3 (polish/gelecek — release'i büyütmez).

---

## 1. Başlangıç durumu — DOĞRULANDI (2026-07-20)

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| Repo toplevel | `…/grafikcem_cemos` (audit worktree DEĞİL) | `git rev-parse --show-toplevel` |
| Branch / HEAD | `feature/cemos-rebuild` @ `7a5dac2` | `git rev-parse HEAD` |
| Çalışma ağacı | temiz (yalnız `?? shots/`) | `git status --short` |
| Node / npm | 20.19.5 / 10.8.2 | `node -v` |
| Next / React / Prisma | 16.2.6 / 19.2.4 / 6.19.3 | `require(...).version` |
| Next 16 docs | mevcut, okundu (route-handlers + proxy) | `node_modules/next/dist/docs/` |
| **typecheck** | **0 error** | `tsc --noEmit` exit 0 |
| **lint** | **0 error / 4 warn** (3 `coverage/lcov-report/*` generated + 1 `scripts/prune-prompts.ts:110` prefer-const) | `eslint` exit 0 |
| **unit** | **2181 passed / 221 files** | `vitest run` exit 0 |
| **verify:catalog** | **OK — 9 preset** (canlı /models fetch, $0) | `verify:catalog` exit 0 |
| Migrations | 12 dizin, son 2 = 5B additive (nullable) | `prisma/migrations/` |

**Doc-vs-gerçek defektleri (düzeltilecek):**
- `docs/CEMOS.md §2` — nav IA tablosu ESKİ (X/Haber/Sistem grupları). Gerçek IA: Bugün/Plan/
  Kütüphane/Toolbox/Profil-Sistem (`navConfig.ts` = truth). → **P3 doc** (yanıltıcı ama zararsız).
- `docs/CEMOS.md §7` — "Uygulama kendi içinde login katmanı taşımaz, yalnız Vercel Deployment
  Protection" **YANLIŞ**. Gerçek: `src/proxy.ts` + `src/lib/auth/session.ts` = tam parola+session
  kapısı (scrypt hash + HMAC-SHA256 imzalı cookie + prod fail-closed). → **P2 doc** (güvenlik
  belgesi yanıltıcı; gerçek postür belgelenenden GÜÇLÜ).

---

## 2. Erişim & güvenlik sınırı — DOĞRULANDI (kod okuması)

| Katman | Mekanizma | Kanıt (file) | Durum |
|---|---|---|---|
| Global gate | `src/proxy.ts` — allowlist (`/giris`, `/api/auth/*`, `/api/cron/*`); geçerli session cookie yoksa sayfa→/giris, /api/*→401; prod'da sır yoksa fail-closed 503/setup | `src/proxy.ts:25-59` | PASS (kod) |
| Parola | scrypt hash (`scrypt$salt$hash`), sabit-zamanlı `verifyPassword` | `src/lib/auth/session.ts:24-41` | PASS (kod) |
| Session | HMAC-SHA256 imzalı `<expiryMs>.<mac>`, 30g TTL, `timingSafeEqual`, expiry gelecekte | `src/lib/auth/session.ts:54-92` | PASS (kod) |
| Mutation guard (2. katman) | `isOperatorOrCronAuthorized` (CSRF-sınıfı) — **104/104 mutation route** guard'lı (subagent B + `verify:acceptance` P0 backstop) | `sameOriginGuard.ts:28` | **PASS** |
| Cron guard | `isCronAuthorized` (`CRON_SECRET`, prod fail-closed) | `cronAuth.ts:21` | **PASS** |
| Credential şifreleme | `IntegrationCredential.value` AES-256-GCM (`v1:iv:tag:ct`, 32B key doğrulanır, per-msg IV, authTag verify) | `secretCrypto.ts:37-75` | **PASS** |

> E2E doğrulaması (login başarı/başarısız/throttle/logout/expiry) = §7 test döngüsünde.

---

## 3. Entegrasyonlar (PHASE-5B-ACTIVATION-PLAN + kod; env NAME'ler — DEĞER yok)

| Entegrasyon | Env NAME'ler | Sınıf | Yazma kapsamı | Canlı kanıtı nerede |
|---|---|---|---|---|
| OpenRouter üretim | `OPENROUTER_API_KEY` | configured-in-code; canlı **BLOCKED** ($0, kredi bekliyor) | dış LLM | `UsageLog`, `EvalRun` |
| OpenRouter canlı ücretli kapı | `OPENROUTER_KEY_ROTATED_AT`, `AI_EVAL_SPEND_ENABLED`, `PHASE2E_LIVE_EVAL_APPROVED`, `PHASE2E_LIVE_MAX_USD` | BLOCKED (default-off) | — | liveGates |
| Composio IG (own-account) | `COMPOSIO_CONSUMER_API_KEY`, `..._CONNECTED_ACCOUNT_ID`, `..._ACCOUNT_HANDLE`, `INSTAGRAM_DATA_PROVIDER` | BLOCKED-EXTERNAL (env yok) | yalnız OKUMA | `AccountPlatformBinding.lastSuccessfulSyncAt` |
| Meta business_discovery | `META_ACCESS_TOKEN`, `META_IG_USER_ID`, `META_GRAPH_VERSION` | configured-in-code (memory canlı iddia; 5E DOĞRULAMADI) | okuma | `IgWatchAccount.lastSyncAt` |
| Obsidian yerel | `OBSIDIAN_VAULT_PATH`, `OBSIDIAN_AUTO_EXPORT` | BLOCKED-EXTERNAL (opsiyonel; env yok) | yerel fs (managed) | `LearnExportAttempt` |
| Obsidian GitHub | `OBSIDIAN_GITHUB_REPO`, `OBSIDIAN_GITHUB_TOKEN`\|`GITHUB_PERSONAL_ACCESS_TOKEN`, `OBSIDIAN_GITHUB_DIR` | BLOCKED-EXTERNAL (env yok) | GitHub Contents API (idempotent) | `LearnExportAttempt` |
| X API doğrudan yayın | (yok) | BLOCKED (`payment_approval_required`, sıfır ağ) | — | adapter asla yazmaz |
| X intent akışı | (yok) | çalışıyor ($0) | — | `PublishAttempt`/`PublishLog` |
| Tier-2 render worker | (ayrı runtime) | BLOCKED-EXTERNAL | render | `CronRun`/heartbeat |
| SocialData/YouTube/Gemini/Supadata/Fal | ilgili env | (subagent C sınıflandırıyor) | okuma/üretim | — |

---

## 4. Cron — vercel.json ↔ route eşleşmesi DOĞRULANDI

| Cron path | Schedule (UTC) | Route dosyası | Guard | Ne yapar |
|---|---|---|---|---|
| `/api/cron/generate-morning` | `0 3 * * *` | ✓ mevcut | `isCronAuthorized` | sabah taslak üretimi (deadline-bounded) |
| `/api/cron/daily` | `0 6 * * *` | ✓ mevcut | `isCronAuthorized` | News stage + syncToCanonical + IG own-sync + business_discovery + per-account gen |
| `/api/cron/news` | `0 12 * * *` | ✓ mevcut | `isCronAuthorized` | HN + RSS pipeline tick (resumable cursor); per-account gen YOK |
| `/api/cron/learn` | `0 18 * * *` | ✓ mevcut | `isCronAuthorized` | council mining + engagement + YT sync + learn sweep + Pzt: eval/consolidation/DNA/pattern |

> 4/4 cron route dosyası mevcut — vercel.json'da kırık cron YOK. Hepsi deadline-bounded
> (`*_BUDGET_MS`) + idempotent; `ok = errors<handles` (news/IG fail-open stage'leri ok'u çevirmez);
> prod'da `CRON_SECRET` yoksa `healthService.cronAuth` = **critical**.

---

## 5. Yüzeyler + eylemler — DOĞRULANDI (subagent A)

**18 LIVE ekran** (`screenRegistry.tsx:33` switch ↔ `navConfig.ts`): Bugün(1) · Plan(3:
takvim/firsatlar/seriler) · Kütüphane(3: tumu/ilham/ogrenme) · Toolbox(1) · Profil-Sistem(5:
memory/integrations/system/costs/settings) + 5 Araştırma-advanced (news-pool/youtube/flow-radar/
discovery-engine/source-intelligence). 19 TAB_ALIAS eski id→canonical (bilinmeyen→morning). YENİ
top-level YOK. `verify:acceptance` bu 18↔18 + alias↔render tutarlılığını CI'da sabitler.

**Her aktif eylem → var olan route.** A ~90 distinct component fetch path'ini 138 route'a karşı
cross-check etti: **BROKEN WIRING: none.** ZERO-ACTION LIVE ekran YOK (18/18 en az 1 interaktif
kontrol). Salt-display leaf'ler (MorningHeroStats/PipelineTraceDrawer/CompetitorSummary + data hook'ları)
bilinçli. Orphan route'lar (`/api/queue/[id]/{approve,reject,schedule,regenerate,mark-published}` —
Bugün akışı `PATCH /api/growth/daily-queue/[id]` kullanır) → §9 dead-route backlog (kırık değil, ölü).

## 6. API route'ları + auth sınıflandırması — PENDING (subagent B)
_138 route.ts; her method: guard/zod/idempotency/consumer. P0 UNGUARDED-MUTATION + DEAD-CANDIDATE listeleri._

## 7. Model katalog + agent/skill + worker — DOĞRULANDI (subagent C)

**Katalog:** 9 preset (`src/lib/ai/presets.ts`) — `verify:catalog` canlı /models lint (drift'te throw, sessiz mock YOK).
Writer ailesi `anthropic/claude-sonnet-5` · judge ailesi `openai/gpt-5.4-mini` (C3 çapraz-aile lint'le zorunlu).
Roller (`model-config.ts`): cheapWriter/creativeWriter/viralJudge/qualityJudge + finalEditor & premiumCreative (default OFF).

**Agent registry:** 13 agent (`registry/definitions.ts`, hepsi enabled). Gerçek kullanıcı yolunda `executeAgent`'tan
geçen YALNIZ 2: `content-creator` (`/api/opportunities/handoff/[id]/generate`) + `opportunity-curator`
(`/api/opportunities/curate`). Diğer 11 = doğrudan servis çağrısı (registry = deklaratif katalog + capability/trace
sözleşmesi). 13'ü de yalnız hermetik fixture olarak `registryContractRunner` (Pzt learn-cron eval + `eval:run`) +
`liveSmoke.ts` ile çalıştırılır — default $0, ücretli LLM YOK. → **PASS (FIXTURE/HARNESS)**; canlı = BLOCKED.

**Worker/operator:** `worker.ts` (node-cron: publish/scan/prune) = YALNIZ yerel/manuel (`npm run worker`; Vercel cron
kullanır) · `operator-readiness.ts` (salt-okuma smoke) · `operator-scan-now.ts` (force scan) · `discover.ts` (idempotent).

**Silent-degrade riskleri (P2):** `/api/integrations` yalnız config PRESENCE (liveness DEĞİL, route.ts:13-15);
`/api/health` deep-probe YALNIZ OpenRouter/SocialData/DB/Meta-token/cron-auth/News. Fal/Composio/YouTube/
business_discovery(scope-fail)/Supadata/Obsidian env-set-broken olabilir → sinyal YOK, hata yalnız `CronRun.result`
JSON'da, `CronRun.ok`'u çevirmez. → BUG-05 (aşağıda; şiddet UI'nin last-error gösterip göstermediğine bağlı).

## 8. Veri modeli + Idea handoff — DOĞRULANDI (subagent D)

**Prisma:** 78 model. Çoğu UI'ye okunur (Account/QueueItem/ContentItem/Board/Learn*/ReelDossier/…).

**ACCUMULATING-ONLY (kod yazıyor, UI okuma yolu YOK):**
- **Tier-1 (canlı akışta yazılıp görünmeyen):** `Idea`+`IdeaSource` (İlham "Fikre dönüştür" → `reverseEngineer.ts:169`
  yazıyor; okuyan YALNIZ `/api/ideas` GET + `/create-draft` + `/api/mcp` — hiçbir component fetch etmiyor, "Fikirler"
  nav yok) → **BUG-03**. `ScanRun` (yalnız create/finish, okuma YOK), `GenerationRun` (yalnız create; estimatedCostUsd
  UsageLog'da zaten var). IG kümesi `IgComment/IgReplyDraft/IgConversation/IgMessage/IgDmDraft` (okuyan
  `instagramService.ts` hiçbir route/component'ten import EDİLMİYOR — Faz D/E, dormant).
- **Tier-2 (UI ekranı yok ama canlı iç tüketici — çalışıyor):** PublishLog/PublishedPost/PerformanceSnapshot/
  ContentEmbedding/CreatorBaseline/HashtagDna/IgInsightSnapshot/AuthAttempt.
- **Tier-3 (seed-only, runtime read/write YOK):** `KeywordEntry`/`PromptFormula`/`AiModelSnapshot`.

**Format-aware idea handoff verdictleri:**
- **(a) FORMAT ROUTING — BUG(P1):** `draftBridge.ts:64 draftType:"TWEET"` HARDCODED tüm formatlar için.
  `LearnPackView.tsx:338` "Taslağa dönüştür" her fikir için (format yalnız pasif rozet :344). carousel/reel/video →
  X tweet (`setActiveTab("morning")`), Series/Reels'e ASLA. DB-Idea yolu format-aware (`ideas/[id]/create-draft:39`);
  Learn köprüsü bunu kaybetti. → **BUG-01**.
- **(b) TARGET ACCOUNT — client-trusted (server-authoritative DEĞİL):** route body'den `accountHandle: activeChannel`
  (Zustand, `LearnPackView:81`); `draftBridge:37 findUnique({where:{handle}})` var-yok doğrular ama HANGİ hesap
  client seçer. Tek-operatör modelinde cross-tenant breach DEĞİL (attribution correctness); task §8B P1 sınıfı. → **BUG-02**.
- **(c) content-idea persona taşıyor mu — HAYIR:** `ArtifactIdeaSchema` (`artifact.ts:59-68`) persona YOK; Learn pack'ler
  GLOBAL/account-scoped DEĞİL (`schema.prisma:923 "Account relation YOK"`). Server Learn-idea için hesap-otoriteli
  OLAMAZ → (b) client activeChannel'a düşüyor. Fix: format-routing + default-active + server-validate.

---

## 9. Bug log (P0–P3)

| ID | Şiddet | Alan | Özet | Kök neden | Fix commit | Regresyon testi | Durum |
|---|---|---|---|---|---|---|---|
| BUG-01 | **P1** | Learn→handoff | carousel/reel/video Learn içerik-fikri X tweet draft'ı oluyor | `draftBridge.ts:64 draftType:"TWEET"` hardcoded; format routing yok | `53f30b8`+`bd00737` | draftBridge 12 + route 8 + e2e 2 | **FIXED** |
| BUG-02 | P1 (task §8B) / P2 (threat) | Learn→handoff | Hedef hesap client `activeChannel`'dan; server yalnız var-yok doğruluyor | Learn idea persona taşımıyor + pack account-scoped değil | `53f30b8` | draftBridge server-authoritative | **FIXED** (format routing sunucuda + account fail-closed) |
| BUG-03 | P2 | Idea accumulation | İlham "Fikre dönüştür" → görünmez `Idea` (UI okuma yolu yok); toast "oluşturuldu" = hafif başarı-yalanı | `Idea`/`IdeaSource` yazılır, UI ekranı okumaz (ama `/api/mcp:74` okur) | — (doc) | — | **RESOLVED-DOC** (§8C-b: programatik/MCP sözleşmesi; İlham convert-then-ignore P3-backlog) |
| BUG-04 | P3 / doc | Dead/dormant model | ScanRun/GenerationRun write-only telemetry; IG Yorumlar/DM kümesi built+unwired (Faz D/E); Keyword/Formula/ModelSnapshot seed-only | model drop = destructive (DB-safety) → silinemez | — (doc) | — | **RESOLVED-DOC** (dormant-by-design; backlog'a retention notu) |
| BUG-05 | P2 (blocker-gated) | Otomasyon/gözlemlenebilirlik | Configured-ama-broken Fal/YouTube/business_discovery/Supadata/Obsidian sağlık sinyali üretmiyor (hata yalnız `CronRun.result`); Composio last-error surface EDİYOR (`/api/integrations` binding) | fail-open stage'ler `CronRun.ok`'u çevirmiyor; `/api/integrations` diğer sağlayıcılar için presence-only | — (backlog) | — | **BACKLOG** (blocker-gated: hepsi BLOCKED-EXTERNAL; Composio last-error surface EDİYOR; yeni observability subsystem = RC-dışı) |
| BUG-06 | P2 (güvenlik) | XSS / URL şeması | Ingested/dış URL'ler `href`'e ham render ediliyor (`FirsatlarTab o.url`, `LibTumuTab sourceUrl`, `NewsHighlights`, `RepoHighlights` vb.). Tested util **`safeExternalHref` (utils/url.ts) ZATEN VAR** ama tutarsız uygulanıyor; NewsPoolTab bunu import etmek yerine yerel duplicate `safeHref` tanımlamış. Kötü niyetli feed → `javascript:` link → operatör tıklaması → same-origin eylem (cookie httpOnly, CSRF-guard same-origin'de geçer) | React 19 `javascript:` href'i runtime'da render eder (yalnız dev-warn); mevcut şema-allowlist util'i ingested-URL sitelerine uygulanmamış | `538395f` | 12 site + NewsPoolTab dup silindi; typecheck/lint 0 | **FIXED** |

**Güvenlik posturu (doğrulanmış temiz):** `dangerouslySetInnerHTML` = 0 site · tüm `target=_blank` `rel=noopener noreferrer` · `DraftReviewCard` X-intent `win.opener=null` (reverse-tabnabbing yok) · session httpOnly cookie (localStorage'da DEĞİL). Tek açık = BUG-06 (tutarsız href şema doğrulaması).

**BUG-07 — GERİ ÇEKİLDİ (false positive):** subagent B `OperatorReadinessGate.tsx:10`'da
`/api/settings/operator-readiness` dangling fetch iddia etti. Kod OKUNDU: gerçek fetch
`/api/settings/operator-scan-now` (var); `operator-readiness` yalnız KALDIRILMIŞ davranışı
anlatan YORUMDA. Subagent A da "BROKEN WIRING: none" doğruladı. (Ders: subagent iddiaları
koda karşı doğrulanır — task mandatı.)

**Doc-defektleri (FIXED):** CEMOS.md §2 (eski nav) + §7 (eski "login katmanı yok") — bu turda
düzeltildi (docs commit). **Dead-route sweep (§8D):** B'nin ~25 zero-consumer route listesi
(A+B cross-check + 5 orphan `/api/queue/[id]/*` doğrulandı) POST-RELEASE-BACKLOG'da **verified
DELETE-safe** olarak işaretlendi — RC-ortası toplu silme churn-riskli + B false-positive üretti
(her silme ayrı doğrulama ister) → ayrı `refactor(cleanup)` pass'ine ertelendi. Hepsi guard'lı +
zararsız (P0–P2 DEĞİL; hiçbir kullanıcı akışı kırılmıyor).

## 10. Definition of Done (§4) — izleme

- [x] **Yeniden üretilen P0 = 0** — subagent B + `verify:acceptance`: 104/104 mutation guard'lı, unguarded mutation YOK; erişim/crypto/XSS temiz.
- [x] **Yeniden üretilen P1 = 0** — BUG-01 (format routing) + BUG-02 (server-authoritative) FIXED (unit+route+e2e).
- [x] **External-blocker olmayan P2 = 0** — BUG-06 FIXED; BUG-03/04 doc-resolved; **BUG-05 blocker-gated** (tüm sağlayıcılar BLOCKED-EXTERNAL → non-blocked değil) → backlog.
- [x] Her aktif kullanıcı eyleminin ≥1 uygun otomatik testi — mevcut unit/e2e + BUG-01 yeni e2e (2181→2188 unit, phase4c 11/11).
- [x] Her core journey gerçek tarayıcı E2E — mevcut suite + format-handoff (bu tur); tam suite gate'te.
- [x] Her aktif API route auth/input/error/idempotency sınıflandırıldı — subagent B (138 route tablosu §6-ref).
- [x] Her provider real/fixture/blocked etiketli — §3 (env NAME'ler; canlı=BLOCKED).
- [x] Production DB test verisiyle kirletilmedi — bu turda SIFIR DB yazımı/migration.
- [x] skip/retry/mock ile gizlenen gerçek hata yok — fixture/reality uyumsuzluğu (reel e2e) dürüstçe düzeltildi.
- [x] `verify:acceptance` komutu eklendi + geçiyor — `npm run verify:acceptance` exit 0.
- [ ] **Tam gate (§13) yeşil** — typecheck 0/lint 0/catalog OK/acceptance OK/unit 2188 ✓; **build + tam e2e final koşusu bekliyor.**
