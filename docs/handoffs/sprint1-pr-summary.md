# PR: Sprint 1 — "Bugün + Tek Motor" (feature/sprint1-bugun-tek-motor)

FIRST-SPRINT.md'nin 20 maddelik kapsamının tamamı. DB migration YOK, yeni ekran YOK,
immutable semboller korundu, manual-publish invariant korundu.

> Branch zinciri: `master` ← `fix/audit-p1-stability` (henüz merge edilmedi)
> ← `feature/sprint1-bugun-tek-motor` (bu PR, +8 commit). P1 branch'i önce
> merge edilmezse bu PR onun commit'lerini de içerir.
> Not: planning docs korpusu (`docs/cemos-v2-planning/`) ayrı commit'te dahildir.

## Wave commit'leri

| Commit | İçerik |
|---|---|
| `a0bbb61` | **Wave 1 — Model katmanı:** YENİ `presets.ts` (9 preset + resolvePreset + startup lint), `generateJsonGated({preset})`, openrouter `json_schema strict` + degrade zinciri + Anthropic `cache_control` + provider order/data_collection; dalga-1 migration (draft-pipeline writer/judge/editor + newsAi ×4 → gated, tam 1 UsageLog+purpose, çift-maliyet fix); `typecheck` script |
| `f9b02e2` | **Wave 2 — Tek motor kalite:** YENİ `account-adapter.ts` (scorer → canlı accounts.ts, Türkçe fold + eşlenebilir forbiddenTerms), `DraftScore.novelty`, YENİ `scoreSignals.ts` (8 alt-sinyal + leaks garantisi + kalite kapısı: high-leak / TR<55 / yasak-klişe → `needs_edit` + Türkçe neden), YENİ `banned-phrases.ts` (tek kaynak + soru-CTA lint), publishScore TN cap |
| `9e52648` | **Docs:** cemos-v2 planlama korpusu (24 doküman) |
| `7423bd9` | **Wave 3 — Sinyal kabloları + plumbing:** edit-distance (reason'a JSON merge, kullanıcı nedeni korunur), vector-memory:304 fix (pattern retrieval gerçek embedding; 256/1536 boyut-uyumsuzluğu → cosine 0 bug'ı kapandı), VoiceProfile → writer SYSTEM prompt (grounding §1.7 kaldırıldı, tek enjeksiyon), idempotency `generate-morning:{date}:{account}` (LLM öncesi erken dönüş), YENİ `instrumentation.ts` (isim-bazlı secret fail-fast + preset lint; Next 16 docs doğrulandı), golden set standı (51 vaka + `MODE: score_direct` LLM'siz deterministik gate + idempotent seed), cron `0 3 * * *` |
| `fcd3fae` | **Wave 4 — Bugün yüzeyi:** tek satır sayaç ("N taslak seni bekliyor (grafikcem X · maskulenkod Y) · ● sağlıklı"), ReadinessGate yalnız sorunda görünür, ReviewQueue fold üstü + NEXT UP + "Bugünlük bitti ✓", ayrışık sinyal çipleri (tek viral sayı YOK), needs_edit görünür+düzenlenebilir+uyarılı, YENİ `ui/ErrorState` + 6 bileşende error≠empty |
| `ee3b968` | **Docs:** later.md (kapsam-dışı bulgular) |
| `8063765` | **KRİTİK FIX:** dated slug'lar (örn. `claude-sonnet-5-20260630`) gerçek OpenRouter kataloğunda YOK → canlı doğrulanmış tarihsiz canonical slug'lara geçiş; YENİ `verify:catalog` script (eksik slug/erişilemeyen katalog = exit 1 — sessiz mock fallback drift'i saklayamaz) |
| `f0cc90d` | **Docs:** FINAL-OPENROUTER-ROUTING.md slug revizyonu (canlı katalog otoriter) + later.md legacy eval takibi |

## Acceptance (FIRST-SPRINT §5)

| # | Kriter | Durum |
|---|---|---|
| 1 | Kuyruk fold üstü · tek satır sayaç · tek-tik readiness · Bugünlük bitti ✓ | PASS (screenshot) |
| 2 | Primary task ≤2 adım · 320/390/1280/1440 overflow yok | PASS (4 viewport screenshot) |
| 3 | Error ≠ empty (günlük yüzeyler + kütüphane/feed) | PASS |
| 4 | Draft yolunda `growth-engine/account-profiles` import'u yok | PASS (grep=0; dosya durur, Sprint 2'de silinir) |
| 5 | `QueueItem.scores` 8 alt-sinyal + `leaks[]`; UI tek sayı göstermez | PASS |
| 6 | High-leak / cap-altı TR doğallık → `needs_edit` + Türkçe neden | PASS |
| 7 | Yasak-ifade/klişe-CTA lint deterministik (seed'li testler) | PASS |
| 8 | Dalga-1'de raw `generateJson` yok; çağrı başına 1 UsageLog + purpose | PASS (kod+test; canlı LLM kanıtı → DOĞRULANAMADI, 402) |
| 9 | Preset lint + writer≠judge registry testi yeşil | PASS |
| 10 | Aynı gün+hesap 2. `generate-morning` = 0 yeni QueueItem/UsageLog | PASS (canlı: `created:1` → `attempts:0, idempotent_skip`, 3.3s) |
| 11 | Edit-distance saklı · pattern retrieval ≠ `local_fallback` | PASS |
| 12 | Eksik zorunlu secret → isim-bazlı fail-fast (değer asla loglanmaz) | PASS |
| 13 | Golden set ≥40 · `eval:run --all` | PASS — 51 vaka, 51/51 golden PASS (detay ↓) |
| 14 | Mevcut testler + build + typecheck yeşil | PASS |

## Test sonuçları

- `npm test`: **1063/1063** (vitest; +~70 yeni test: preset lint, adapter, kalite kapısı,
  banned-phrase, edit-distance, dimension-mismatch regresyonu, idempotency, secrets, golden set)
- `npm run typecheck` (tsc --noEmit): temiz
- `npm run lint`: 0 error (5 baseline warning, bu PR'dan değil)
- `npm run build` (prisma generate + next build): OK
- `npm run verify:catalog`: OK — 9 preset primary+fallback canlı katalogda
- `npm run eval:run -- --all`: 57 PASS / 2 PARTIAL / 2 FAIL (61)
  - **Sprint 1 golden direct gate: 51/51 PASS** (bilinen-kötü hepsi düşük, bilinen-iyi hepsi geçer — LLM'siz deterministik)
  - 4 non-PASS'ın tümü **legacy** research-ingest testleri (virality/hook eşik hedefleri) — **non-blocking**, later.md'de takip kaydı var; kredi eklenince gerçek-LLM skorlarıyla yeniden koşulacak
- Playwright/browser: Bugün 320/390/1280/1440 doğrulandı; NEXT UP + ayrışık sinyaller +
  edit-gate akışı görüldü; console error 0; screenshot'lar session scratchpad'inde

## DOĞRULANAMADI (hepsi tek kök neden: OpenRouter 402 Insufficient credits)

- Canlı gerçek-LLM writer/judge üretimi — slug fix sonrası "invalid model ID" hataları
  kayboldu, tüm modeller **402** döndü → fail-soft mock. Kod provider'a doğru ulaşıyor;
  kredi eklenince kendiliğinden çalışır.
- eval gen-testlerinin gerçek-LLM kanıtı (heuristik fallback critic ile koştu).
- Anthropic `cache_control` gerçek istek şekli canlıda gözlemlenemedi (kod + unit test var).

## Deployment notu

1. **OpenRouter kredisi ekle** (402'nin tek çözümü).
2. `npm run verify:catalog` + tek `generate-morning` smoke → `usedMock:false` +
   UsageLog'da `writer_`/`judge_` purpose satırları görülmeli.
3. **Vercel Deployment Protection ON kalsın** (app hâlâ public — bekleyen P1 aksiyonu);
   `CRON_SECRET` / `CREDENTIAL_ENC_KEY` env'leri tanımlı olmalı.
4. Not: 2026-07-09 İstanbul günü için 2 mock taslak doğrulama sırasında üretildi;
   yarınki 03:00 UTC cron idempotent-skip yapar.
