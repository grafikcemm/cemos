# CemOS V2 — Implementation Handoff

> **Amaç:** Sıfır konuşma bağlamıyla taze bir oturum/agent bu dokümandan Sprint 1'i uygulayabilsin.
> **Bağlayıcı spec'ler:** [FIRST-SPRINT.md](./FIRST-SPRINT.md) (kapsam sözleşmesi) · [FINAL-OPENROUTER-ROUTING.md](./FINAL-OPENROUTER-ROUTING.md) · [FINAL-UX-SPEC.md](./FINAL-UX-SPEC.md) · [FINAL-EVALUATION-SPEC.md](./FINAL-EVALUATION-SPEC.md) · [RESEARCH-SYNTHESIS.md](./RESEARCH-SYNTHESIS.md) (kilitli kararlar) · [research/_repo-baseline.md](./research/_repo-baseline.md) (repo gerçeği).
> Tarih: 2026-07-08.

---

## 1. İlk uygulanacak iş

**Sprint 1 — "Bugün + Tek Motor"** (FIRST-SPRINT.md'nin 20 maddesi). İlk inen parça: **`src/lib/ai/presets.ts`** (madde 11) — diğer her şeyin contract'ı.

## 2. Worktree

```
git worktree add ../cemos-sprint1 -b feature/sprint1-bugun-tek-motor
```
Base: `master` (önce `fix/audit-p1-stability` merge durumunu kontrol et — deploy edilmemiş P1 fix'leri içeriyor; sprint onun ÜZERİNE oturmalı, çakışıyorsa önce o branch merge edilir).

## 3. Gerekli dosyalar (dokunulacaklar)

| Alan | Dosyalar |
|---|---|
| Preset katmanı | **YENİ** `src/lib/ai/presets.ts` · `src/lib/ai/model-config.ts` (default map) · `src/lib/ai/generateGated.ts` (`preset` alanı) · `src/lib/ai/openrouter.ts` (`provider` bloğu + `json_schema` + `cache_control`) |
| Motor birleştirme | `src/lib/services/draftService.ts` · `src/lib/ai/draft-pipeline.ts` · `src/lib/growth-engine/scorer.ts` + `leak-detector.ts` (adapter; `accounts.ts`'e bağlanır) · `src/lib/services/qualityLintService.ts` (TR lint) · `src/lib/accounts.ts` (yalnız okunur — tek kimlik kaynağı) |
| Bugün UI | `src/components/tabs/MorningDashboardTab.tsx` · `src/components/morning/*` (ReviewQueue, DraftReviewCard, MorningHeroStats→sayaç, OperatorReadinessGate) · feed/kütüphane tab'lerine error bloğu |
| Sinyaller | `src/lib/growth-engine/vector-memory.ts` (`:304` fix) · `src/lib/growth-engine/feedback-service.ts` (edit-distance) · `src/lib/ai/prompts.ts` + `grounding.ts` (VoiceProfile bağlama) |
| Plumbing | `src/app/api/cron/generate-morning/route.ts` (idempotency) · `vercel.json` (03:00 UTC) · `package.json` (`typecheck`) · startup assertion (ör. `src/lib/config/` altına) |
| Eval | `scripts/run-eval-tests.ts` + `EvalTest` seed script'i |

## 4. Korunacak mevcut özellikler (regresyon yasak)

- Edit-gate (Publish, operatör düzenlemeden kapalı) — kaldırılamaz.
- `daily-queue` tam ekranı ve TÜM aksiyonları (feedback tipleri, rescore, schedule, kanban) — Sprint 1'de nav'da kalır.
- News/YouTube/Learn pipeline davranışları byte-eşdeğer (yalnız gate sarmalaması eklenir).
- Mevcut ~994 Vitest + 2 Playwright spec yeşil kalır.
- **Immutable semboller:** `useXAgentStore`/`useCemOsStore` · `"xagent-store"` · `XAgentApp.tsx` · `src/store/xagent.ts` · HTTP User-Agent kimlikleri · `cemos-ui-collapsed`. Rename = kullanıcı state kaybı.
- Manual-publish invariant: hiçbir write API/scope eklenemez.
- Additive-only DB (Sprint 1'de zaten migration yok).

## 5. Shared contract'lar (önce bunlar iner)

1. **`PresetConfig` + `PRESETS` + `resolvePreset`** — FINAL-OPENROUTER-ROUTING §2 tablosu birebir (C3: final-judge primary `openai/gpt-5.5-20260423`).
2. **`QueueItem.scores` alt-sinyal sözlüğü** — anahtar adları: `personaMatch, hookStrength, clarity, turkishNaturalness, novelty, risk, sourceFaithfulness, payoff, leaks[]` (FINAL-EVALUATION-SPEC §2 ile uyumlu; V1'de 14'lü sete genişler).
3. **Purpose-prefix enum'u** — `writer_ judge_ extract_ prefilter_ research_ audit_ memory_ strategy_ image_ reel_ ig_ yt_ learn_ series_ news_`.
4. **Leak-gate durum geçişi** — yüksek şiddet → `status:"needs_edit"` + Türkçe `lintReport` notu.

## 6. Migration planı

DB: **yok** (Sprint 1 sıfır migration — skorlar mevcut `scores` JSON kolonuna).
Kod migration'ı (dalga 1): writer → judge → news-extract çağrıları `generateJsonGated({preset})`'e; her taşımada `wrapUntrustedData` çiti korunur; modül vitest'i taşıma başına koşulur. Kalan çağrılar Sprint 2 (dokunma).

## 7. Test planı

1. Yeni unit testler: FIRST-SPRINT §6 listesi (alt-sinyal sınırları, leak yönlendirme, lint seed'leri, adapter, idempotency, edit-distance, preset lint, aile testi, fence kapsamı).
2. `npm test` (994+ yeşil) → `npm run typecheck` (yeni) → `npm run lint` → `npm run build` → `npm run test:e2e`.
3. `npm run eval:run -- --all` golden set yeşil.
4. Browser doğrulaması: `run-local` ile dev server → Bugün akışı elle + Playwright (320/1440).
5. Maliyet: bir günlük simülasyon fixture'ı ≤ normal zarf (~$0.35/gün) assert'ü.

## 8. Definition of Done

FIRST-SPRINT §5'teki 15 kabul maddesinin TAMAMI + demo senaryosu (§8) kayıtla oynatılır + `git status` yalnız beklenen dosyaları gösterir + hiçbir immutable sembol diff'te görünmez (grep guard) + handoff notu (`docs/handoffs/`) yazılır.

---

## 9. Builder agent promptu (kopyala-yapıştır)

```
Sen CemOS repo'sunda (branch feature/sprint1-bugun-tek-motor, worktree ../cemos-sprint1) Sprint 1'i uygulayan Builder'sın.

ÖNCE OKU (sırayla, tamamını):
1. docs/cemos-v2-planning/IMPLEMENTATION-HANDOFF.md  (bu doküman — dosya listesi + contract'lar)
2. docs/cemos-v2-planning/FIRST-SPRINT.md            (20 maddelik kapsam sözleşmesi — DIŞINA ÇIKMA)
3. docs/cemos-v2-planning/FINAL-OPENROUTER-ROUTING.md §1-2 (pinned slug'lar + 9 preset)
4. docs/cemos-v2-planning/research/_repo-baseline.md (repo gerçeği)
Next.js 16 — eski Next bilgine güvenme; gerekirse node_modules/next/dist/docs/ oku.

UYGULAMA SIRASI:
A) src/lib/ai/presets.ts + resolvePreset + generateJsonGated({preset}) + startup lint + writer≠judge registry testi
B) model-config.ts pinned slug map'i
C) Dalga-1 gate migration (writer/judge/news-extract) + Anthropic cache_control
D) Motor birleştirme: scorer+leak-detector adapter→accounts.ts; alt-sinyaller QueueItem.scores'a; leak gate→needs_edit; TR lint
E) Bugün reorder (FINAL-UX-SPEC §2 wireframe'i birebir) + error-state'ler
F) Sinyal kabloları: vector-memory.ts:304 fix, edit-distance, FeedbackEvent wire-in, VoiceProfile bağlama
G) Plumbing: idempotency key, secret assertion, typecheck script, cron 03:00 UTC, eval golden seed

KURALLAR:
- FIRST-SPRINT "Out of scope" listesindeki HİÇBİR şeyi yapma. Yeni fikir → docs/cemos-v2-planning/later.md'ye not düş.
- Immutable semboller (handoff §4) asla rename edilmez. DB migration yok. Manual-publish invariant korunur.
- Her taşınan LLM çağrısında wrapUntrustedData çiti korunur.
- Küçük, geri alınabilir commit'ler; conventional commits (feat/fix/refactor); her mantıksal adımda modül testleri koş.
- TDD: davranış değiştiren her madde için önce test (RED) sonra implementasyon (GREEN).
- Bitti demeden: npm test && npm run typecheck && npm run lint && npm run build && npm run eval:run -- --all hepsi yeşil.
- Rapor: yapılan/yapılamayan/test edilemeyen açıkça; hata çıktıları verbatim.
```

## 10. Reviewer agent promptu (temiz context'te)

```
Sen CemOS Sprint 1 diff'inin bağımsız Reviewer'ısın (Builder'ın context'i sende YOK — temiz oturum).

OKU: docs/cemos-v2-planning/FIRST-SPRINT.md (kapsam) + IMPLEMENTATION-HANDOFF.md §4-5 (korunacaklar + contract'lar).
İNCELE: git diff master...feature/sprint1-bugun-tek-motor

KONTROL LİSTESİ (öncelik sırasıyla):
1. GÜVENLİK: hardcoded sır yok; yeni açık route yok; wrapUntrustedData çitleri taşınan her çağrıda duruyor; hiçbir write/publish API eklenmemiş; secret assertion değer loglamıyor.
2. KAPSAM: FIRST-SPRINT dışı özellik/refactor sızmış mı? (out-of-scope diff = BLOCK)
3. IMMUTABLE: useXAgentStore/"xagent-store"/XAgentApp.tsx/xagent.ts/User-Agent diff'te rename/move edilmiş mi? (= CRITICAL BLOCK)
4. CONTRACT: presets tablosu FINAL-OPENROUTER-ROUTING §2 ile birebir mi (özellikle final-judge=gpt-5.5, C3)? scores anahtar adları handoff §5.2 ile aynı mı?
5. DAVRANIŞ: edit-gate duruyor mu; leak gate needs_edit'e yönlendiriyor mu (silmiyor); news/YT davranışı gate-sarmalama dışında değişmemiş mi?
6. KALİTE: raw generateJson dalga-1 yollarında kalmış mı; her gated çağrı purpose taşıyor mu; testler gerçekten davranış test ediyor mu (snapshot şişirmesi değil)?
7. HATA YÖNETİMİ: yeni error-state'ler gerçek retry içeriyor mu; silent catch eklenmiş mi?
Çıktı: CRITICAL/HIGH/MEDIUM/LOW bulgular, dosya:satır referanslı. CRITICAL veya HIGH varsa merge BLOCK.
```

## 11. Verifier agent promptu (temiz context'te)

```
Sen CemOS Sprint 1'in bağımsız Verifier'ısın. Kod DÜZELTMEZSİN — yalnız doğrular ve kanıtla raporlarsın.

OKU: docs/cemos-v2-planning/FIRST-SPRINT.md §5 (15 kabul maddesi) + §8 (demo senaryosu).

ÇALIŞTIR (worktree ../cemos-sprint1):
1. npm test → tam çıktı; 994+ yeşil mi + yeni testler var mı?
2. npm run typecheck && npm run lint && npm run build → temiz mi?
3. npm run eval:run -- --all → golden set sonuçları
4. Dev server başlat (npm run dev, port çakışmasında port değiştir) → Playwright/browser ile:
   a. Bugün açılışı: sayaç + tek-tik readiness + fold-üstü kuyruk görünüyor mu? Ekran görüntüsü al.
   b. Bir taslakta ayrışık skor çubukları + leak notu render oluyor mu? Tek başına "viral %X" görünüyor mu (görünmemeli)?
   c. Inline edit → Kopyala akışı ≤2 adım mı? Kuyruk bitince "Bugünlük bitti ✓"?
   d. 320px genişlikte overflow var mı?
   e. Bir feed ekranında API'yi bilinçli boz (dev) → error bloğu mu, boş durum mu?
5. Idempotency: /api/cron/generate-morning'i aynı parametrelerle 2 kez çağır (CRON_SECRET ile) → ikinci çağrıda yeni QueueItem/UsageLog satırı var mı? (olmamalı)
6. grep kontrolleri: growth-engine/account-profiles import'u draft yolunda; immutable sembol diff'i; dalga-1 dosyalarında raw generateJson.

RAPOR: kabul maddesi başına PASS/FAIL + kanıt (çıktı/ekran görüntüsü). Çalıştıramadığın şeyi 'DOĞRULANAMADI + neden' olarak yaz — asla geçti varsayma.
```
