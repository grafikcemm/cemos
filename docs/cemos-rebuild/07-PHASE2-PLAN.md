# 07 — Phase 2 Plan: Dilimler + Agent Envanteri

> **Kaynak:** Kullanıcı Phase 2A onayı (2026-07-16) + kod envanteri (bu belge). Phase 2 TEK pass değildir; aşağıdaki dilimlere bölünür. **Bu pass yalnız 2A'yı uygular.** 2B–2E implementasyona BAŞLANMAZ — yalnız turnkey harita bırakılır.

## 0. Dilim haritası

| Dilim | Kapsam | Durum |
|---|---|---|
| **2A** | Config-driven agent/skill registry + execution contract + kalıcı fırsat aktarımı (OpportunityHandoff) + trace/cost sözleşmesi | ✅ KAPANDI (7 commit: b300e84…8e251ac; ADR-027/028) |
| **2B** | Memory governance: MemoryEvidence ledger (distinct-source idempotency), insan-onaylı promotion (learned fact otomatik aktifleşmez — 3 kanıt = yalnız review-ready), deterministik feedback→memory sinyal köprüsü + reconciliation, performans dersleri ↔ identity ayrımı, kaynaklı "CemOS benim hakkımda ne biliyor?" read modeli + Profil Memory derinleşmesi, üretimde kullanılan MemoryFact influence provenance'ı | ✅ KAPANDI (12 commit: 6cd20c2…; ADR-029/030) |
| **2C** | Dinamik hesap kaynağı (ADR-016 kapanışı): persona/mode source-of-truth TS→DB | sonra |
| **2D** | Doğrudan thread segment üretimi + backfill + kalite eşik kalibrasyonu (ADR-010: typed alan Faz 1C'de eklendi; ÜRETİM hattı burada) | sonra |
| **2E** | Phase 2 eval/observability kapanışı: registry eval koşuları, canlı OpenRouter kürasyonu (kredi sonrası), operatorReadiness–todayReadiness birleşim kararı | sonra |

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

### 2C — Dinamik hesap kaynağı (ADR-016) — TURNKEY HARİTA (implementasyon YOK)
- **Kaynak gerçeği:** `src/lib/accounts.ts` — `AccountHandle = "grafikcem" | "maskulenkod"` literal union + `accountProfiles` (persona/concept/maxChars/mode'lar) hardcoded TS. `Account` Prisma modeli zaten var (handle/persona/concept/maxChars/platform) ama source-of-truth DEĞİL.
- **Literal-union tüketicileri (genişletme noktaları):** `growth-engine/account-adapter.ts` (`isKnownAccountHandle` — memory scope guard'ı BUNA dayanır!), `agents/registry/adapters.ts` (`assertHandle`), `pipelineService.runDailyForAccount(handle: AccountHandle)`, `council.deliberate(text, handle: AccountHandle)`, cron'lar (`accountList` iterasyonu), `feedback-service` (`FeedbackApiInputSchema.accountHandle` z.enum!), `signalBridge` (assertScope üzerinden), e2e ACCOUNT_ORDER.
- **İş sırası önerisi:** (1) `Account` tablosuna additive persona-profil kolonları (modesJson vb.) + seed; (2) `account-adapter`'ı DB-destekli async kaynak + in-process cache'e çevir (isKnownAccountHandle async'leşemez — senkron snapshot/bootstrap deseni gerekir: startup'ta yükle + değişimde invalidate); (3) z.enum → dinamik doğrulama; (4) UI'daki fallback literal listeleri kaldır.
- **Riskler:** memory scope guard'ı (`assertScope`) ve voice constitutions handle'a bağlı — dinamikleşirken fail-closed kalmalı (bilinmeyen handle YAZAMAZ); Zustand `activeChannel` literal tipi; e2e sabit handle varsayımları; yeni hesap eklerken constitution/DNA boş → grounding graceful boş kalmalı.


### 2D — Thread üretim hattı
- **Giriş noktaları:** `QueueItem.threadSegments` (typed alan Faz 1C'den beri var), `src/lib/ai/draft-pipeline.ts` (writer şeması thread üretmiyor), readiness thread segment doğrulaması (mevcut, fail-closed), segment editörü (DraftReviewCard).
- **İş:** writer şemasına thread çıkışı + mevcut thread taslaklarına backfill + kalite eşik kalibrasyonu (canlı queue verisiyle; ADR-023 §8E stale-eşik notu dahil).

### 2E — Eval/observability kapanışı
- **Giriş noktaları:** 2A registry eval fixtures, `src/lib/eval/` (Sprint 7 Eval V1 çekirdeği), CostsTab KPI şeridi, `opportunityCuration` + 2A curator adapter.
- **İş:** kredi geldiğinde curator adapter'ı canlıya alma (deterministik fallback korunur), registry eval koşularının cron'a bağlanması, operatorReadiness–todayReadiness birleşim kararı (ADR-026'da bilinçli ertelendi), kayıp-trace ölçümü dashboard'u.

## 4. 2A dışı YAPILMAYACAKLAR (bu pass)
Phase 2B–2E işleri, Phase 3 Reels/DNA/Meta, Phase 4 Obsidian/Learn otomasyonu, gerçek X API publish, canlı ücretli OpenRouter eval/kürasyonu, push, deploy.
