# CemOS V2 — Sprint 1: "Bugün + Tek Motor"

> **Sözleşme dokümanı.** Kapsam RESEARCH-SYNTHESIS C5 ile kilitli — buradaki listeye ekleme yapılamaz; yeni fikirler "later" listesine gider (ROADMAP Sprint 2-5).
> **Süre:** ≤2 hafta. **Hedef:** Ali Cem CemOS'u her gün açıp X içeriklerini <5 dakikada kontrol edebilsin — sade (odak) ve yayına-hazır taslaklarla (kalite).
> Tarih: 2026-07-08.

---

## 1. Amaç & kullanıcı değeri

- **Amaç:** kök neden #1 (Odak yok) + #2 (Taslak kalitesi) — ikisine aynı sprintte, minimum diff'le vurmak.
- **Kullanıcı değeri:** açılışta tek net eylem listesi ("N taslak seni bekliyor" → incele → düzenle → kopyala/yayınla → "Bugünlük bitti ✓"); taslaklar ayrışık skorlar + leak notlarıyla gelir ve kozmetik düzenlemeyle yayınlanabilir; her kuruş loglu.

## 2. Scope (tam liste — başka bir şey YOK)

**A. Odak (Bugün reorder — `MorningDashboardTab` refine):**
1. `ReviewQueue` fold üstüne; `MorningHeroStats` → tek satır sayaç ("N taslak seni bekliyor · grafikcem X · maskulenkod Y").
2. `OperatorReadinessGate` → sağlıklıyken tek tik; yalnız sorun varken genişler.
3. `DigestSection` + bento → fold altı, varsayılan katlanmış; "Tepki vermeye değer" bölümü ~3 öğeyle sınırlı.
4. "NEXT UP" affordance + kuyruk bitince "Bugünlük bitti ✓" durumu.
5. Feed/kütüphane ekranlarına **ayrı error state** (ReviewQueue retry pattern'i yeniden kullanılır; error ≠ empty).

**B. Kalite (X motor birleştirme — Low):**
6. Tek hesap kimliği: `scorer.ts` + `leak-detector.ts` adapter'la `accounts.ts`'e bağlanır; draft yolunda `growth-engine/account-profiles` import'u kalmaz (dosya SİLİNMEZ — Sprint 2'de eval parity sonrası).
7. Judge kazananına Sprint decomposed alt-sinyalleri (persona/hook/clarity/turkishNaturalness/novelty/risk/sourceFaithfulness/payoff) hesaplanır (LLM-önce, deterministik fallback) → `QueueItem.scores` JSON'a yazılır → UI ayrışık çubuklar gösterir (tek sayı yasak).
8. `detectLeaks` bloklayıcı kapıya terfi: yüksek-şiddet leak → `needs_edit` (Türkçe not ile), `active` değil.
9. Deterministik Türkçe klişe/soru-CTA lint'i `qualityLintService`'e (BANNED_PHRASES + regex seti); `turkishNaturalness` publishScore'u caplayen alt-skor olur.

**C. Model katmanı (sıcak yollar):**
10. `model-config.ts` default'ları pinned 2026-07 slug'larına (FINAL-OPENROUTER-ROUTING §1 map).
11. `presets.ts` (9 preset) + `resolvePreset` + `generateJsonGated({preset})`; startup lint (floating primary CI kırar); writer≠judge-ailesi registry testi.
12. Migration dalga 1: writer + judge + news-extract yolları `generateJsonGated`'a; Anthropic `cache_control` writer/judge statik bloklarına.

**D. Sinyal kabloları (ucuz, yüksek etki):**
13. Edit-distance: her `edited` FeedbackEvent'te normalized Levenshtein hesaplanıp saklanır (saf kod).
14. `vector-memory.ts:304` bug fix: `ViralPattern` retrieval'ı gerçek embedding kullanır (local-hash yalnız fallback).
15. FeedbackEvent → retrieval wire-in: approved/edited/rejected örnekler memory-context'e akar.
16. VoiceProfile `buildDraftSystemPrompt`'a bağlanır (bugün yazılıyor ama okunmuyor).

**E. Plumbing:**
17. Idempotency key: `generate-morning:{date}:{account}` + discovery — ikinci çağrı sıfır yeni harcama.
18. Startup secret assertion (isim-bazlı fail-fast); `typecheck` script (`tsc --noEmit`) package.json'a.
19. Eval golden set standı: hesap başına ~30 gerçek iyi + ~10 bilinen-kötü vaka `EvalTest`'e; `eval:run` prompt/model değişim gate'i.
20. Cron saati: `generate-morning` `0 3 * * *` UTC'ye (Hobby ±59dk toleransıyla İstanbul sabahına garanti — C11).

## 3. Out of scope (açıkça)

Yeni tablo/migration (SIFIR) · yeni ekran · nav değişikliği · rakip istihbaratı · MemoryFact/DNA tabloları · SeriesProfile · Reels/verifier · tam 14 alt-skor seti · council birleşimi · kalan ~72 çağrının migration'ı · pgvector · pixelspor.

## 4. Bağımlılıklar & sıra

`presets.ts` (madde 11) her şeyden önce iner (B/C/D maddelerinin contract'ı). Sonra paralel: A (bağımsız) ‖ B(6-9, 11 sonrası) ‖ C(10,12) ‖ D(13-16) ‖ E(17-20). DB değişikliği: **yok**.

## 5. Kabul kriterleri

- [ ] Bugün: kuyruk fold üstü; sayaç tek satır; readiness sağlıklıyken tek tik; "Bugünlük bitti ✓" render olur.
- [ ] Primary task ≤2 adım; Time-to-First-Approve <60 sn (320/375/640/1440 click-path audit).
- [ ] Günlük yüzeylerde error ≠ empty (test).
- [ ] Draft yolunda `growth-engine/account-profiles` import'u yok (grep testi).
- [ ] Her günlük QueueItem `scores`'ta ayrışık alt-sinyaller + leak listesi taşır; UI tek sayı göstermez.
- [ ] Yüksek-şiddet leak'li veya cap-altı turkishNaturalness'li taslak `active` olamaz → `needs_edit` + Türkçe neden.
- [ ] Yasak-ifade/klişe-CTA lint'i deterministik yakalar (seed'li testler).
- [ ] Writer/judge/news-extract yollarında raw `generateJson` kalmadı (assert); her çağrı 1 UsageLog satırı + purpose.
- [ ] Preset lint + writer≠judge registry testi CI'da yeşil.
- [ ] Aynı gün+hesap için ikinci `generate-morning` çağrısı: taslak 1 kez, yeni harcama 0.
- [ ] Edit-distance her `edited` event'te saklı; pattern retrieval `provider!=="local_fallback"` (kalıcı vektörlerde).
- [ ] Eksik zorunlu secret → isim-bazlı fail-fast.
- [ ] Golden set ≥40 vaka; `eval:run --all` yeşil; Türkçe-doğallık/leak-recall regresyonu CI'ı kırar.
- [ ] Mevcut ~994 test + `next build` + `typecheck` + Playwright smoke yeşil.

## 6. Testler

Vitest: alt-sinyal hesaplama sınır durumları · leak-gate yönlendirme · lint seed'leri · adapter shape · idempotency · edit-distance · preset resolution/lint · registry aile testi · fence-kapsam testi. Playwright: Bugün akışı (onay yolculuğu) + 320px overflow. `eval:run` golden koşusu.

## 7. Rollback

- UI reorder: bileşen düzeni revert (state anahtarları değişmedi — risksiz).
- Motor: adapter katmanı sayesinde eski yol dosyaları yerinde; `MODEL_PROFILE`/env ile eski default'lara dönüş mümkün; preset katmanı additive (kullanan çağrılar `role` fallback'iyle çalışmayı sürdürür).
- Migration dalga 1 geri alınabilir (çağrı bazında revert); UsageLog fazlası zararsız.
- DB rollback konusu yok (migration yok).

## 8. Demo senaryosu (sprint kapanışı)

Sabah 07:00 İstanbul: operatör CemOS'u açar → "5 taslak seni bekliyor (grafikcem 3 · maskulenkod 2) · ● sağlıklı" → NEXT UP kartında taslak + ayrışık skor çubukları (kanca 78 · ses 85 · TR-doğallık 90 · risk 12 · leak 0) → bir taslakta "kanca zayıf" leak notu + `needs_edit` rozeti görür → inline düzenler → Kopyala/X'te aç → 5 kartı <5 dakikada bitirir → "Bugünlük bitti ✓" → CostsTab'de günün harcaması preset bazında görünür.
