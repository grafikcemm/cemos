# 02 — Agent / Memory / Data Architecture

> Master promptun istediği rol/hafıza yapısını MEVCUT koda eşler. Kural: aynı işi yapan yeni agent yazma; eksik rolleri config-driven registry ile ekle. Faz 1 = eşleme + publish veri sözleşmesi; derin registry/governance Faz 2.

## 1. Agent rolleri → mevcut kod eşlemesi

Master promptun 12 rolü; her biri MEVCUT servise map edilir. "Yeni yazılacak" yalnız gerçekten eksikse.

| Rol | Mevcut karşılık | Durum |
|---|---|---|
| Cem Orchestrator | `pipelineService.runDailyForAccount` + `pipeline-runner.ts` (`createPipelineTrace`/`runStage`) | VAR — registry contract Faz 2 |
| Trend Scout | `discoveryService` + `news/pipeline.ts` + `externalSignals` + `repoRadar` | VAR |
| Account Strategist | `agents/router.ts` `routeItem()` (hesap-uyum skoru) | VAR |
| Content Creator | `ai/draft-pipeline.ts` writer (`cemos-writer`) çoklu-aday | VAR |
| Viral Editor | draft-pipeline final editor (`ENABLE_FINAL_EDITOR`) | VAR (flag) |
| Brand Guardian | `grounding.ts` BANNED_PHRASES + `scoreSignals` + readiness (Faz 1C) | VAR + genişler |
| Fact Checker | `verifyWebsite` + `WebsiteVerification` + doğrulama durumları | VAR (site); iddia fact-check Faz 2 |
| Originality Critic | `isNearDuplicate` (7g) + vector-memory | VAR |
| Competitor Analyst | `igCompetitorService` + `outlier.ts` | VAR |
| Reels Planner | `reels/dossier-generator.ts` + `plan-assembler.ts` | VAR |
| Performance Learner | `engagementLearningService` + `patternPromotionService` + learn cron | VAR |
| Knowledge Curator | `learning/*` (Learn pipeline) + `memoryFactService` | VAR |

**Council** (`agents/council.ts`, 4 lens: hook/persona/risk/novelty) = yüksek-değerli kalite kapısı müzakeresi; her küçük işte sınırsız agent döngüsü YOK (master prompt). Presetler `ai/presets.ts` (writer≠judge aile, `validatePresets` throws).

**Faz 2 registry contract (her agent/skill):** amaç+tetikleyici, izin-verilen tool/servis, typed input/output (Zod), model/preset+bütçe sınıfı, timeout/retry/fallback, okuyabildiği/yazabildiği hafıza, provenance+trace, unit/eval fixture. Config-driven; ana navda görünmez.

**External içerik çitleme:** `wrapUntrustedData`/`untrustedData.ts` — rakip post/web/transkript/NotebookLM asla agent talimatı değiştiremez (korunur).

## 2. Hafıza katmanları → mevcut model eşlemesi

| Katman | Mevcut | Eksik/Faz 2 |
|---|---|---|
| Kimlik | `constitutions.ts` (Tier-1 ses) + `MemoryFact` (identity) | "CemOS'un bildikleri" yüzeyi (Profil) |
| Hesap | `MemoryFact accountHandle` + `accounts.ts` | dinamik hesap kaynağı (ADR-016) |
| Stil | `CaptionDna`/`HashtagDna`/`VoiceProfile` + `dnaDistillService` | Seriler editör akışı (Faz 3) |
| Seri | `SeriesProfile` | Plan/Seriler UI |
| Episodik | vector-memory (positive/edited grupları) + `FeedbackEvent` | edit-diff sinyali derinleşme Faz 2 |
| Performans | `PublishedPost`→`PerformanceSnapshot`→lessonGate | Meta/engagement sync (Faz 3) |
| Bilgi | `Learn*` modelleri + Obsidian | Faz 4 UI |
| Negatif | vector-memory negative + `forbiddenPhrases` + BANNED | genişler |

**Governance (korunur):** external asla identity yazamaz (`assertIdentityWriteAllowed`); kimlik/stil değişiklikleri provenance+confidence+≥3-evidence+insan onayı; silme yerine supersede zinciri; `retrieval.ts` rerank. Faz 2: "Benim hakkımda ne biliyorsun?" kaynaklı+düzenlenebilir cevap; edit-diff/red/onay/performans ölçülebilir öğrenme sinyali.

## 3. Kalite motoru (readiness pipeline) — veri akışı

```
sinyal → dedup/cluster → account fit (router) → fırsat → çoklu-aday (writer) →
viral edit → brand guard → fact-check (site verify) → originality → final gate (judge) →
readiness (ready/needs_edit/blocked, fail-closed) → İNSAN ONAYI → publish attempt → performans öğrenmesi
```
Her adım typed I/O + timeout + retry + cost class + trace (mevcut `generateJsonGated` + `pipeline-runner`). Readiness = `readinessService.ts` (Faz 1C, pure), yayın anında `editedContent ?? content` üzerinde re-run.

## 4. Publish veri sözleşmesi (Faz 1E, bağlayıcı)

### 4a. `PublishAttempt` (additive model)
```prisma
model PublishAttempt {
  id, queueItemId, accountId,
  adapter                 // "intent" | "x_api"
  state                   // "prepared" | "succeeded" | "failed"
  idempotencyKey, contentHash,
  readinessPolicyVersion, readinessSnapshotJson,  // karar + kanıt snapshot'ı
  errorKind?, externalId?, createdAt, completedAt?
  @@unique([accountId, adapter, idempotencyKey])
  @@index([queueItemId]) @@index([state])
}
```

### 4b. Finalizasyon sözleşmesi
- Intent açmak = YALNIZ `PublishAttempt(prepared)`. PublishLog/PublishedPost YARATMAZ.
- Manuel "Paylaşıldı" onayı → **tek transaction**: QueueItem `manual_published` + PublishLog + PublishedPost.
- X API başarısı → **tek transaction**: QueueItem `published` + PublishAttempt `succeeded` + PublishLog + PublishedPost + `externalId`.
- Ağ çağrısı transaction DIŞINDA. API başarılı + DB düşerse: aynı `idempotencyKey`+`externalId` üzerinden reconciliation; **ikinci API postu YOK**.
- Duplicate önleme: `@@unique` + `contentHash`.
- Readiness yayın anında `editedContent ?? content` üzerinde re-run; snapshot attempt'te.

## 5. X API entegrasyonu (resmî araştırma, ADR-015)

**Verdict: REQUIRES-USER-PAYMENT-APPROVAL** (teknik FEASIBLE). Faz 1E adapter CONTRACT + intent fallback; gerçek `XApiPublishAdapter` yalnız kullanıcı maliyet onayı sonrası.

| Konu | Bulgu | Kaynak (erişim 2026-07-15) |
|---|---|---|
| Model | Pay-per-use; yeni geliştiriciye free tier YOK | [pricing](https://docs.x.com/x-api/getting-started/pricing) |
| Maliyet | $0.015/post, **link'li $0.20/post**, okuma $0.005/post. Senaryo (5-8 post/gün, 30 gün): %0 link **$2.25–3.60** · %50 link **$16.13–25.80** · %100 link **$30–48** aylık. + okuma maliyeti, media/metadata işlemleri (resmî tabloda ayrı kalem yok — açık), retry ihtimali; fiyatlar değişebilir → güncel fiyat Developer Console'dan doğrulanır | pricing + changelog |
| Auth | OAuth 2.0 Auth Code + PKCE; token 2s; refresh yalnız `offline.access`; rotation varsay | [OAuth2](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code) |
| Scope | `tweet.read tweet.write users.read offline.access` | [create-post](https://docs.x.com/x-api/posts/create-post) |
| Endpoint | `POST /2/tweets`; thread = `reply.in_reply_to_tweet_id` zinciri; media = v2 chunked upload | create-post + [media](https://docs.x.com/x-api/media/quickstart/media-upload-chunked) |
| Rate limit | 100/15dk-user, 10k/24s-app — bağlayıcı değil (5-8/gün) | [rate-limits](https://docs.x.com/x-api/fundamentals/rate-limits) |
| **Idempotency** | Sunucu-taraf YOK → **client-side dedup zorunlu** (`PublishAttempt.idempotencyKey`) | resmî negatif bulgu |
| Duplicate | Aynı içerik → 403 "duplicate content" (belgesiz pencere) | community |
| Hata | RFC 7807 + legacy `{errors:[{code}]}` — iki şekli de defensive parse | create-post |
| Eligibility | Developer hesap + App'in Project'e bağlı olması + kredi ön-yükleme + OAuth2 manuel açık | pricing + support |

**Adapter tasarımı (Faz 1E):** `IntentPublishAdapter` (prepared-işaretle + manuel köprü) + `XApiPublishAdapter` (stub → onay sonrası: PKCE token yönetimi + `/2/tweets` + chunked media + idempotencyKey dedup + 403-duplicate + RFC7807/legacy hata taksonomisi + rate-limit backoff). Blocker: **ödeme onayı**.

## 6. Güvenlik mimarisi (korunur + eklenir)

- Erişim kapısı (`proxy.ts`, ADR-013) — same-origin ≠ auth.
- `sameOriginGuard` (CSRF), `cronAuth` (fail-closed prod), `secretCrypto` (AES-256-GCM), `ssrfGuard` (metadata/private IP), `wrapUntrustedData` (prompt-injection) — hepsi korunur.
- Secret value asla loglanmaz/raporlanmaz — yalnız env isimleri.
- Reels evidence gate `computeReadiness` (PURE, kod-karar) + publish readiness (fail-closed) — iki "LLM değil kod karar verir" invariant'ı korunur.

## 7. Faz 2+ iskelet
- Faz 2: config-driven agent/skill registry (typed contract + eval fixture), memory governance + "CemOS'un bildikleri" derinleşmesi, edit-diff/red/onay/performans öğrenme sinyalleri, dinamik hesap kaynağı, thread üretim hattı (segment üretimi + backfill; `threadSegments` Faz 1C'de eklendi), X publish kalibrasyonu (onay sonrası), trace/cost gözlemlenebilirlik.
- Faz 3: Reels dossier/plan + DNA editör + Meta sync/fallback.
- Faz 4: İlham capture + yapısal analiz + Learn/Obsidian uçtan uca + ABSORBED ekran emekliliği.
