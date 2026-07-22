# CemOS Learn — Test

## Otomatik testler

```
npx vitest run \
  src/lib/learning/scheduling/srs.test.ts \
  src/lib/learning/pipeline/qa.test.ts \
  src/lib/learning/pipeline/pipeline.test.ts \
  --pool=threads
```

> **Önemli:** Bu sandbox'ta vitest varsayılan fork-pool'u `spawn UNKNOWN` (errno -4094)
> verebilir — kod hatası DEĞİL, ortam kısıtı. `--pool=threads` (worker_threads) ile koş.

Kapsam (24 test):
- **srs.test.ts** — ladder ilerleme, again→reset+lapse, hard/easy ease, ease clamp,
  son adımda durma, `computeDueAt` deterministik, mastery (boş/tam/yanlış), pack rollup.
- **qa.test.ts** — coverage hesabı, geçersiz chunkIdx flag (halüsinasyon çapası),
  fail eşiği, item-temelli fallback, verdict→status.
- **pipeline.test.ts** — chunk pencereleme + timestamp koruma + section gruplama,
  `formatTimestamp`, stage sırası + passthrough + monotonik progress.

Tüm proje tip kontrolü: `npx tsc --noEmit` → **0 hata**.

## Manuel QA checklist (uçtan uca)
1. `LEARN_ENABLED=false` → Öğren'de sekme yok, `/api/learn/*` 404 `disabled`,
   mevcut CemOS/News/YouTube/IG çalışır.
2. `LEARN_ENABLED=true` + `db:push` → geçerli transkriptli URL ekle → stepper ilerler →
   `ready` pack: 3-seviye özet + kavram + flashcard + quiz, her iddiada timestamp chip.
3. Geçersiz URL → "Geçerli YouTube URL" hatası.
4. Transkripti olmayan video → `validate`'te durur, manuel yapıştırma yolu çalışır.
5. Aynı URL ikinci kez → yeni pack üretilmez (cache hit, spend yok).
6. Advance ortasında sekmeyi kapat → `learn` cron sweep ya da tekrar advance kaldığı yerden
   devam (idempotent).
7. Review: flashcard/quiz cevapla → attempt kaydı, concept+pack mastery + due date güncellenir;
   zayıf kavram daha sık gelir.
8. Bütçe: `learn_` harcaması `LEARN_MONTHLY_BUDGET_USD`'ı aşınca 429 + processing duraklar;
   `yt_`/diğer bütçeler etkilenmez.

## Ertelenen testler (v2)
Orchestrator tam-entegrasyon testi Prisma test DB / mock gerektirir; MVP'de deterministik
saf-fonksiyon testleri (srs/qa/chunk/stages) riskli mantığı kapsar. İçerik üretim aşamaları
(LLM) entegrasyon test DB + kayıtlı OpenRouter cevabı ile v2'de eklenebilir.
