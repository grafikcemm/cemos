# Phase 5A — Canonical Feature Re-home + Product Hardening (Parity Matrix)

> Durum: 2026-07-19 · Audit TAMAM, implementasyon başlıyor · Sahne: `feature/cemos-rebuild` @ `57619d2`
> Truth sources (bu belge onları ÖZETLER; çelişkide KOD kazanır):
> `src/components/nav/navConfig.ts` (sınıflandırma + alias) · `src/components/shell/screenRegistry.tsx`
> (ekran→bileşen) · `prisma/schema.prisma` (veri modeli) · ilgili `/api/*` route'ları.
>
> ADR-044 (bu faz). Amaç: Phase 4D'de emekliye ayrılan ekranların **benzersiz, hâlâ değerli**
> kullanıcı eylemlerini — yeni bağımsız dashboard AÇMADAN — mevcut sade IA'ya (Bugün/Plan/Kütüphane/
> Toolbox/Profil) yerleştirmek + üç ürün-borcu bug'ını düzeltmek + ölü IG legacy'sini emekliye ayırmak
> + first-navigation flake'ini kök-nedeninden çözmek + dürüst entegrasyon envanteri çıkarmak.

## 0. Yöntem + doğrulama sınırı

4 paralel **salt-okunur** kod araştırmacısı (Bugün / Kütüphane / Instagram-Reels / flake) +
ana-thread doğrulaması. Belgeye yazılan her "backend LIVE / zero-caller / bug" iddiası ya bir
alt-ajan tarafından `dosya:satır` ile kanıtlandı ya da ana-thread'de bizzat okunarak teyit edildi.
Teyit edilenler aşağıda **[verified]**; alt-ajan iddiası henüz elle görülmediyse **[agent]** olarak
işaretlidir. Hiçbir dış çağrı yapılmadı; dev server başlatılmadı (statik analiz).

Baseline (değişiklik ÖNCESİ, bu oturumda koşuldu): typecheck **exit 0**; unit **2139/2139** (214 dosya);
worktree temiz (`?? shots/`). Son migration: `20260719160000_add_learn_export_attempt` (9 migration dizini).

## 1. Import-graph verdikti — 3 IG legacy dosyası %100 ölü kod [verified + agent, 6 kanıt]

`InstagramTab.tsx`, `CompetitorRadarSection.tsx`, `ReelsDossierSection.tsx` runtime'da **erişilemez**:

1. `InstagramTab` `src/` genelinde **hiçbir yerden import edilmez** (yalnız kendi tanımı + docs).
2. `screenRegistry.tsx:33-81` switch'inde **`"instagram"` case YOK**; `normalizeTabId` (satır 34) switch'ten
   ÖNCE koşar, `TAB_ALIASES["instagram"]="plan-seriler"` (`navConfig.ts:153`) → `SerilerTab`. [verified]
3. `AppShell.tsx` içinde `instagram` referansı yok.
4. `CompetitorRadarSection` yalnız `InstagramTab.tsx:6`; `ReelsDossierSection` yalnız `:7` tarafından
   import edilir → ikisi de **aynı tek ölü ebeveyn** üzerinden orphan. [verified]
5. Hiçbir `dynamic()`/`import()` bu 3 dosyaya değmez; `src/app/dashboard/instagram/page.tsx` yok.
6. `allNavigableTabs()` (`navConfig.ts:278-289`, Cmd+K kaynağı) `"instagram"`'ı içermez.

**Alias `instagram→plan-seriler` bir veri-tablosu girdisidir, bu 3 dosyadan yapısal olarak bağımsızdır**
→ dosyaları silmek alias'ı bozamaz; alias KORUNUR (ürün-kimlik değişmezi).

## 2. Parity matrisi

Sütunlar: Kabiliyet · Eski UI/API · Backend · Canonical'da VAR mı? · Eksik eylem · Yeni ev · Reuse · Test/kabul · Karar.

### 2A. Bugün (screen `morning` → `MorningDashboardTab`)

| Kabiliyet | Eski UI/API | Backend | Canonical'da? | Eksik eylem | Yeni ev | Reuse | Test/kabul | Karar |
|---|---|---|---|---|---|---|---|---|
| Düzenle-yayınla implicit sinyali | DailyQueueTab(silindi)→`confirmManualPublish` | LIVE, **idempotent** | **VAR (sessiz)** | (yok) — opsiyonel: kullanıcıya "sinyal kaydedildi" geri bildirimi | `morning`/`DraftReviewCard` toast | `publishAttemptService.confirmManualPublish` | edited draft 2× hızlı mark → 1 `FeedbackEvent(edited)` | KEEP AS-IS |
| Açık ±geri bildirim + sebep chip + not | DailyQueueTab(silindi)→`POST /api/growth/daily-queue/[id]/feedback` | LIVE ama **idempotency YOK** | **YOK** | thumbs +/− + `FeedbackType` chip'leri + serbest not | `morning`/`DraftReviewCard` "Diğer eylemler" | route + `processFeedback` + `FeedbackType` enum (`types.ts:226`) + **idempotencyKey EKLE** | chip → 1 `FeedbackEvent`+1 `TrainingExample`; çift-tık yine 1'er | KEEP backend, BUILD UI, **FIX idempotency** |
| Yeniden değerlendir (rescore) | DailyQueueTab(silindi)→`POST …/[id]/rescore` | LIVE-deniyor ama **sessizce heuristic'e düşüyor** | **YOK** | rescore tetik + AI-judged↔heuristic ayrımı | `morning`/`DraftReviewCard`/`DraftDetailDrawer` | route + cost-gate `assertGenerationAllowed`/`BudgetExceededError`; degraded-kart deseni `OperatorReadinessGate` | rescore → skorlar güncellenir; kredi yoksa **açık blocked**, sahte sayı değil | KEEP backend, BUILD UI, **FIX telemetry.judged + honest degraded** |
| Taslağı desen kaydet (queueItem-scoped) | DailyQueueTab(varsayılan) | sourcePost-scoped LIVE (Viral Radar) | **Bugün'de YOK** (Plan/Viral Radar'da VAR) | "bu taslağı desen yap" | `morning`/`DraftReviewCard` overflow | `feedback` route `feedbackType:"saved_as_pattern"` | tık → 1 `ViralPattern(isActive)` | KEEP backend, BUILD UI (en düşük öncelik) |
| Feedback/eğitim geçmişi raporu | TrainingCenterTab(silindi)→`GET /api/growth/training-center` | LIVE read model | **YOK** | (rapor, eylem değil) | **`morning` DEĞİL** — 5B'de KEEP/MERGE/HIDE/DELETE kararı | GET route as-is | totals = `feedbackEvent.count()` | KEEP backend, **DEFER yerleşim** |

Doğrulanan değişmezler [verified]: **tek** readiness motoru `assessReadiness` (`readinessService.ts:148`);
`assessQueueItemReadiness` ince combinator (`readinessAdapter.ts:122`), ikinci motor DEĞİL. `/api/queue/*`
ve `/api/growth/daily-queue/*` aynı `QueueItem` tablosunu `queueRepo` ile paylaşır. "X'te aç" **intent-only**
(`prepare-intent` yalnız `PublishAttempt(prepared)`; gerçek gönderim yok).

### 2B. Kütüphane (screen `lib-tumu`/`LibTumuTab`, `lib-ilham`/`LibIlhamTab`)

| Kabiliyet | Eski UI/API | Backend | Canonical'da? | Eksik eylem | Yeni ev | Reuse | Test/kabul | Karar |
|---|---|---|---|---|---|---|---|---|
| 4 legacy türü ara/gez (viral/pattern/prompt/keyword) | 4 tab silindi → `/api/library/search` | LIVE, server-paginated | **VAR** | (yok) | `lib-tumu` | `librarySearch.ts` | mevcut e2e | DONE |
| Desen adayı kaydet | (araştırma yüzeyi eylemi) `…/save-pattern` | LIVE, cost-gated | **VAR** (`ViralRadarScreen` "Desen Yap") | idempotency (tekrar-tık = **ikinci ücretli** çıkarım + dup) | (taşıma yok) | `processFeedback` | aynı `sourcePostId` 2× → 2. çağrı ücret DOĞURMAZ | **FIX idempotency** (bug) |
| Deseni onayla/reddet/arşivle | `PATCH /api/growth/pattern-library/[id]` (`isActive`) | PARTIAL-LIVE, **0 UI çağıran** | **YOK** | drawer'da arşivle/yeniden-aktif | `lib-tumu` drawer `type==="pattern"` | mevcut PATCH + `viralPatternRepo.deactivate` (**yalnız `isActive`**, asla `validatedAt`) | drawer'dan toggle → search yansıtır; tekrar-toggle idempotent | BUILD UI (backend hazır) |
| "Neden güçlü?" analiz | — | LIVE (free `analyzeInspirationStructure` + paid `reverseEngineerToIdea`) | **VAR** (`InspirationDetailDrawer`) | (yok) | `lib-ilham` | mevcut | mevcut e2e | DONE |
| Viral öğe kaldır (`SavedViralTweet`) | ViralLibraryTab(silindi)→`DELETE /api/viral-library` | LIVE hard-delete, 0 UI çağıran | **YOK** | drawer'da **kalıcı kaldır (onaylı)** | `lib-tumu` drawer `type==="viral"` | mevcut DELETE route (yeni backend YOK); confirm + geri-döndürülemezlik açık (kullanıcının kendi yer-imi, spec §C izinli) | kaldır → search'ten düşer, `counts.viral` azalır; iptal → değişmez | BUILD UI (**migration YOK**) |
| Öğeden fikir/taslak/plan handoff | — | LIVE `OpportunityHandoff` (idempotent) | **VAR (plan/seri)** (`InspirationDetailDrawer` "Seriler'e/Takvim'e aktar") | (yok) | `lib-ilham` | `opportunityHandoffService` | mevcut e2e | DONE |

Doğrulanan [verified/agent]: **tek** kanonik save sözleşmesi `saveToBoard.ts`+`saveFromSource.ts`+
`SaveToBoardButton`+`POST /api/library/save` (3-katman idempotency: advisory-lock + in-tx findFirst +
P2002 backstop). `ViralPattern`/`SavedViralTweet`/`PromptTemplate` salt-okunur **browse** kaynakları,
board'a kaydedilmez (`LibTumuTab` tasarım notu) → **paralel store YOK**.

### 2C. Instagram/Reels → Plan (screen `plan-firsatlar`/`plan-takvim`/`plan-seriler`)

| Legacy eylem | Kaynak | Backend | Canonical'da? | Eksik eylem | Yeni ev | Reuse | Test/kabul | Karar |
|---|---|---|---|---|---|---|---|---|
| IG watchlist görüntüle + hesap ekle (probeStatus) | CompetitorRadarSection | `GET/POST /api/instagram/watchlist` (**global**, `configured` flag) — **0 canonical çağıran** [verified] | **YOK** | izlenen-hesaplar kartı: liste + ekle + `business_discovery` config-durumu | `plan-firsatlar` `radar` segmenti | route as-is + `Card/SectionHeader/Badge/EmptyState/Input/Button`; `configured=false`→**blocked-external** | GET satırları + boş durum; POST 201 + reload | BUILD küçük kart |
| Outlier → IG post deep-link | CompetitorRadarSection `href={o.url}` | `/api/instagram/outliers` | **YOK** (`mapRadar` `url`'i düşürüyor) [verified] | outlier kartında kaynağa git | `plan-firsatlar` (Fırsatlar radar kartı) | `RawRadar`+`OpportunityInput`+`Opportunity`'e `url` ekle + FirsatlarTab action slot | tık → IG post açılır | **FIX regresyon** (sil-öncesi) |
| Dossier list/detail/verify/**re-verify** | ReelsDossierSection | `/api/reels/dossier*` | **VAR, AŞIYOR** (`TakvimTab`+`DossierProductionPanel` "Yeniden doğrula") | (yok) | (mevcut) | — | mevcut phase3d/e e2e | DONE |
| Aylık plan (assemble) | ReelsDossierSection hardcoded POST | `/api/reels/plan/preview\|apply\|lifecycle` | **VAR, AŞIYOR** (`PlanBuilder`) | (yok) | (mevcut) | — | mevcut phase3e e2e | DONE |
| Freestanding topic+tool dossier (slot'suz) | ReelsDossierSection | `POST /api/reels/dossier` | **PARTIAL** (2 yol var: slot-generate topic-only + alternative-branch) | tek-adım boş-durum girişi | (opsiyonel, düşük öncelik) `plan-takvim` toolbar | `SlotDossierActions` deseni | slot'suz oluştur → Takvim'de görünür | UX gap (opsiyonel) |
| `TimelineLane` swimlane | ReelsDossierSection | — | design kararı (TakvimTab month-grid ikame) | (yok) | — | — | — | Cascade-orphan: ReelsDossier ile birlikte SİL |

## 3. Genuinely-missing vs already-present — GERÇEK Phase 5A işi

Çoğu kabiliyet Phase 4B/4C/canonical yüzeylerde ZATEN var. Gerçek iş:

**Yeni UI kablolaması (backend hazır, 0 UI çağıran):**
1. Bugün: açık ±feedback + sebep chip + not (task B).
2. Bugün: rescore tetik + dürüst degraded (task B).
3. Kütüphane: pattern arşivle/yeniden-aktif (`isActive`) (task C).
4. Kütüphane: viral öğe kalıcı kaldır (onaylı, spec-uygun; migration YOK) (task C).
5. Plan: IG watchlist admin kartı (task D).

**Bug düzeltmeleri (re-home'dan bağımsız, gerçek defektler):**
6. `feedback` route idempotency yok → dup + dup embedding/reweight (task B).
7. `rescore` `telemetry.judged` yazmıyor → judged draft "judged değil" görünür (task B).
8. `rescore`/`scoreDraftWithAI` `BudgetExceededError` yutuyor → kredi-yok sessizce heuristic (task B).
9. `save-pattern` idempotency yok → tekrar-tık **ikinci ücretli** çıkarım + dup `ViralPattern` (task C).
10. `mapRadar` outlier `url`'i düşürüyor → deep-link regresyonu (task D, sil-öncesi).

**Emeklilik (task D2):** 3 ölü IG dosyası + cascade-orphan `TimelineLane` sil; alias KORU.

## 4. Kapsam dışı (bilinçli — "istenmeyen özellik yok")

- **Training-center geçmiş görünümü**: rapor, eylem değil; `morning`'e ait değil. 5B'de KEEP/MERGE/HIDE/
  DELETE kararı. Backend korunur. (Phase 5A'da ekran açmıyoruz.)
- **X-Idea/create-draft köprüsü** (`/api/ideas*`): tam implement ama **UI-orphan (yalnız MCP)**. Bunu
  kablolamak = **yeni yüzey alanı**, re-home DEĞİL → Ali'ye 5B kapsam kararı olarak bırakılır, bu fazda
  yapılmaz.
- **`/api/competitors`**: operator/cron statik config (yalnız route-guard testinde). Re-home hedefi değil
  (red herring).
- **Watchlist DELETE**: hiç var olmadı (route yalnız GET/POST). "Hesap kaldır" bir gap değil.
- **`DraftPreview.tsx`**: ayrı ölü kod (0 importer, legacy `/api/queue`). 4D emeklilik listesinde değildi;
  ayrı temizlik kararı (bu fazda dokunulmaz / not düşülür).

## 5. Migration planı — TEK safe additive kolon (DB-güvenliği KRİTİK)

Re-home mevcut tabloları REUSE eder. **TEK** correctness-driven additive kolon gerekli — DB risk yüzeyi
minimumda tutuldu (parola-wipe geçmişi nedeniyle bilinçli olarak mümkün olan en küçük değişiklik):

```
ALTER TABLE "FeedbackEvent" ADD COLUMN "idempotencyKey" TEXT;          -- nullable
CREATE UNIQUE INDEX "FeedbackEvent_idempotencyKey_key"
  ON "FeedbackEvent"("idempotencyKey");                                 -- NULL-distinct (Postgres)
```

Gerekçe: `FeedbackEvent` hiç unique taşımıyor → test edilen idempotency sözleşmesi (çift-tık/retry) en
sağlam bir DB kısıtıyla karşılanır — **tam olarak** `LearnReviewAttempt`/`PublishAttempt` deseni
(NULL-distinct `idempotencyKey`; client key üretir → sunucu pre-check + P2002-backstop). Diğer re-home
eylemleri migration GEREKTİRMEZ: pattern arşivle = mevcut `PATCH …/pattern-library/[id]` `isActive`
(yalnız, asla `validatedAt`); viral öğe kaldır = mevcut `DELETE /api/viral-library` (kullanıcının kendi
yer-imi → kalıcı silme ürün-uygun; **açık geri-döndürülemezlik onayı** ile, spec §C izinli); save-pattern
idempotency = `SourcePost.status="used"` guard'ı (mevcut kolon).

**Yasaklıların hiçbiri:** DROP/TRUNCATE/ALTER TYPE/koşulsuz DELETE/rename/backfill YOK. **Uygulama
protokolü:** (1) `prisma migrate status` read-only → DB'nin 9 mevcut migration'la senkron olduğunu
doğrula (drift → DUR). (2) SQL offline üret (`migrate diff --from-schema-datamodel <HEAD-şema>
--to-schema-datamodel <yeni-şema>` — **shadow DB YOK, gerçek URL asla shadow olarak KULLANILMAZ**). (3)
SQL'i satır satır elle denetle. (4) `FeedbackEvent` satır sayısı read-only önce/sonra. (5) `npm run
db:migrate` (guarded `safe-migrate-deploy.ts`). (6) İkinci deploy "No pending migrations" idempotent
no-op kanıtı. Belirsizlik/drift → DUR + raporla.

**Yasaklıların hiçbiri:** DROP/TRUNCATE/ALTER TYPE/koşulsuz DELETE/rename/backfill YOK; yalnız
nullable ADD COLUMN + NULL-distinct unique index. **Uygulama protokolü:** (1) `prisma migrate status`
read-only → DB'nin 9 mevcut migration'la senkron olduğunu doğrula (drift → DUR). (2) SQL offline üret
(`migrate diff --from-schema-datamodel <HEAD-şema> --to-schema-datamodel <yeni-şema>` — **shadow DB YOK,
gerçek URL asla shadow olarak KULLANILMAZ**). (3) SQL'i satır satır elle denetle. (4) Kritik tablo
satır sayıları read-only önce/sonra. (5) `npm run db:migrate` (guarded `safe-migrate-deploy.ts`). (6)
İkinci deploy "No pending migrations" idempotent no-op kanıtı. Herhangi belirsizlik/drift → DUR + raporla.

## 6. Emeklilik planı (task D2, parity kanıtlandıktan SONRA)

Sil: `src/components/tabs/InstagramTab.tsx`, `src/components/instagram/CompetitorRadarSection.tsx`,
`src/components/instagram/ReelsDossierSection.tsx`, ve cascade-orphan `src/components/ui/TimelineLane.tsx`
(+ `ui/index.ts:31` barrel export) — TimelineLane'in tek tüketicisi ReelsDossierSection [verified: agent].
**KORU:** `TAB_ALIASES["instagram"]="plan-seriler"` + tüm legacy deep-link'ler + `useXAgentStore`/
`"xagent-store"`/`XAgentApp.tsx`/HTTP UA. API route'ları + Prisma modelleri **silinmez** (yalnız ölü UI).
`/api/instagram/watchlist` artık canonical (task D) tarafından tüketildiği için CANLI kalır.

## 7. Hardening (parity matrisinin parçası değil — ayrı deliverable)

- **F — first-navigation/hydration flake** (`faz1d-surfaces.spec.ts` › "Fırsatlar: kürasyon segmentleri
  (placeholder değil)", satır 27-33): KÖK-NEDEN = iki bağımsız yarış [agent, elle doğrulanacak].
  **Race A (pre-hydration ölü tık):** `/` tam `"use client"` ağacı (`page.tsx`→`XAgentApp`→`AppShell`),
  Suspense YOK; `goto` `load`'da döner (hydration'ı beklemez); `selectTab` `sidebar-area-plan`'a
  Playwright actionability geçer geçmez tıklar (hydration DEĞİL) → tık pre-hydration'a düşerse yutulur →
  `handleSelectArea` koşmaz → `activeTab` "morning"'de kalır → 2. tık `subnav-tab-plan-firsatlar`'ı
  sonsuza bekler → **45s test-timeout** (10s assert değil). Eager 17-tab import (`screenRegistry`) +
  `next dev --webpack` cold-compile pencereyi genişletir. **Race B (yavaş ilk veri):** `FirsatlarTab`
  önce skeleton (`loading=true`); segment butonları `if(loading) return` altında; `useOpportunities` 4
  abort'suz fetch → Neon cold-start biri **10s expect-timeout**'u aşar; retry-yeşil. **ÇÜRÜTÜLDÜ:**
  "Zustand persist `activeTab`'ı eziyor" — `global-setup` `storageState` HTTP-only (localStorage TAŞIMAZ)
  → her test boş `"xagent-store"` ile başlar; zustand v5 hydrate SENKRON (stale değer/async boşluk yok).
  Gerçek "hydration" = React'in listener bağlama zamanlaması (Race A). **FIX (ikisi de additive, mevcut
  repo idiomlarını reuse):** (1) prod readiness sinyali — `AppShell`'e `data-shell-ready` (`useEffect`→
  `setShellReady(true)`; `Toast.tsx` `mounted` idiomu), `selectTab` bunu `waitFor({state:"attached"})`
  ile bekler (**`waitForTimeout`/retry-bump YOK**) → Race A kapanır, `selectTab` çağıran ~20 spec kazanır;
  (2) test — başarısız test mevcut `[data-skeleton]` count-0 settle'ı (Faz 1D.1 bloğu zaten aynı anchor
  için satır 153'te kullanıyor) benimser → Race B kapanır, prod kod değişmez. Doğrulama: hedefli spec
  ≥10× ardışık + tam e2e; imza ile ayrıştır (Race A=45s `subnav-tab-plan-firsatlar` / Race B=10s
  `opp-segment-all` + kalıcı `[data-skeleton]`).
- **G — entegrasyon envanteri** (`profile-integrations`/Sistem): Obsidian yerel/GitHub · Composio IG ·
  Meta business_discovery/engagement · OpenRouter · Tier-2 worker · X API. Her biri: capability /
  configured-authed / live-fixture-degraded-blocked / son başarı-hata / gereken kullanıcı aksiyonu /
  yazma kapsamı / ücret kapısı. **Phase 5A'da canlı provider write/ödeme YOK.** 5B güvenli aktivasyon
  sırası + credential + maliyet + rollback.

## 8. Sınıflandırma (rapor sözlüğü)

`production-contract-complete` · `live/provider-verified` · `fixture-verified` · `BLOCKED-EXTERNAL`
(credential/ödeme/izin) · `USER-ACTION` · `residual-risk`. Phase 5A hedefi: yukarıdaki 1-10 →
production-contract-complete + fixture/harness-verified; canlı dış kanallar BLOCKED-EXTERNAL kalır.
