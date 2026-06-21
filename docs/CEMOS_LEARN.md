# CemOS Learn

Eğitici YouTube videolarını **kaynaklandırılmış kalıcı öğrenmeye** dönüştüren modül.
Pasif video tüketimi → grounded notlar/kavramlar → flashcard + quiz → aralıklı tekrar
(spaced repetition) → mastery ölçümü. CemOS içinde izole bir modül; ileride ayrı bir
uygulama olarak çıkarılabilecek şekilde tasarlandı.

> **Stack notu:** CemOS Supabase/RLS/n8n DEĞİL — Prisma+Neon, OpenRouter, Vercel cron,
> auth yok / tek kullanıcı. Modül bu gerçeğe göre kuruldu. Gerekçeler:
> `CEMOS_LEARN_DECISIONS_AND_RISKS.md`.

## Nasıl çalışır (değer zinciri)

```
YouTube URL → metadata → zaman-kodlu transkript → chunk'lar (grounding birimi)
   → içerik analizi (section map → global sentez, 3-seviye özet + iddialar)
   → kavramlar → flashcard + quiz → QA (grounding doğrulama) → tekrar programı
   → review oturumu → mastery → due date
```

Her önemli iddia bir transkript **chunkIdx**'ine bağlanır; QA kapısından geçmeyen pack
kullanıcıya "hazır" gösterilmez. Transkripti olmayan video grounded işlenmez
(sert dur + manuel transkript yapıştırma yolu).

## Kurulum

1. `.env.local`'a ekle (bkz. `CEMOS_LEARN_ENV.md`):
   ```
   LEARN_ENABLED=true
   NEXT_PUBLIC_LEARN_ENABLED=true
   LEARN_MONTHLY_BUDGET_USD=3
   ```
   (Mevcut `OPENROUTER_API_KEY` ve `DATABASE_URL` yeterli — yeni servis gerekmez.)
2. Şema: `npm run db:push` (additive 9 model; mevcut tablolar dokunulmaz).
3. `npm run dev` → sol menü **Öğren → CemOS Learn**.

`LEARN_ENABLED` false iken: route'lar `{code:"disabled"}` (404), cron sweep no-op,
nav'da sekme yok. Mevcut CemOS/News/YouTube/IG hiç etkilenmez (dark merge edilebilir).

## Mimari / klasör

```
src/lib/learning/
  learnConfig.ts        env okuyucular, LEARN_PURPOSE, PIPELINE_VERSION, STAGE_ROLES
  types.ts              her AI aşama çıktısı için Zod şeması (+ z.infer tipleri)
  learnService.ts       route façade: createSource / advance / job / pack / dashboard / sweep
  reviewService.ts      due seçimi + notlama + mastery
  scheduling/srs.ts     saf SRS matematiği (interval ladder + ease + mastery)
  prompts/index.ts      versiyonlu, grounding-katı prompt builder'ları
  pipeline/
    stages.ts           LearnStage sırası + nextStage + passthrough
    transcript-fetch.ts youtubei.js (zaman-kodlu) + timedtext fallback + URL parse
    chunk.ts            LLM'siz timestamp pencereleri + section gruplama
    run-llm.ts          trace.runStage + Zod safeParse + repair (openrouter'ın eksik kattı)
    stages-ai.ts        section/global/concepts/assessment LLM fonksiyonları
    qa.ts               deterministik grounding QA kapısı
    orchestrator.ts     resumable motor (advanceJob): lease + idempotent + map-reduce
  integrations/         (v2 stub) transfer adapter'ları

src/lib/db/learn*Repo.ts   Prisma repo'ları (source/transcript/pack/review/job)
src/app/api/learn/...      sources, jobs/[id], jobs/[id]/advance, packs/[id], review, review/attempt
src/components/tabs/LearnDashboardTab.tsx     giriş sekmesi (dashboard + view router)
src/components/learn/Learn{Processing,Pack,Review}View.tsx
```

## "Agent" mimarisi = traced pipeline stage

CemOS'ta `AGENT.md` dosyası yok; çok-adımlı AI işi **`createPipelineTrace`**
(`src/lib/agents/pipeline-runner.ts`) ile traced stage'lere bölünür. Learn aşamaları:

| Aşama | LLM? | Rol | Çıktı (Zod) |
|---|---|---|---|
| metadata / transcript / validate / chunk | hayır | — | deterministik |
| content_analysis (section map) | evet | cheapWriter | SectionAnalysis |
| content_analysis (global reduce) | evet | qualityJudge | GlobalSynthesis (3-seviye özet + claims) |
| concepts | evet | qualityJudge | ConceptsOutput |
| assessment | evet | creativeWriter | AssessmentOutput (flashcard+quiz) |
| qa | hayır | — | QaReport (deterministik) |
| review_schedule | hayır | — | schedule seed |
| notes / graph / tasks / integration_suggestions | passthrough (v2) | — | — |

Her LLM çağrısı `PipelineTrace`'e düşer (mevcut `PipelineTraceDrawer`'da görülür) ve
`UsageLog`'a `meta.purpose:"learn_pack"`, `platform:"learn"` olarak maliyet yazar.

### Yeni aşama / soru tipi / agent nasıl eklenir
- **Yeni LLM aşaması:** `types.ts`'e Zod şeması, `prompts/index.ts`'e builder,
  `stages-ai.ts`'e `runX` fonksiyonu, `stages.ts` sırasına stage adı, `orchestrator.ts`
  dispatch'ine case. `PIPELINE_VERSION`'ı bump et (cache invalidation).
- **Yeni soru tipi:** `types.ts` AssessmentSchema + `orchestrator` item mapping + UI render.

## Background processing (Vercel 2-cron + 300s)

İşleme **hibrit** ilerler:
- **Birincil (client):** Add-source job yaratır; Processing ekranı `POST .../advance`'ı
  döngüde çağırır (her çağrı ~45s deadline'a kadar aşama çalıştırır, canlı stepper).
- **Ağ (cron):** `src/app/api/cron/learn/route.ts` içine eklenen fail-open
  `learnService.sweepPendingJobs` adımı, client'ı kopmuş (bayat `heartbeatAt` lease'li)
  job'ları kalan bütçede ilerletir. **Yeni cron slotu tüketmez.**

**Idempotent + resumable:** `advanceJob` sadece `nextStage()`'i çalıştırıp atomik yazar;
chunk/pack/concept/item replace-key'li; content_analysis section'ları `stageStateJson`'a
kısmi yazılır → uzun video birkaç advance'e yayılır, 300s'i aşmaz. Bir aşama patlarsa
`attempts++` (cap 3 → `failed`, `currentStage` korunur); tüm job baştan başlamaz.
`failed` job'a tekrar advance = manuel "bu adımdan devam et" (sayaç sıfırlanır).

## Operasyon

- **Pipeline retry:** UI Processing ekranı "bu adımdan devam et"; ya da `learn` cron sweep.
- **Hata sınıfları:** `BudgetExceededError` → 429 (bütçe yenilenince devam),
  `TranscriptUnavailableError` → 422 (manuel transkript yolu), stage hatası → sınırlı retry.
- **Loglama:** job/trace id, stage, model, cost, validation; transkriptin tamamı veya
  secret loglanmaz.
- **Cache:** `LearnPack @@unique([sourceId, pipelineVersion])` → aynı video+versiyon
  yeniden işlenmez (spend yok). Yeniden üretim için `PIPELINE_VERSION` bump.
- **Retention:** `learn` cron yalnız TAMAMLANMIŞ/başarısız job'ları (≈90 gün) prune eder;
  pack/transcript/chunk korunur.
- **RLS yok:** tek kullanıcı; `LearnSource.userId` ileri-uyum kolonu (auth gelince backfill).

## Test

```
npx vitest run src/lib/learning/scheduling/srs.test.ts \
               src/lib/learning/pipeline/qa.test.ts \
               src/lib/learning/pipeline/pipeline.test.ts --pool=threads
```
> Not: bu ortamda vitest fork-pool'u `spawn UNKNOWN` verebilir; `--pool=threads` kullan.
Kapsam: SRS ladder/ease/mastery, QA grounding/verdict, chunking/timestamp, stage sırası.
Detay: `CEMOS_LEARN_TESTING.md`.

## İlişkili belgeler
- `CEMOS_LEARN_ENV.md` — environment değişkenleri
- `CEMOS_LEARN_DATABASE.md` — Prisma modelleri + ilişkiler
- `CEMOS_LEARN_DECISIONS_AND_RISKS.md` — mimari kararlar + risk register
- `CEMOS_LEARN_FUTURE_ROADMAP.md` — v2 kapsamı (graph/notlar/görevler/transfer)
- `CEMOS_LEARN_TESTING.md` — test planı + manuel QA checklist
