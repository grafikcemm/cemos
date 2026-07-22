# 07 — Phase 2 Plan: Dilimler + Agent Envanteri

> **Kaynak:** Kullanıcı Phase 2A onayı (2026-07-16) + kod envanteri (bu belge). Phase 2 TEK pass değildir; aşağıdaki dilimlere bölünür. **Bu pass yalnız 2A'yı uygular.** 2B–2E implementasyona BAŞLANMAZ — yalnız turnkey harita bırakılır.

## 0. Dilim haritası

| Dilim | Kapsam | Durum |
|---|---|---|
| **2A** | Config-driven agent/skill registry + execution contract + kalıcı fırsat aktarımı (OpportunityHandoff) + trace/cost sözleşmesi | ✅ KAPANDI (7 commit: b300e84…8e251ac; ADR-027/028) |
| **2B** | Memory governance: MemoryEvidence ledger (distinct-source idempotency), insan-onaylı promotion (learned fact otomatik aktifleşmez — 3 kanıt = yalnız review-ready), deterministik feedback→memory sinyal köprüsü + reconciliation, performans dersleri ↔ identity ayrımı, kaynaklı "CemOS benim hakkımda ne biliyor?" read modeli + Profil Memory derinleşmesi, üretimde kullanılan MemoryFact influence provenance'ı | ✅ KAPANDI (11 commit: 6cd20c2…d0d5e32; ADR-029/030) |
| **2C** | Dinamik hesap kaynağı (ADR-016 kapanışı): persona/mode source-of-truth TS→DB + Composio Instagram read-only köprüsü | ✅ KAPANDI (10 commit: df7ff5d…; ADR-031/032; canlı Composio smoke BLOCKED-EXTERNAL — consumer key yok) |
| **2D** | Doğrudan thread segment üretimi + backfill + kalite eşik kalibrasyonu (ADR-010: typed alan Faz 1C'de eklendi; ÜRETİM hattı burada) | ✅ KAPANDI — production contract complete + backfill applied (12); **calibration insufficient_sample/provisional** (ADR-033; canlı model çıktısı test edilmedi — 2E) |
| **2E** | Phase 2 eval/observability kapanışı: registry eval koşuları, canlı OpenRouter kürasyonu (kredi sonrası), operatorReadiness–todayReadiness birleşim kararı | ✅ PRODUCTION CONTRACT COMPLETE / **LIVE BLOCKED-EXTERNAL** (ADR-034; canlı bölüm OPENROUTER_KEY_ROTATED_AT + spend onayları bekliyor) |

## 1. Agent envanteri — 12 rol → mevcut kod (2A-A, kod taramasıyla doğrulandı 2026-07-16)

Kural: aynı işi yapan yeni agent YAZILMAZ; mevcut servise adapter yazılır. **Hiçbir rol EKSİK çıkmadı.**

| # | Rol | Sınıf | Mevcut implementasyon | Mod |
|---|---|---|---|---|
| 1 | Cem Orchestrator | ADAPTER | `pipelineService.runDailyForAccount` (discovery→mining→draft zinciri) | deterministic (alt-adımlar LLM) |
| 2 | Trend Scout | KISMEN → adapter-compose | `discoveryService.discoverForAccount` + `trend-aggregator.aggregateTrends` + `opportunityCuration` (façade yok — adapter üçünü birleştirir) | hybrid |
| 3 | Account Strategist | MEVCUT/ADAPTER | `agents/router.routeItem` + `account-adapter.getScoringIdentity` + `constitutions` | llm (cheapWriter; `cemos-strategist` aday) |
| 4 | Content Creator | MEVCUT | `ai/draft-pipeline.runDraftPipeline` (birincil) · `growth-engine/draft-generator` (varyant) | llm (`cemos-writer`) |
| 5 | Viral Editor | MEVCUT/ADAPTER | draft-pipeline Phase 2 judge + `draft-critic.critiqueDraft` + `scorer.scoreDraft(Fallback)` | hybrid (`cemos-final-judge`) |
| 6 | Brand Guardian | MEVCUT | `agents/council.deliberate` (persona/risk lensleri) + `readinessService.assessReadiness` (deterministik veto) | hybrid |
| 7 | Fact Checker | KISMEN → adapter-compose | `verifyWebsite` + reels `computeReadiness` (kod-karar) + `learning/pipeline/qa` + readiness claim-gate (genel iddia-doğrulayıcı façade yok) | hybrid |
| 8 | Originality Critic | MEVCUT | council novelty lens + `scorer.calculateNoveltyScore` + `textSimilarity.isNearDuplicate` + vector-memory cosine | deterministic-öncelikli |
| 9 | Competitor Analyst | MEVCUT | `igCompetitorService.syncIgCompetitors` + `youtube/outlier` (aynı outlier matematiği, LLM-siz) | deterministic |
| 10 | Reels Planner | MEVCUT | `reels/dossier-generator.reelDossierFor` (traced council) + `plan-assembler.assembleMonthlyPlan` (saf) | hybrid |
| 11 | Performance Learner | MEVCUT | `engagementLearningService.syncForAccount/syncInstagram` + `feedback-service.processFeedback` + vector-memory | deterministic (AI skoru opsiyonel) |
| 12 | Knowledge Curator | MEVCUT | `learning/pipeline/orchestrator.advanceJob` + `memoryFactService` (assertIdentityWriteAllowed) + `consolidation` + `dnaDistillService` | hybrid (`cemos-memory`) |

**Registry şablonu olarak kopyalanacak mevcut desenler:** `pipeline-runner.ts` (`createPipelineTrace`/`runStage`) + `council-config.ts` (deklaratif subagent-as-data spec). Reel dossier + learn orchestrator referans tüketiciler.

**Çekirdek invariant'lar (2A bunları KORUR):**
- Tüm ücretli çağrılar `generateJsonGated` üzerinden: `assertGenerationAllowed` harcamadan ÖNCE throw (`BudgetExceededError`, reason: monthly_limit/pacing/class_limit/evaluation_disabled/provider_key_limit); TEK UsageLog'u gated primitive yazar — çağıran ASLA ikinci kez yazmaz.
- `wrapUntrustedData` + `UNTRUSTED_DATA_NOTICE`: dış metin (haber başlığı/caption/transcript/topicSeed) LLM'e çitlenmeden gitmez.
- `assertIdentityWriteAllowed`: external provenance identity memory YAZAMAZ (`MemoryProvenanceError`).
- PipelineTrace stage şekli: `{stage, role, model, ok, failOpenUsed, ms, costUsd, score?}` — 2A additive alan ekler, eskiyi okumaya devam eder.

## 2. 2A kapsamı (bu pass)

1. **Registry** (`src/lib/agents/registry/`): deklaratif metadata (12 rol) + server-side adapter map ayrımı; Zod input/output; capability allowlist; fail-fast doğrulama; ana nav'da GÖRÜNMEZ.
2. **Executor**: çöz → input Zod → capability/memory izin → bütçe/blocked-external → adapter → output Zod → trace → cost sahipliği → typed sonuç (succeeded/deterministic_fallback/blocked_external/failed_validation/failed_execution/timed_out).
3. **Trace/cost**: PipelineTrace stage'ine additive agent metadata (agentId/agentVersion/adapterId/executionMode/preset/outcome/fallbackUsed/blockedReason/latencyMs/retryCount/estimatedCostUsd/schemaVersion/policyVersion); PipelineTraceDrawer eski kayıtlarla çalışmaya devam eder, yeni alanları sessizce gösterir. Yeni tablo YOK.
4. **OpportunityHandoff**: typed domain contract + additive model (karar gerekçesi ADR-028); üç eylem (generate/plan/series) gerçek persisted handoff olur; reload-persist; idempotent consume; blocked-external dürüst.
5. **Opportunity Curator adapter**: typed sözleşme + fixture eval; deterministik `opportunityCuration` fallback olarak KORUNUR; canlı OpenRouter çağrısı YOK (2E'de kredi sonrası aktive edilir).

## 3. 2B–2E turnkey haritası (implementasyon YOK — keşfedilmiş dosya/servis haritası)

### 2B — Memory governance + öğrenme sinyalleri ✅ UYGULANDI (ADR-029/030)
- Teslim: `MemoryEvidence` defteri + `canonicalKey` (migration `20260716120000`), insan-onaylı promotion (otomatik aktifleşme kaldırıldı; 3 kanıt = yalnız review-ready; Sahiplen=operator_assertion), atomik approve/rollback/revise, `signalBridge.ts` (deterministik tag→canonical kural + verbatim reason + mekanik-neden filtresi + haftalık reconciliation, yeni cron yok), `knowledgeReadModel.ts` + `GET /api/memory/knowledge`, influence provenance (`scores.groundingMemoryFactIds`), ProfileMemoryTab kaynaklı görünüm. Performans dersleri (validated ViralPattern) identity'den ayrı bölümde.

### 2C — Dinamik hesap kaynağı + Composio Instagram köprüsü ✅ UYGULANDI (ADR-031/032)
- Teslim: Account additive profil kolonları + `AccountPlatformBinding` (migration `20260716210000`, Neon'da) + seed backfill; `profileRepository` (Zod `RuntimeAccountProfile`, fail-closed `isKnownAccountHandleDb`/üretim-hazırlık kapısı/`resolveCronHandles`); trust boundary'ler DB-otoriteli (memory scope, feedback, registry, route doğrulamaları, cron listeleri); üretim girişleri DB profili yükler; bootstrap TS profili seed/fixture/işaretli-fallback'e indirildi; Sidebar switcher DB listesinden. Composio: server-only MCP client (`connect.composio.dev/mcp`, JSON-RPC+SSE, retry/timeout/2MB tavan/redaction) + çift-katman read-only allowlist + discovery fail-closed; `InstagramReadProvider` soyutlaması (Composio birincil + Meta fallback İŞARETLİ; explicit modda sessiz fallback yok); `syncInstagramViaBridge` idempotent own-account sync (IgMedia/IgComment/IgInsightSnapshot/ContentItem köprüsü) daily cron aşaması + manuel `POST /api/instagram/sync`; Entegrasyonlar UI durumları. Rakip business_discovery ÇÖZÜLMEDİ (Meta izni blocker). CANLI smoke BLOCKED-EXTERNAL: `COMPOSIO_CONSUMER_API_KEY` yok.

#### (arşiv) 2C turnkey haritası (uygulandı)
- **Kaynak gerçeği:** `src/lib/accounts.ts` — `AccountHandle = "grafikcem" | "maskulenkod"` literal union + `accountProfiles` (persona/concept/maxChars/mode'lar) hardcoded TS. `Account` Prisma modeli zaten var (handle/persona/concept/maxChars/platform) ama source-of-truth DEĞİL.
- **Literal-union tüketicileri (genişletme noktaları):** `growth-engine/account-adapter.ts` (`isKnownAccountHandle` — memory scope guard'ı BUNA dayanır!), `agents/registry/adapters.ts` (`assertHandle`), `pipelineService.runDailyForAccount(handle: AccountHandle)`, `council.deliberate(text, handle: AccountHandle)`, cron'lar (`accountList` iterasyonu), `feedback-service` (`FeedbackApiInputSchema.accountHandle` z.enum!), `signalBridge` (assertScope üzerinden), e2e ACCOUNT_ORDER.
- **İş sırası önerisi:** (1) `Account` tablosuna additive persona-profil kolonları (modesJson vb.) + seed; (2) `account-adapter`'ı DB-destekli async kaynak + in-process cache'e çevir (isKnownAccountHandle async'leşemez — senkron snapshot/bootstrap deseni gerekir: startup'ta yükle + değişimde invalidate); (3) z.enum → dinamik doğrulama; (4) UI'daki fallback literal listeleri kaldır.
- **Riskler:** memory scope guard'ı (`assertScope`) ve voice constitutions handle'a bağlı — dinamikleşirken fail-closed kalmalı (bilinmeyen handle YAZAMAZ); Zustand `activeChannel` literal tipi; e2e sabit handle varsayımları; yeni hesap eklerken constitution/DNA boş → grounding graceful boş kalmalı.


### 2D — Thread üretim hattı ✅ UYGULANDI (ADR-033)
- Teslim: canonical thread sözleşmesi (`threadSegments` = publication authority; `effectiveThreadSegmentLimit=min(280,maxChars)` tek primitive; `isThreadDraft` mode-farkındalı), writer strict schema + typed `threadSegments` + format niyeti (thread/tweet/auto; sahte mock/tek-segment thread yasak), judge `sourceDraftIndex` provenance (canonical içerik writer'dan; fast/deadline/empty yolları segment korur), final editor thread'de `skipped:thread_segment_contract`, tek-create THREAD persistence + telemetry, entry-point parity (Source.mode/suggestedFormat=thread → gerçek thread isteği; handoff explicit-TWEET kilidi), readiness policy **1.1.0-provisional** (segment-bazlı, stale-content bypass kapalı, bilinmeyen hesap grafikcem'e düşmez), atomik segment+editedContent PATCH, dürüst ilk-segment intent + segment-hash (`content_changed`/stale) + `UsageLog.tweetCount=segmentCount`, schedule/approve thread parity, deterministik backfill (Neon: 12 applied + 1 dürüst untouched; ikinci dry-run 0 = idempotent).
- **Dürüst kalanlar:** skor eşik kalibrasyonu `insufficient_sample` → PROVISIONAL (kriter: ≥10 pozitif + ≥10 negatif judged etiketli thread); canlı ücretli model thread çıktısı TEST EDİLMEDİ (2E); X API gerçek multi-post publish yok (Faz 1E blocker sözleşmesi).

### 2E — Eval/observability kapanışı — ✅ PRODUCTION CONTRACT COMPLETE / LIVE BLOCKED-EXTERNAL (ADR-034, 2026-07-17)
- Kalıcı EvalRun/EvalCaseResult geçmişi (migration `20260717100000`, Neon'da, idempotent) — EvalTest overwrite'ı artık tek audit kaynağı değil.
- Hermetic registry contract runner + fixture contract katmanı + CLI; ilk gerçek koşu 16/16 PASS $0 (mode=deterministic etiketi — "canlı doğrulandı" iddiası YOK).
- Golden runner modernize: hardcoded hesap yok (DB runtime profile), canlı generate yalnız --live+kapılar (aksi BLOCKED), thread_contract deterministik golden vakaları (4/4 PASS).
- Curator production wiring: POST /api/opportunities/curate (executor üzerinden), çift kapı (ENABLE_AGENT_CURATION + rotasyon marker), dürüst method etiketi + client fallback + gerçek-başarı rozeti.
- Canonical OperatorActionReadiness: gate tek health fetch'inden; 15sn polling + duplicate sorgular + eski GET endpoint KALKTI; çelişkili status imkânsız.
- Trace: executor traceStatus + "gözlenen trace kapsaması" (process-local sayaç global KPI DEĞİL — dürüst sınırlama dokümante).
- Cron: haftalık Pazartesi deterministik eval learn slotunda (yeni cron yok, idempotent, fail-open); canlı eval cron'dan default ÇALIŞMAZ.
- UI: Sistem "Agent değerlendirmeleri" + Costs evaluation bütçe/harcama/kürasyon ayrımı.
- **Dürüst kalanlar:** canlı curator/thread/golden-generate smoke BLOCKED-EXTERNAL (rotasyon + spend env'leri); thread eşik kalibrasyonu hâlâ insufficient_sample/PROVISIONAL; Composio IG canlı smoke env bekliyor; Phase 2 "tam canlı doğrulanmış" İLAN EDİLMEDİ.

## 4. 2A dışı YAPILMAYACAKLAR (bu pass)
Phase 2B–2E işleri, Phase 3 Reels/DNA/Meta, Phase 4 Obsidian/Learn otomasyonu, gerçek X API publish, canlı ücretli OpenRouter eval/kürasyonu, push, deploy.
