# Sprint 1 Handoff — Compact Devam Özeti (2026-07-09)

## 1. Branch + son commit
- Branch: `feature/sprint1-bugun-tek-motor` (base: `fix/audit-p1-stability`, o da master'a merge edilmedi)
- HEAD: `df3a84a` (docs(handoff): Sprint 1 PR ozeti) · 10 commit · working tree TEMİZ · **push edilmedi, deploy edilmedi**
- Remote: `origin = github.com/grafikcemm/cemos`

## 2. Tamamlanan wave'ler
| Wave | Commit | İçerik |
|---|---|---|
| 1 Model katmanı | `a0bbb61` | presets.ts (9 preset+lint), generateJsonGated({preset}), openrouter json_schema/cache_control/provider, dalga-1 migration (draft-pipeline + newsAi), typecheck script |
| 2 Tek motor kalite | `f9b02e2` | account-adapter (scorer→accounts.ts, foldTurkish), novelty, scoreSignals (8 sinyal+leaks garanti, kalite kapısı→needs_edit), banned-phrases tek kaynak |
| docs | `9e52648` | planning korpusu (24 doküman) |
| 3 Sinyal+plumbing | `7423bd9` | edit-distance (reason JSON merge), vector-memory:304 fix, VoiceProfile→system prompt, idempotency, instrumentation.ts (secret fail-fast+preset lint), golden set 51 vaka + score_direct, cron `0 3 * * *` |
| 4 Bugün UI | `fcd3fae` | tek satır sayaç, sessiz gate, NEXT UP, Bugünlük bitti ✓, ayrışık sinyal çipleri, ui/ErrorState + 6 bileşende error≠empty |
| later | `ee3b968` | later.md |
| KRİTİK slug fix | `8063765` | dated slug'lar OpenRouter'da YOK → canlı tarihsiz canonical slug'lar + `npm run verify:catalog` |
| docs revizyon | `f0cc90d` | FINAL-OPENROUTER-ROUTING.md slug düzeltmesi + later.md legacy eval takibi |
| PR özeti | `df3a84a` | docs/handoffs/sprint1-pr-summary.md |

## 3. PR-ready vs deploy-ready
- **PR-ready: EVET** — kabul edildi; PR body = `docs/handoffs/sprint1-pr-summary.md`. Zincir: master ← fix/audit-p1-stability ← sprint1 (P1 önce merge edilmezse PR onu da içerir).
- **Deploy-ready: HAYIR** — OpenRouter kredisi bitik (402); canlı writer/judge mock'a düşer. Kredi + smoke olmadan deploy anlamsız.

## 4. Kalan zorunlu kapanış işleri
- ~~FINAL-OPENROUTER-ROUTING.md slug düzeltmesi~~ → **TAMAM** (`f0cc90d`)
- ~~eval legacy PART/FAIL açıklaması~~ → **TAMAM** (later.md "Eval — legacy vaka takibi"; 4 vaka non-blocking)
- **[USER] OpenRouter kredi ekle** → sonra `npm run verify:catalog` + 1× `generate-morning` smoke (CRON_SECRET bearer ile; beklenen: `usedMock:false` + UsageLog'da `writer_`/`judge_` purpose satırları)
- **[USER] Vercel Deployment Protection ON** (app hâlâ public — P1'den beri bekliyor) + `CRON_SECRET`/`CREDENTIAL_ENC_KEY` env
- Push + PR aç (onay bekliyor; `gh pr create` hazır)

## 5. Testler ve sonuçlar
- `npm test`: **1063/1063** (120 dosya) · `npm run typecheck`: temiz · `npm run lint`: 0 error (5 baseline warning)
- `npm run build`: OK · `npm run verify:catalog`: OK (9 preset canlı katalogda)
- `npx tsx scripts/seed-eval-golden.ts`: 51 vaka, idempotent (2. koşu 0 yeni)
- `npm run eval:run -- --all`: 57 PASS / 2 PARTIAL / 2 FAIL (61) — **51/51 golden PASS**; 4 non-PASS legacy (later.md)
- Playwright: Bugün 320/390/1280/1440 ✓, NEXT UP + ayrışık sinyaller ✓, edit-gate ✓, console error 0
- Canlı idempotency: call1 `created:1` → call2 `attempts:0, reason:idempotent_skip:...` (3.3s, LLM'siz)

## 6. DOĞRULANAMADI (tek kök neden: OpenRouter **402 Insufficient credits**)
- Canlı gerçek-LLM writer/judge üretimi (slug fix sonrası invalid-model hataları bitti, 402 geldi → fail-soft mock; kod doğru)
- eval gen-testlerinin gerçek-LLM kanıtı (heuristik fallback critic ile koştu)
- Anthropic cache_control canlı istek şekli (kod+unit test var)

## 7. Invariant'lar (dokunma)
- Rename YASAK: `useXAgentStore`/`useCemOsStore`, localStorage `"xagent-store"`, `XAgentApp.tsx`, `src/store/xagent.ts`, HTTP User-Agent'lar, `cemos-ui-collapsed`
- DB migration YOK (Sprint 1 boyu sıfır; edit-distance `reason`'da, pattern embedding sorgu-anı cache'te bu yüzden)
- Manual publish invariant: sistem taslak üretir, yayını insan yapar; edit-gate korunur
- `account-profiles.ts` SİLİNMEZ (Sprint 2 eval-parity sonrası; 9 tüketici kaldı)
- Sprint 1 scope dışına çıkma; yeni fikir → `docs/cemos-v2-planning/later.md`

## 8. Compact sonrası İLK adım
Kullanıcı OpenRouter kredisi ekledi mi sor. Ekledi ise:
```
npm run verify:catalog
# dev server (port 3002; 3000/3001 kullanıcının diğer app'leri!)
npx next dev --webpack -p 3002
# CRON_SECRET .env.local'den (değeri asla yazdırma):
curl -H "Authorization: Bearer $SECRET" "http://localhost:3002/api/cron/generate-morning?handle=grafikcem"
```
Beklenen: `usedMock:false`, UsageLog'da `writer_x_draft`/`judge_x_critique` satırları. Sonra push + PR onayı iste.
(Not: Neon pool hassas — dev server + script'ler aynı anda pool timeout verebilir; script'lerde retry var.)

## 9. Sprint 2 önerilen ilk kapsam (FIRST-SPRINT/handoff'a göre)
1. **Eval parity + growth-engine draft-generator'ı tek motora bağla** → sonra `account-profiles.ts` sil (9 tüketici migrate)
2. **Dalga 2 migration**: research/memory yolları `generateJsonGated`'a (~68 raw çağrı kaldı)
3. CostsTab preset-bazlı harcama dökümü (meta.preset zaten yazılıyor)
4. Legacy 4 eval vakası gerçek-LLM ile yeniden değerlendir (eşik vs prompt kararı)
5. later.md'deki diğer adaylar: ViralPattern kalıcı embedding kolonu (artık migration serbestse), TR cap kalibrasyonu, klavye kısayolları (V1 UX)
