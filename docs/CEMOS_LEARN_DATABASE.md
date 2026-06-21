# CemOS Learn — Veritabanı

Prisma + Neon Postgres. Tamamı **additive** (mevcut ~35 model dokunulmadı). Global
model konvansiyonu (Yt/News deseni): `Account` relation YOK; JSON = `String` kolonu
(`safeJsonParse`/`safeJsonStringify`); id'ler `cuid()`. RLS yok (tek kullanıcı).

Migration: `npm run db:push` (migrate dosyası değil — repo deseni). Geri dönüş: modeller
yeni olduğu için `db push` ile düşürmek mevcut veriyi etkilemez.

## Modeller (9)

| Model | Amaç | Anahtar alanlar / kısıtlar |
|---|---|---|
| `LearnSource` | Eklenen kaynak (YouTube) | `userId?` (ileri-uyum), `externalId`, `status` (new/processing/ready/failed), `@@unique([kind, externalId])` → idempotent ekleme |
| `LearnTranscript` | Ham transkript | `sourceId @unique`, `segmentsJson` ([{startSec,endSec,text}]), `fullText`, `charCount`, `provider` (innertube/timedtext/manual) |
| `LearnChunk` | Zaman-kodlu chunk (grounding birimi) | `idx`, `startSec/endSec`, `sectionIdx`, `@@unique([sourceId, idx])` → idempotent re-chunk |
| `LearnPack` | Learning Pack | `summaryL1/L2/L3`, `notesJson`, `qaReportJson`, `masteryScore`, `status`, `@@unique([sourceId, pipelineVersion])` → **cache anahtarı** |
| `LearnConcept` | Kavram | `importance`, `groundingJson` ([{chunkIdx}]), `masteryScore` (review-driven) |
| `LearnItem` | Flashcard / quiz | `kind` (flashcard\|quiz_mcq), `optionsJson`, `correctIdx?`, `difficulty`, `groundingType`, `groundingJson` |
| `LearnReviewSchedule` | Tekrar zamanlaması | `ladderStep`, `intervalDays`, `ease`, `dueAt @index`, `lapses`, `itemId @unique` |
| `LearnReviewAttempt` | Tek deneme | `grade` (0..3), `correct`, `responseMs`, `@@index([itemId, reviewedAt])` |
| `LearnProcessingJob` | Resumable işleme job'ı | `currentStage`, `status`, `attempts`, `stageStateJson` (kısmi ilerleme), `heartbeatAt` (lease), `@@unique([sourceId, pipelineVersion])`, `@@index([status, currentStage])` |

## İlişkiler

```
LearnSource 1─1 LearnTranscript ─* LearnChunk
LearnSource 1─* LearnPack ─* LearnConcept ─* LearnItem
                          └─* LearnItem (conceptId opsiyonel)
LearnItem   1─1 LearnReviewSchedule
LearnItem   1─* LearnReviewAttempt
LearnSource 1─* LearnProcessingJob
```

## Yeniden kullanılan mevcut modeller (kopyalanmadı)
- `UsageLog` — maliyet (`meta.purpose:"learn_pack"`, `platform:"learn"`).
- `PipelineTrace` — aşama izleri (`platform:"learn"`, `subjectType:"learn_pack"`).

## Normalize vs JSON kararı
- **Satır:** bağımsız sorgulanan/zamanlananlar (chunk, concept, item, schedule, attempt).
- **JSON String:** birim okunan pack artefaktları (3-seviye özet, notlar, QA raporu).

## Retention
`learn` cron yalnız `status in (done, failed)` + eski `finishedAt` job'larını prune eder.
Pack/transcript/chunk **korunur** (user içeriği + cache).
