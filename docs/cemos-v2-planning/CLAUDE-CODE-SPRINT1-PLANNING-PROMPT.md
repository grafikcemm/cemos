# CEMOS V2 — CLAUDE CODE SPRINT 1 PLANNING AND IMPLEMENTATION PROMPT

Bu prompt, araştırma ve master blueprint aşaması tamamlandıktan sonra Claude Code'a verilecek güncel uygulama promptudur.

Artık yeni araştırma raporu üretme. Mevcut `/docs/cemos-v2-planning/` dokümanlarını bağlayıcı kaynak kabul et, Sprint 1'i planla ve uygula.

---

## 0. Görev

Sen CemOS repo'sunda çalışan Claude Code'sun.

Hedefin:

> Sprint 1 — "Bugün + Tek Motor" kapsamını uygulamak.

Bu sprintin amacı Ali Cem'in CemOS'u her gün açıp X içeriklerini 5 dakikadan kısa sürede kontrol edebileceği, sade ve güvenilir bir günlük çalışma yüzeyi oluşturmaktır.

Araştırma ve master plan zaten tamamlandı. Bu görevde:

- yeni research dokümanı yazma,
- master planı yeniden tartışma,
- kapsamı büyütme,
- V1/V2 özelliklerini Sprint 1'e çekme.

Önce kısa bir uygulama planı çıkar; sonra planı uygula.

---

## 1. Bağlayıcı Dokümanlar

Önce sırayla oku:

1. `AGENTS.md`
2. `docs/CEMOS.md`
3. `docs/cemos-v2-planning/RESEARCH-SYNTHESIS.md`
4. `docs/cemos-v2-planning/FIRST-SPRINT.md`
5. `docs/cemos-v2-planning/IMPLEMENTATION-HANDOFF.md`
6. `docs/cemos-v2-planning/FINAL-OPENROUTER-ROUTING.md`
7. `docs/cemos-v2-planning/FINAL-UX-SPEC.md`
8. `docs/cemos-v2-planning/FINAL-EVALUATION-SPEC.md`
9. `docs/cemos-v2-planning/research/_repo-baseline.md`

Bu dokümanlar çelişirse öncelik sırası:

1. `AGENTS.md` ve `docs/CEMOS.md`
2. `FIRST-SPRINT.md`
3. `IMPLEMENTATION-HANDOFF.md`
4. `FINAL-OPENROUTER-ROUTING.md`
5. diğer final spec'ler
6. research raporları

Research raporlarını yeni gereksinim gibi kabul etme. `RESEARCH-SYNTHESIS.md` ve `FIRST-SPRINT.md` rulings bağlayıcıdır.

---

## 2. Değişmez CemOS Kuralları

Şunları asla yeniden adlandırma veya taşıma:

- `useXAgentStore`
- `useCemOsStore` alias'ı
- localStorage key `"xagent-store"`
- `XAgentApp.tsx`
- `src/store/xagent.ts`
- mevcut HTTP User-Agent kimlikleri
- `cemos-ui-collapsed`

Kural:

- Marka adı CemOS.
- Kod içi legacy semboller bilinçli korunur.
- Manual publish invariant korunur: sistem taslak üretir, yayın kararını insan verir.
- Sprint 1'de DB migration yok.
- Yeni top-level ekran yok.
- Yeni agent platformu yok.
- Rakip intelligence, Reels verifier, SeriesProfile, MemoryFact, nav 16→5 dönüşümü Sprint 1 dışıdır.
- Next.js 16 kullanılıyor. Next API veya convention değişikliği gerekiyorsa önce `node_modules/next/dist/docs/` içindeki ilgili dokümanı oku.

---

## 3. Sprint 1 Kapsamı

Kapsam tam olarak `FIRST-SPRINT.md` §2'deki 20 maddedir.

Özet:

### A. Bugün Yüzeyi

- `ReviewQueue` fold üstüne alınır.
- `MorningHeroStats` tek satır sayaç haline gelir.
- `OperatorReadinessGate` sağlıklıyken tek tik olur; yalnız sorun varsa genişler.
- `DigestSection` ve bento içerikler fold altına ve daha sessiz hale gelir.
- `NEXT UP` affordance ve kuyruk bitince `Bugünlük bitti ✓` durumu eklenir.
- Feed/kütüphane ekranlarında error state empty state'ten ayrılır.

### B. Tek X Motoru

- `scorer.ts` ve `leak-detector.ts`, `accounts.ts` kimliğine adapter ile bağlanır.
- Günlük draft yolunda `growth-engine/account-profiles` import'u kalmaz.
- Judge kazananı ayrışık alt-sinyaller taşır:
  - `personaMatch`
  - `hookStrength`
  - `clarity`
  - `turkishNaturalness`
  - `novelty`
  - `risk`
  - `sourceFaithfulness`
  - `payoff`
  - `leaks[]`
- Bu sinyaller `QueueItem.scores` JSON'a yazılır.
- UI tek viral sayı göstermemeli; ayrışık skor çubukları veya sinyal blokları göstermeli.
- Yüksek şiddet leak `active` olamaz; `needs_edit` + Türkçe `lintReport` notu gerekir.
- Deterministik Türkçe klişe/soru-CTA lint'i `qualityLintService` içinde çalışır.

### C. Model Preset Katmanı

- Yeni `src/lib/ai/presets.ts`
- `resolvePreset`
- `generateJsonGated({ preset })`
- startup lint
- writer ailesi ile judge ailesi farklı mı registry testi
- `model-config.ts` default map'i 2026-07 pinli slug'lara güncellenir.
- Dalga 1 migration:
  - writer
  - judge
  - news-extract
- Anthropic `cache_control` writer/judge statik bloklarında kullanılır.

### D. Sinyal Kabloları

- `edited` FeedbackEvent için normalized Levenshtein edit-distance hesaplanır ve saklanır.
- `src/lib/growth-engine/vector-memory.ts:304` bug fix: gerçek embedding varsa onu kullan; local-hash yalnız fallback.
- Approved/edited/rejected FeedbackEvent örnekleri memory-context'e akar.
- `VoiceProfile`, `buildDraftSystemPrompt` içine bağlanır.

### E. Plumbing

- Idempotency key: `generate-morning:{date}:{account}` + discovery.
- İkinci aynı gün+hesap çağrısı yeni QueueItem/UsageLog harcaması üretmemeli.
- Startup secret assertion isim bazlı fail-fast yapar, secret value loglamaz.
- `package.json` içine `typecheck` script'i eklenir: `tsc --noEmit`.
- Eval golden set standı kurulur.
- `generate-morning` cron'u `0 3 * * *` UTC olur.

---

## 4. Açıkça Out Of Scope

Şunları yapma:

- Yeni DB migration veya tablo.
- Yeni ekran veya nav redesign.
- Full CemOS dark UI redesign.
- Instagram competitor intelligence.
- Reels verifier veya Reels Dossier.
- Monthly planner.
- MemoryFact, SeriesProfile, DNA tabloları.
- Full 14 alt-skor seti.
- Council birleşimi.
- Kalan tüm raw model çağrılarının migration'ı.
- pgvector.
- pixelspor entegrasyonu.
- Auto-posting.
- Auth/workspace/user sistemi.

Yeni fikir bulursan kodlama. `docs/cemos-v2-planning/later.md` dosyasına kısa not düş.

---

## 5. Uygulama Sırası

Önce repo durumunu kontrol et:

```bash
git status --short
git branch --show-current
```

Kirli worktree varsa kullanıcının değişikliklerini koru. İlgisiz dosyaları revert etme.

Sonra şu sırayla çalış:

1. `src/lib/ai/presets.ts` contract'ı.
2. `generateJsonGated({ preset })` API'si ve compatibility.
3. Preset lint + writer-family != judge-family testi.
4. `model-config.ts` pinli default map.
5. Dalga 1 OpenRouter migration: writer/judge/news-extract.
6. Alt-sinyal ve leak gate adapter'ları.
7. `QueueItem.scores` yazımı ve UI gösterimi.
8. Bugün reorder ve queue-first UX.
9. Error state ayrımı.
10. Feedback/edit-distance, vector-memory fix, VoiceProfile wiring.
11. Idempotency, secret assertion, typecheck script, cron.
12. Eval golden set ve testler.

Her davranış değişikliği için önce test yaz veya mevcut testi güncelle.

---

## 6. Dokunulacak Dosya Alanları

Beklenen dosya alanları:

- `src/lib/ai/presets.ts` yeni
- `src/lib/ai/model-config.ts`
- `src/lib/ai/generateGated.ts`
- `src/lib/ai/openrouter.ts`
- `src/lib/ai/draft-pipeline.ts`
- `src/lib/ai/prompts.ts`
- `src/lib/ai/grounding.ts`
- `src/lib/services/draftService.ts`
- `src/lib/services/qualityLintService.ts`
- `src/lib/growth-engine/scorer.ts`
- `src/lib/growth-engine/leak-detector.ts`
- `src/lib/growth-engine/vector-memory.ts`
- `src/lib/growth-engine/feedback-service.ts`
- `src/components/tabs/MorningDashboardTab.tsx`
- `src/components/morning/*`
- ilgili feed/kütüphane tab error state bileşenleri
- `src/app/api/cron/generate-morning/route.ts`
- `vercel.json`
- `package.json`
- `scripts/run-eval-tests.ts`
- gerekli test dosyaları

Beklenmeyen geniş refactor yapma.

---

## 7. Model Routing Contract

`FINAL-OPENROUTER-ROUTING.md` bağlayıcıdır.

Özellikle:

- `cemos-writer` primary: `anthropic/claude-sonnet-5-20260630`
- `cemos-final-judge` primary: `openai/gpt-5.5-20260423`
- writer ailesi ve judge ailesi farklı olmalı.
- floating model primary olamaz.
- floating model yalnız fallback olabilir.
- her gated call `purpose` prefix taşımalı.
- `UsageLog.meta.purpose` boş kalmamalı.
- bütçe aşımında LLM çağrısı ateşlenmemeli.
- `wrapUntrustedData` çiti taşınan her çağrıda korunmalı.
- structured output destekleniyorsa `json_schema strict`; 400/422'de mevcut degrade davranışı korunur.

---

## 8. UI Contract

Sprint 1 UI hedefi full redesign değil, günlük kullanım odağıdır.

Bugün ekranında:

- fold üstünde ReviewQueue olmalı.
- tek satır sayaç görünmeli.
- health sadece sorun varsa genişlemeli.
- ilk bekleyen taslak `NEXT UP` olarak açıkça görünmeli.
- kullanıcı taslağı inline düzenleyip kopyalayabilmeli.
- kuyruk bitince `Bugünlük bitti ✓` görünmeli.
- ayrı skor/sinyal alanları görünmeli.
- tek ve kesin `viral score` gibi bir sunum olmamalı.

320px, 375px, 640px ve desktop genişlikte overflow olmamalı.

---

## 9. Test ve Doğrulama

Bitti demeden şu komutları çalıştır:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run eval:run -- --all
```

Sonra dev server başlat ve Playwright/browser ile doğrula:

- desktop `1440x1000`
- laptop `1280x800`
- mobile `390x844`
- mümkünse `320px` dar genişlik

Kontrol et:

- Bugün açılıyor.
- ReviewQueue fold üstünde.
- NEXT UP görünür.
- Skorlar ayrışık.
- Tek viral sayı yok.
- Inline edit → kopyala akışı çalışıyor.
- Error state empty state'ten ayrılmış.
- Console error yok.
- Mobile overflow yok.

Idempotency doğrula:

- `/api/cron/generate-morning` aynı gün+hesap için iki kez çağrıldığında ikinci çağrı yeni QueueItem/UsageLog üretmemeli.

Grep guard:

- immutable semboller rename edilmemiş.
- daily draft yolunda `growth-engine/account-profiles` import'u yok.
- writer/judge/news-extract dalga 1 yollarında raw `generateJson` kalmamış.

---

## 10. Acceptance Criteria

`FIRST-SPRINT.md` §5'teki tüm maddeler PASS olmalı.

Özellikle:

- Bugün queue-first.
- Primary task <= 2 adım.
- Error != empty.
- Alt-sinyaller `QueueItem.scores` içinde.
- High leak => `needs_edit`.
- Lint deterministik testlerle yakalanıyor.
- Gated calls UsageLog + purpose yazıyor.
- Preset lint ve writer!=judge testleri yeşil.
- Idempotency yeni harcamayı engelliyor.
- Edit-distance saklanıyor.
- VoiceProfile promptta kullanılıyor.
- Golden set çalışıyor.
- Mevcut testler ve build yeşil.

Her acceptance item için kanıt göster.

---

## 11. Çalışma Biçimi

- Küçük, geri alınabilir değişiklikler yap.
- Büyük refactor yerine adapter ve compatibility kullan.
- User değişikliklerini revert etme.
- Scope dışı bulguları `later.md` içine taşı.
- Hata yakalarsan düzelt, ama kapsam dışı mimari genişletmeye çevirme.
- Çalışmayan testi gizleme veya skip etme.
- Secret value loglama.
- Production veri silme/değiştirme.

---

## 12. Final Rapor Formatı

Finalde kısa rapor ver:

- Değişen dosyalar
- Sprint 1 maddelerine göre PASS/FAIL listesi
- Çalıştırılan testler ve sonuçları
- Playwright/browser doğrulama notları ve screenshot path'leri
- Kalan riskler
- Yapılmayan out-of-scope işler
- Bir sonraki önerilen adım

Eğer bir komut çalıştırılamadıysa açıkça yaz:

```text
DOĞRULANAMADI: <komut veya kontrol> — neden: <sebep>
```

Asla doğrulanmamış şeyi geçmiş sayma.

